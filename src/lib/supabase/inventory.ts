import "server-only";
import { getSupabaseServerClient } from "./server";
import { fetchAll } from "./page";

/**
 * Inventaire.
 *
 * Combien reste-t-il ? C'est l'achat de depart moins ce qui a ete remis
 * aux clients : le stock reel.
 *
 * Et le transporteur detient-il ce qu'il devrait ? De tout ce qui lui a
 * ete confie, trois choses en sont sorties : ce qu'il a livre, ce qui
 * roule encore, et les retours qui ne sont pas revenus en rayon. Le
 * reste devrait etre chez lui.
 *
 * Cette troisieme cause est la seule qu'aucun systeme ne connait. Le
 * transporteur ne publie que son stock du moment : un colis refuse
 * disparait de son suivi sans dire si la marchandise a ete reintegree,
 * gardee de cote ou perdue, et son champ `waiting_quantity` reste a
 * zero. Chaque retour est donc pointe a la main, et le compte qui en
 * decoule se verifie contre le stock qu'il declare. Un ecart qui
 * subsiste apres ce pointage designe une vraie disparition.
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
  /** Parmi elles, celles qui n'ont pas encore ete remises en rayon. */
  awaitingRestock: number;
  /** Achete moins livre : ce que nous possedons encore, ou qu'il soit. */
  real: number;
  /** Ce que le transporteur devrait encore detenir : confie moins livre. */
  expectedAtCarrier: number;
  /** Ce que le transporteur declare detenir. */
  carrier: number;
  /** Attendu moins declare. Positif : il manque de la marchandise. */
  gap: number;
};

/** Un colis revenu, et l'etat de sa remise en rayon. */
export type ReturnedParcel = {
  id: string;
  reference: string;
  trackingNumber: string;
  client: string;
  productName: string;
  productId: string | null;
  units: number;
  /** Libelle du transporteur : retourne, refuse, annule. */
  status: string;
  deliveryDate?: string;
  /** Date de remise en stock, absente tant que ce n'est pas fait. */
  restockedAt?: string;
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
  /** Unites revenues mais pas encore pointees comme remises en rayon. */
  awaitingRestock: number;
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
  id: string;
  reference: string;
  client: string;
  product_name: string | null;
  stock_items: string | null;
  item_count: number | null;
  tracking_number: string | null;
  delivery_status: string | null;
  delivery_status_code: string | null;
  delivery_date: string | null;
  parcel_type: string | null;
  restocked_at: string | null;
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
  /** Les colis revenus, ceux a reintegrer en tete. */
  returns: ReturnedParcel[];
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
          "id,reference,client,product_name,stock_items,item_count," +
            "tracking_number,delivery_status,delivery_status_code," +
            "delivery_date,parcel_type,restocked_at"
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
  const awaiting = new Map<string, number>();
  const returns: ReturnedParcel[] = [];
  let unmatched = 0;

  for (const lead of leads) {
    // Sans numero de suivi, rien n'est sorti : la marchandise est encore
    // en rayon, et s'y trouve deja comptee.
    if (!lead.tracking_number) continue;

    const productId = matchProduct(lead, byRef, byName);
    const units = lead.item_count ?? 1;
    const code = lead.delivery_status_code ?? "";

    if (code !== DELIVERED && FINAL_CODES.has(code)) {
      returns.push({
        id: lead.id,
        reference: lead.reference,
        trackingNumber: lead.tracking_number,
        client: lead.client,
        productName: lead.product_name ?? "",
        productId,
        units,
        status: lead.delivery_status ?? code,
        deliveryDate: lead.delivery_date ?? undefined,
        restockedAt: lead.restocked_at ?? undefined,
      });
    }

    if (!productId) {
      unmatched += 1;
      continue;
    }

    const add = (m: Map<string, number>, n: number) =>
      m.set(productId, (m.get(productId) ?? 0) + n);

    if (code === DELIVERED) add(delivered, units);
    else if (FINAL_CODES.has(code)) {
      add(returned, units);
      // Tant que personne ne l'a pointe, le transporteur ne l'a pas
      // remis dans son depot : sa marchandise manque a l'appel.
      if (!lead.restocked_at) add(awaiting, units);
    } else add(inTransit, units);
  }

  const rows: ProductStock[] = actifs.map((p) => {
    const livre = delivered.get(p.id) ?? 0;
    const route = inTransit.get(p.id) ?? 0;
    const aRentrer = awaiting.get(p.id) ?? 0;

    /*
     * Ce que le transporteur devrait avoir en rayon.
     *
     * Tout ce qui lui a ete confie, moins ce qui en est sorti sans y
     * revenir : le livre, ce qui roule encore, et les retours qui n'ont
     * pas ete reintegres. Retirer seulement le livre — ce que faisait le
     * calcul precedent — melangeait ces trois causes dans un seul ecart,
     * qui ne designait donc rien.
     */
    const expectedAtCarrier = p.stock_sent - livre - route - aRentrer;
    return {
      id: p.id,
      ref: p.ref,
      forcelogRef: p.forcelog_ref ?? undefined,
      name: p.name,
      image: p.image ?? undefined,
      purchased: p.stock_initial,
      sent: p.stock_sent,
      delivered: livre,
      inTransit: route,
      returned: returned.get(p.id) ?? 0,
      awaitingRestock: aRentrer,
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
      awaitingRestock: sum((r) => r.awaitingRestock),
    },
    returns: returns.sort((a, b) =>
      Number(Boolean(a.restockedAt)) - Number(Boolean(b.restockedAt))
    ),
    unmatched,
  };
}
