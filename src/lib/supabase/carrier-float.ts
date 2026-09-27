import "server-only";
import { getSupabaseServerClient } from "./server";
import { fetchAll } from "./page";
import { amountValue, roundToTen } from "@/lib/amount";

/**
 * L'argent encaisse par le transporteur et pas encore verse.
 *
 * Le livreur prend l'argent des la remise du colis ; il arrive sur le
 * compte bien plus tard, apres facturation. Entre les deux, la somme
 * n'est ni dans la caisse ni dans les commandes en cours : elle
 * n'apparait nulle part, et c'est souvent le plus gros poste d'un
 * vendeur en paiement a la livraison.
 *
 * Deux etapes se suivent chez ForceLog : "En cours de facturation"
 * juste apres la livraison, puis "Facture". Aucun colis de ce compte
 * n'a jamais porte "Paye" — on ne peut donc pas distinguer une facture
 * emise d'un virement recu, et les deux etapes sont comptees comme dues
 * jusqu'a preuve du contraire.
 */

const DELIVERED = "DELIVERED";

export type CarrierFloat = {
  /** Somme totale encaissee par le transporteur et non versee. */
  amount: number;
  orders: number;
  /** Livre, pas encore facture. */
  pendingInvoice: { amount: number; orders: number };
  /** Facture, versement non constate. */
  invoiced: { amount: number; orders: number };
  /** Jours ecoules depuis la plus ancienne livraison encore due. */
  oldestDays: number | null;
  oldestDate: string | null;
  /** Commandes dues depuis plus d'une semaine. */
  overWeek: number;
};

type Row = {
  amount: string | null;
  payment_status: string | null;
  delivery_status_code: string | null;
  delivery_date: string | null;
};

/** Sans accent ni majuscule : "Facture", "Facture " et "facture" se valent. */
function normalise(value: string | null): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Jours entiers ecoules depuis une date "AAAA-MM-JJ HH:MM".
 *
 * Le fuseau est pose explicitement. Ces dates viennent de ForceLog et
 * sont a l'heure du Maroc ; sans indication, JavaScript les lit dans le
 * fuseau de la machine — celui du serveur en UTC, celui d'un poste au
 * Maroc en UTC+1. Le meme colis affichait donc un age different selon
 * l'endroit, et un jour de plus ou de moins juste au passage du seuil
 * d'une semaine.
 *
 * Le Maroc recule d'une heure pendant le Ramadan : sans consequence ici,
 * un compteur de jours ne se joue pas a soixante minutes pres.
 */
export function daysSince(date: string | null, now: Date = new Date()): number | null {
  if (!date) return null;
  const iso = date.trim().replace(" ", "T");
  const avecFuseau = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}+01:00`;
  const t = Date.parse(avecFuseau);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
}

export async function getCarrierFloat(now: Date = new Date()): Promise<CarrierFloat> {
  const supabase = getSupabaseServerClient();
  const rows = await fetchAll<Row>(() =>
    supabase
      .from("leads")
      .select("amount,payment_status,delivery_status_code,delivery_date")
      .eq("delivery_status_code", DELIVERED)
  );

  let pendingAmount = 0;
  let pendingOrders = 0;
  let invoicedAmount = 0;
  let invoicedOrders = 0;
  let oldestDate: string | null = null;
  let overWeek = 0;

  for (const r of rows) {
    const situation = normalise(r.payment_status);
    // Un virement constate sort du compte : il n'est plus du.
    if (situation.startsWith("paye")) continue;

    // Le montant arrondi, celui que le livreur a reellement reclame.
    const montant = roundToTen(amountValue(r.amount ?? undefined) ?? 0);

    if (situation.startsWith("factur")) {
      invoicedAmount += montant;
      invoicedOrders += 1;
    } else {
      pendingAmount += montant;
      pendingOrders += 1;
    }

    const jours = daysSince(r.delivery_date, now);
    if (jours !== null && jours >= 7) overWeek += 1;
    if (r.delivery_date && (!oldestDate || r.delivery_date < oldestDate)) {
      oldestDate = r.delivery_date;
    }
  }

  return {
    amount: pendingAmount + invoicedAmount,
    orders: pendingOrders + invoicedOrders,
    pendingInvoice: { amount: pendingAmount, orders: pendingOrders },
    invoiced: { amount: invoicedAmount, orders: invoicedOrders },
    oldestDays: daysSince(oldestDate, now),
    oldestDate,
    overWeek,
  };
}
