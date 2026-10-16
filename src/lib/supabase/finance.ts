import "server-only";
import { getSupabaseServerClient } from "./server";
import { fetchAll } from "./page";
import { listExpenses } from "./expenses";
import { amountValue, roundToTen } from "@/lib/amount";
import { moroccoDate } from "@/lib/morocco-day";
import { orderLines, type CatalogueEntry } from "@/lib/order-lines";
import {
  adResults,
  financeSummary,
  monthlyBreakdown,
  monthsIn,
  type AdResult,
  type FinanceSummary,
  type OrderFact,
} from "@/lib/finance/profit";

/**
 * Les chiffres de la page Finance, pris sur les vraies commandes et les
 * vraies charges.
 *
 * La page en affichait d'inventes depuis la maquette. Tout part
 * desormais d'ici : le revenu des commandes remises au client, les
 * charges telles qu'elles ont ete saisies, et ce qui reste entre les
 * deux.
 */

const DELIVERED = "DELIVERED";

/** Codes qui disent qu'un colis ne sera pas remis. Les memes qu'ailleurs. */
const FAILED = new Set(["RETURNED", "REFUSE", "CANCELED", "OUT_OF_AREA"]);

/** Nombre de mois montres par la courbe. */
const MOIS_COURBE = 6;

type LeadRow = {
  created_at: string;
  status: string | null;
  amount: string | null;
  product_name: string | null;
  stock_items: string | null;
  tracking_number: string | null;
  delivery_status_code: string | null;
  delivery_date: string | null;
};

type ProductRow = { id: string; name: string; forcelog_ref: string | null };

export type FinanceOverview = FinanceSummary & {
  /** Revenu, charges et profit mois par mois, pour la courbe. */
  monthly: { month: string; revenue: number; expenses: number; profit: number }[];
  /** Commandes encore en route : leur encaissement reste a venir. */
  inTransit: { orders: number; amount: number };
  /**
   * Les campagnes, jugees sur les commandes recues pendant leur
   * diffusion. Elles ne suivent pas la periode affichee : une campagne
   * se mesure sur sa propre fenetre, du premier au dernier jour.
   */
  ads: AdResult[];
};

/**
 * Le jour marocain d'une date du transporteur.
 *
 * `delivery_date` arrive sous la forme "AAAA-MM-JJ HH:MM", deja a
 * l'heure du Maroc : on en prend les dix premiers caracteres plutot que
 * de la relire dans le fuseau du serveur, qui la ferait basculer d'un
 * jour.
 */
function jourLivraison(date: string | null): string | undefined {
  const jour = (date ?? "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(jour) ? jour : undefined;
}

/**
 * Les produits du catalogue que contient une commande.
 *
 * Par code article d'abord, qui est exact, puis par nom. Sans cette
 * correspondance, une charge visant un produit ne trouverait jamais
 * les commandes qui la declenchent.
 */
function produitsDe(
  row: LeadRow,
  catalogue: (CatalogueEntry & { id: string })[]
): string[] {
  if (catalogue.length === 0) return [];
  const lignes = orderLines(
    {
      productName: row.product_name ?? undefined,
      stockItems: row.stock_items ?? undefined,
    },
    catalogue
  );
  const ids = new Set<string>();
  for (const ligne of lignes) {
    const trouve = catalogue.find(
      (p) =>
        (ligne.ref && p.forcelogRef === ligne.ref) ||
        p.name.trim().toLowerCase() === ligne.name.trim().toLowerCase()
    );
    if (trouve) ids.add(trouve.id);
  }
  return [...ids];
}

function toFact(
  row: LeadRow,
  catalogue: (CatalogueEntry & { id: string })[]
): OrderFact {
  const code = row.delivery_status_code ?? "";
  const delivered = code === DELIVERED;
  const shipped = Boolean(row.tracking_number);
  return {
    createdDay: moroccoDate(new Date(row.created_at)),
    deliveredDay: jourLivraison(row.delivery_date),
    // Une commande partie chez le transporteur est passee par la
    // confirmation : c'est elle qui declenche l'envoi.
    confirmed: row.status === "Confirme" || shipped,
    shipped,
    delivered,
    returned: FAILED.has(code),
    productIds: produitsDe(row, catalogue),
    // Le livreur encaisse le compte rond annonce au client, celui que
    // l'application affiche : c'est lui le revenu, pas le prix a
    // l'unite pres.
    revenue: delivered ? roundToTen(amountValue(row.amount ?? undefined) ?? 0) : 0,
  };
}

/**
 * Le compte de la periode demandee, ou de tout l'historique.
 *
 * Sans bornes, la periode va de la premiere commande a aujourd'hui :
 * c'est ce que veut dire "profit total".
 */
export async function getFinanceOverview(
  from?: string,
  to?: string
): Promise<FinanceOverview> {
  const supabase = getSupabaseServerClient();

  const [rows, expenses, produits] = await Promise.all([
    fetchAll<LeadRow>(() =>
      supabase
        .from("leads")
        .select(
          "created_at,status,amount,product_name,stock_items,tracking_number,delivery_status_code,delivery_date"
        )
        .order("created_at", { ascending: true })
    ),
    listExpenses(),
    supabase.from("products").select("id,name,forcelog_ref"),
  ]);

  const catalogue = ((produits.data ?? []) as ProductRow[]).map((p) => ({
    id: p.id,
    name: p.name,
    forcelogRef: p.forcelog_ref ?? undefined,
  }));

  const facts = rows.map((r) => toFact(r, catalogue));

  const aujourdhui = moroccoDate();
  const debuts = [
    ...facts.map((f) => f.createdDay),
    ...expenses.map((e) => e.startDate),
  ].sort();
  const debut = from ?? debuts[0] ?? aujourdhui;
  const fin = to ?? aujourdhui;

  const bilan = financeSummary(facts, expenses, debut, fin);

  // La courbe ne montre que les derniers mois : au-dela, les colonnes
  // deviennent illisibles et personne ne compare un mois a celui d'il y
  // a deux ans.
  const tous = monthsIn(debut, fin);
  const monthly = monthlyBreakdown(facts, expenses, tous.slice(-MOIS_COURBE));

  /*
   * Ce qui n'est pas encore encaisse : parti, ni remis ni perdu.
   *
   * Calcule sur les lignes et non sur les faits : un fait ne porte le
   * montant que des commandes livrees, puisque c'est la seule somme
   * reellement entree en caisse.
   */
  const enRoute = rows.filter(
    (r) =>
      r.tracking_number &&
      r.delivery_status_code !== DELIVERED &&
      !FAILED.has(r.delivery_status_code ?? "")
  );

  return {
    ...bilan,
    monthly,
    ads: adResults(facts, expenses, aujourdhui),
    inTransit: {
      orders: enRoute.length,
      amount: enRoute.reduce(
        (s, r) => s + roundToTen(amountValue(r.amount ?? undefined) ?? 0),
        0
      ),
    },
  };
}
