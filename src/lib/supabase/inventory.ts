import "server-only";
import { getSupabaseServerClient } from "./server";
import { fetchAll } from "./page";

/**
 * Inventaire : ou se trouve la marchandise achetee.
 *
 * Elle est a trois endroits a la fois, et aucun ne suffit seul. Une
 * partie dort dans notre depot, une autre dans celui du transporteur,
 * une derniere roule dans un camion. Ne regarder que le depot du
 * transporteur — la seule quantite que le catalogue connaissait —
 * laissait croire a une rupture alors que la marchandise etait en route.
 *
 * Ce qui a ete livre ne compte plus nulle part : il a ete paye et il est
 * parti. C'est justement l'ecart entre l'achat de depart et ce qui
 * reste.
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
  initial: number;
  /** Ce qui reste dans notre propre depot, saisi a la main. */
  depot: number;
  /** Ce que le transporteur dit avoir en stock. */
  carrier: number;
  /** Unites parties mais pas encore remises au client. */
  inTransit: number;
  /** Unites remises au client : elles ne reviendront pas. */
  delivered: number;
  /** Unites revenues ou refusees, a remettre en rayon. */
  returned: number;
  /** depot + transporteur + en route. */
  remaining: number;
};

export type InventoryTotals = {
  initial: number;
  depot: number;
  carrier: number;
  inTransit: number;
  delivered: number;
  returned: number;
  remaining: number;
};

type ProductRow = {
  id: string;
  ref: string;
  name: string;
  forcelog_ref: string | null;
  image: string | null;
  quantity: number;
  stock_initial: number;
  stock_depot: number;
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
 * la commande de la boutique portant le nom exact du produit. Le meme
 * rapprochement sert aux photos : une commande sans produit reconnu ne
 * compte pour aucun, plutot que d'etre attribuee au hasard.
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
          "id,ref,name,forcelog_ref,image,quantity,stock_initial,stock_depot,status"
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
    const transit = inTransit.get(p.id) ?? 0;
    return {
      id: p.id,
      ref: p.ref,
      forcelogRef: p.forcelog_ref ?? undefined,
      name: p.name,
      image: p.image ?? undefined,
      initial: p.stock_initial,
      depot: p.stock_depot,
      carrier: p.quantity,
      inTransit: transit,
      delivered: delivered.get(p.id) ?? 0,
      returned: returned.get(p.id) ?? 0,
      remaining: p.stock_depot + p.quantity + transit,
    };
  });

  const sum = (pick: (r: ProductStock) => number) =>
    rows.reduce((total, r) => total + pick(r), 0);

  return {
    products: rows,
    totals: {
      initial: sum((r) => r.initial),
      depot: sum((r) => r.depot),
      carrier: sum((r) => r.carrier),
      inTransit: sum((r) => r.inTransit),
      delivered: sum((r) => r.delivered),
      returned: sum((r) => r.returned),
      remaining: sum((r) => r.remaining),
    },
    unmatched,
  };
}
