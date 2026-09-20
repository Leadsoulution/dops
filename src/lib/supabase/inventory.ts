import "server-only";
import { getSupabaseServerClient } from "./server";
import { fetchAll } from "./page";

/**
 * Inventaire.
 *
 * Deux questions, et la seconde est la plus utile.
 *
 * Combien reste-t-il ? C'est l'achat de depart moins ce qui a ete remis
 * aux clients : le stock reel.
 *
 * Et surtout : le transporteur detient-il bien ce qu'il devrait ? De
 * tout ce qui lui a ete confie, il ne doit avoir livre que le livre ;
 * le reste devrait etre encore chez lui, retours compris. Comparer ce
 * compte a ce qu'il declare, c'est savoir si les retours sont revenus
 * en rayon ou se sont perdus en chemin. Personne ne le dit autrement :
 * le transporteur ne publie que son stock du moment.
 */

/** Codes du transporteur disant qu'un colis ne roule plus. */
const FINAL_CODES = new Set(["DELIVERED", "RETURNED", "CANCELED", "REFUSE"]);
const DELIVERED = "DELIVERED";

export type ProductStock = {
  id: string;
  ref: string;
  /** Code article du transporteur, quand le produit en a un. */
  forcelogRef?: string;
  name: string;
  image?: string;
  /** Quantite achetee au depart, saisie a la main. */
  purchased: number;
  /** Total confie au transporteur depuis le debut, saisi a la main. */
  sent: number;
  /** Unites remises au client : elles ne reviendront pas. */
  delivered: number;
  /** Unites parties mais pas encore remises. */
  inTransit: number;
  /** Unites retournees, refusees ou annulees a la livraison. */
  returned: number;
  /** Achete moins livre : ce que nous possedons encore, ou qu'il soit. */
  real: number;
  /** Ce que le transporteur devrait encore detenir : confie moins livre. */
  expectedAtCarrier: number;
  /** Ce que le transporteur declare detenir. */
  carrier: number;
  /** Attendu moins declare. Positif : il manque de la marchandise. */
  gap: number;
};

export type InventoryTotals = {
  purchased: number;
  sent: number;
  delivered: number;
  inTransit: number;
  returned: number;
  real: number;
  expectedAtCarrier: number;
  carrier: number;
  gap: number;
};

type ProductRow = {
  id: string;
  ref: string;
  name: string;
  forcelog_ref: string | null;
  image: string | null;
  quantity: number;
  stock_initial: number;
  stock_sent: number;
  status: string;
};

type LeadRow = {
  product_name: string | null;
  stock_items: string | null;
  item_count: number | null;
  tracking_number: string | null;
  delivery_status_code: string | null;
};

/**
 * A quel produit du catalogue se rattache cette commande ?
 *
 * D'abord par code article preleve, qui est exact ; a defaut par nom,
 * la commande de la boutique portant le nom exact du produit. Une
 * commande sans produit reconnu ne compte pour aucun, plutot que d'etre
 * attribuee au hasard.
 */
export function matchProduct(
  lead: { product_name: string | null; stock_items: string | null },
  byRef: Map<string, string>,
  byName: Map<string, string>
): string | null {
  const firstRef = lead.stock_items?.split(",")[0]?.split(":")[0]?.trim();
  if (firstRef) {
    const found = byRef.get(firstRef);
    if (found) return found;
  }
  const name = (lead.product_name ?? "").trim().toLowerCase();
  return name ? (byName.get(name) ?? null) : null;
}

export async function getInventory(): Promise<{
  products: ProductStock[];
  totals: InventoryTotals;
  /** Commandes expediees dont le produit n'est pas au catalogue. */
  unmatched: number;
}> {
  const supabase = getSupabaseServerClient();

  const [products, leads] = await Promise.all([
    fetchAll<ProductRow>(() =>
      supabase
        .from("products")
        .select(
          "id,ref,name,forcelog_ref,image,quantity,stock_initial,stock_sent,status"
        )
        .order("name", { ascending: true })
    ),
    fetchAll<LeadRow>(() =>
      supabase
        .from("leads")
        .select(
          "product_name,stock_items,item_count,tracking_number,delivery_status_code"
        )
    ),
  ]);

  const actifs = products.filter((p) => p.status !== "Archive");

  const byRef = new Map(
    actifs.filter((p) => p.forcelog_ref).map((p) => [p.forcelog_ref as string, p.id])
  );
  const byName = new Map(actifs.map((p) => [p.name.trim().toLowerCase(), p.id]));

  const inTransit = new Map<string, number>();
  const delivered = new Map<string, number>();
  const returned = new Map<string, number>();
  let unmatched = 0;

  for (const lead of leads) {
    // Sans numero de suivi, rien n'est sorti : la marchandise est encore
    // en rayon, et s'y trouve deja comptee.
    if (!lead.tracking_number) continue;

    const productId = matchProduct(lead, byRef, byName);
    if (!productId) {
      unmatched += 1;
      continue;
    }

    const units = lead.item_count ?? 1;
    const code = lead.delivery_status_code ?? "";
    const bucket =
      code === DELIVERED ? delivered : FINAL_CODES.has(code) ? returned : inTransit;
    bucket.set(productId, (bucket.get(productId) ?? 0) + units);
  }

  const rows: ProductStock[] = actifs.map((p) => {
    const livre = delivered.get(p.id) ?? 0;
    const expectedAtCarrier = p.stock_sent - livre;
    return {
      id: p.id,
      ref: p.ref,
      forcelogRef: p.forcelog_ref ?? undefined,
      name: p.name,
      image: p.image ?? undefined,
      purchased: p.stock_initial,
      sent: p.stock_sent,
      delivered: livre,
      inTransit: inTransit.get(p.id) ?? 0,
      returned: returned.get(p.id) ?? 0,
      real: p.stock_initial - livre,
      expectedAtCarrier,
      carrier: p.quantity,
      gap: expectedAtCarrier - p.quantity,
    };
  });

  const sum = (pick: (r: ProductStock) => number) =>
    rows.reduce((total, r) => total + pick(r), 0);

  return {
    products: rows,
    totals: {
      purchased: sum((r) => r.purchased),
      sent: sum((r) => r.sent),
      delivered: sum((r) => r.delivered),
      inTransit: sum((r) => r.inTransit),
      returned: sum((r) => r.returned),
      real: sum((r) => r.real),
      expectedAtCarrier: sum((r) => r.expectedAtCarrier),
      carrier: sum((r) => r.carrier),
      gap: sum((r) => r.gap),
    },
    unmatched,
  };
}
