import "server-only";
import { getSupabaseServerClient } from "./server";
import { fetchAll } from "./page";
import { cityKey } from "./cities";
import { amountValue, roundToTen } from "@/lib/amount";

/**
 * Indicateurs du tableau de bord.
 *
 * Tout se compte sur les commandes creees dans la periode : c'est la
 * lecture naturelle d'un tableau de bord — ce que la periode a rapporte
 * — et elle rend la comparaison avec la periode precedente exacte, a
 * duree egale.
 *
 * L'argent n'est compte que sur les commandes livrees. Une commande
 * confirmee n'a rien encaisse tant que le client n'a pas paye le
 * livreur.
 */

const CONFIRMED = new Set(["Confirme", "EXPIDER"]);

/** Commandes encore ouvertes : il reste quelque chose a en faire. */
const PENDING = new Set([
  "Nouveau",
  "En attente",
  "Whatsapp",
  "Rappel",
  "Reportee",
  "+3 jours",
]);

const DELIVERED = "DELIVERED";

export type Kpi = {
  key: string;
  label: string;
  value: number;
  unit?: "MAD";
  subtitle?: string;
  /** Variation par rapport a la periode precedente de meme duree. */
  trend: string;
  trendUp: boolean;
  /** Aucune comparaison possible : le badge reste neutre. */
  neutral?: boolean;
  /** Une valeur par jour de la periode, pour la courbe. */
  spark: number[];
};

type LeadRow = {
  created_at: string;
  status: string;
  ville: string | null;
  amount: string | null;
  item_count: number | null;
  product_name: string | null;
  tracking_number: string | null;
  delivery_status_code: string | null;
};

/** Commandes sans reponse : les deux familles numerotees. */
function isNoAnswer(status: string): boolean {
  return status.startsWith("Pas de rep") || status.startsWith("Injoignable");
}

/**
 * Variation entre deux periodes. Partir de zero n'a pas de pourcentage :
 * on annonce alors la seule chose vraie, qu'il y a du nouveau.
 */
function trendOf(now: number, before: number): { trend: string; trendUp: boolean } {
  if (before === 0) {
    if (now === 0) return { trend: "0%", trendUp: false };
    return { trend: "nouveau", trendUp: true };
  }
  const change = Math.round(((now - before) / before) * 100);
  return { trend: `${change >= 0 ? "+" : ""}${change}%`, trendUp: change >= 0 };
}

/** Les jours de la periode, du plus ancien au plus recent. */
function daysBetween(from: Date, to: Date): string[] {
  const days: string[] = [];
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  // Une periode ouverte se resume aux trente derniers jours : une courbe
  // de six mois sur trois centimetres ne montre rien.
  const start = to.getTime() - cursor.getTime() > 30 * 86400_000
    ? new Date(to.getTime() - 29 * 86400_000)
    : cursor;
  for (let d = new Date(start); d <= to; d.setDate(d.getDate() + 1)) {
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

export async function getDashboardKpis(
  from?: string,
  to?: string
): Promise<{ kpis: Kpi[]; costsKnown: number; costsTotal: number }> {
  const supabase = getSupabaseServerClient();

  const [leads, products, cities] = await Promise.all([
    fetchAll<LeadRow>(() =>
      supabase
        .from("leads")
        .select(
          "created_at,status,ville,amount,item_count,product_name,tracking_number,delivery_status_code"
        )
    ),
    supabase.from("products").select("name,cost_supplier"),
    supabase.from("cities").select("key,name,aliases,tariff").eq("active", true),
  ]);

  // Cout d'achat par produit, quand il est renseigne.
  const costByProduct = new Map<string, number>();
  for (const p of (products.data ?? []) as {
    name: string;
    cost_supplier: number | string | null;
  }[]) {
    const cost = Number(p.cost_supplier);
    if (Number.isFinite(cost) && cost > 0) {
      costByProduct.set(p.name.trim().toLowerCase(), cost);
    }
  }

  // Tarif de livraison par forme de ville rencontree.
  const tariffByCity = new Map<string, number>();
  for (const c of (cities.data ?? []) as {
    key: string;
    name: string;
    aliases: string[] | null;
    tariff: number | string;
  }[]) {
    const tariff = Number(c.tariff);
    tariffByCity.set(c.key, tariff);
    tariffByCity.set(cityKey(c.name), tariff);
    for (const a of c.aliases ?? []) tariffByCity.set(cityKey(a), tariff);
  }

  const end = to ? new Date(to) : new Date();
  const start = from
    ? new Date(from)
    : // Periode ouverte : la plus ancienne commande fait office de debut.
      new Date(
        Math.min(
          ...leads.map((l) => new Date(l.created_at).getTime()),
          end.getTime()
        )
      );

  const span = Math.max(end.getTime() - start.getTime(), 86400_000);
  const previousStart = new Date(start.getTime() - span);

  const inRange = (l: LeadRow, a: Date, b: Date) => {
    const t = new Date(l.created_at).getTime();
    return t >= a.getTime() && t <= b.getTime();
  };

  const current = leads.filter((l) => inRange(l, start, end));
  const previous = leads.filter((l) => inRange(l, previousStart, start));

  /** Les huit mesures, appliquees a n'importe quel lot de commandes. */
  const measure = (rows: LeadRow[]) => {
    const confirmed = rows.filter((l) => CONFIRMED.has(l.status));
    const shipped = rows.filter((l) => l.tracking_number);
    const delivered = rows.filter((l) => l.delivery_status_code === DELIVERED);

    // Encaisse : ce que le livreur a reellement recupere.
    const collected = delivered.reduce(
      (sum, l) => sum + roundToTen(amountValue(l.amount ?? undefined) ?? 0),
      0
    );

    // Profit : l'encaisse moins la marchandise et la livraison. Les
    // produits sans cout renseigne n'entrent pas dans le calcul, faute
    // de quoi leur marchandise serait comptee gratuite.
    let profit = 0;
    for (const l of delivered) {
      const cost = costByProduct.get((l.product_name ?? "").trim().toLowerCase());
      if (cost === undefined) continue;
      const tariff = tariffByCity.get(cityKey(l.ville ?? "")) ?? 0;
      profit +=
        roundToTen(amountValue(l.amount ?? undefined) ?? 0) -
        cost * (l.item_count ?? 1) -
        tariff;
    }

    return {
      leads: rows.length,
      confirmed: confirmed.length,
      pending: rows.filter((l) => PENDING.has(l.status)).length,
      noAnswer: rows.filter((l) => isNoAnswer(l.status)).length,
      shipped: shipped.length,
      delivered: delivered.length,
      collected,
      profit,
    };
  };

  const now = measure(current);
  const before = measure(previous);

  // Une valeur par jour, pour dessiner la courbe.
  const days = daysBetween(start, end);
  const perDay = new Map(days.map((d) => [d, [] as LeadRow[]]));
  for (const l of current) {
    const day = new Date(l.created_at).toISOString().slice(0, 10);
    perDay.get(day)?.push(l);
  }
  const series = days.map((d) => measure(perDay.get(d) ?? []));

  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

  // "Maximum" n'a pas de periode precedente : comparer tout l'historique
  // a l'intervalle qui le precede donne des variations a quatre chiffres
  // qui n'apprennent rien.
  const comparable = Boolean(from);

  const build = (
    key: string,
    label: string,
    pick: (m: ReturnType<typeof measure>) => number,
    extra: Partial<Kpi> = {}
  ): Kpi => ({
    key,
    label,
    value: pick(now),
    ...(comparable
      ? trendOf(pick(now), pick(before))
      : { trend: "total", trendUp: false, neutral: true }),
    spark: series.map(pick),
    ...extra,
  });

  const costsTotal = (products.data ?? []).length;
  const costsKnown = costByProduct.size;

  return {
    costsKnown,
    costsTotal,
    kpis: [
      build("leads", "Leads de la periode", (m) => m.leads),
      build("confirmes", "Confirmes", (m) => m.confirmed, {
        subtitle: `${pct(now.confirmed, now.leads)}%`,
      }),
      build("attente", "En attente", (m) => m.pending, { subtitle: "a traiter" }),
      build("sans-reponse", "Pas de reponse", (m) => m.noAnswer),
      build("expedies", "Expedies", (m) => m.shipped),
      build("livres", "Livres", (m) => m.delivered, {
        subtitle: `${pct(now.delivered, now.shipped)}% des expedies`,
      }),
      build("encaisse", "COGS collecte", (m) => m.collected, { unit: "MAD" }),
      build("profit", "Profit net estime", (m) => m.profit, {
        unit: "MAD",
        // Le lecteur doit savoir sur quoi porte l'estimation : un profit
        // calcule sur un produit sur sept n'est pas le profit de la
        // boutique.
        subtitle:
          costsKnown === 0
            ? "aucun cout renseigne"
            : costsKnown < costsTotal
              ? `${costsKnown}/${costsTotal} produits chiffres`
              : "marge nette",
      }),
    ],
  };
}
