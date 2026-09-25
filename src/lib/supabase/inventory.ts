import "server-only";
import { getSupabaseServerClient } from "./server";
import { fetchAll } from "./page";
import { parseStockItems } from "@/lib/stock-items";
import { getStock } from "@/lib/forcelog/client";

/**
 * Inventaire du stock confie au transporteur.
 *
 * Quatre chiffres, et c'est l'ecart entre les deux derniers qui compte.
 *
 * Ce que nous lui avons remis, moins ce qu'il a livre, donne ce qu'il
 * devrait encore detenir. Il annonce de son cote un stock. Quand les
 * deux divergent, quelque chose s'est perdu en route — un retour jamais
 * remis en rayon, un colis egare, un envoi mal note.
 *
 * Le compte des unites se lit dans le detail de chaque colis, jamais
 * dans son nombre d'articles : une commande dit combien de pieces elle
 * contient, pas lesquelles. Trois colis portent deux produits
 * differents, et leurs unites allaient entierement au premier.
 */

const DELIVERED = "DELIVERED";
/** Codes disant qu'un colis ne sera pas remis. */
const FAILED = new Set(["RETURNED", "REFUSE", "CANCELED", "CANCELED_TEAM"]);

export type ProductStock = {
  id: string;
  ref: string;
  forcelogRef?: string;
  name: string;
  image?: string;
  /** Ce qui a ete remis au transporteur, saisi a la main. */
  received: number;
  /** Unites effectivement remises aux clients. */
  delivered: number;
  /** Recu moins livre : ce qu'il devrait rester. */
  real: number;
  /** Ce que le transporteur declare detenir. */
  carrier: number;
  /** Reel moins declare. Positif : il manque de la marchandise. */
  gap: number;
  /** Unites parties, ni livrees ni revenues. Pour lire l'ecart. */
  inTransit: number;
  /** Unites revenues : retour, refus, annulation. */
  returned: number;
};

export type InventoryTotals = {
  received: number;
  delivered: number;
  real: number;
  carrier: number;
  gap: number;
  inTransit: number;
  returned: number;
};

type ProductRow = {
  id: string;
  ref: string;
  name: string;
  forcelog_ref: string | null;
  image: string | null;
  quantity: number;
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
  restocked_at: string | null;
};

/** Un colis revenu, et l'etat de sa remise en rayon. */
export type ReturnedParcel = {
  id: string;
  reference: string;
  trackingNumber: string;
  client: string;
  productName: string;
  units: number;
  status: string;
  deliveryDate?: string;
  restockedAt?: string;
};

export async function getInventory(): Promise<{
  products: ProductStock[];
  totals: InventoryTotals;
  returns: ReturnedParcel[];
  /** Unites expediees dont la reference n'est pas au catalogue. */
  unmatched: number;
  /** Faux quand le stock affiche vient de la base et non du transporteur. */
  carrierLive: boolean;
}> {
  const supabase = getSupabaseServerClient();

  const [products, leads] = await Promise.all([
    fetchAll<ProductRow>(() =>
      supabase
        .from("products")
        .select("id,ref,name,forcelog_ref,image,quantity,stock_sent,status")
        .order("name", { ascending: true })
    ),
    fetchAll<LeadRow>(() =>
      supabase
        .from("leads")
        .select(
          "id,reference,client,product_name,stock_items,item_count," +
            "tracking_number,delivery_status,delivery_status_code," +
            "delivery_date,restocked_at"
        )
    ),
  ]);

  const actifs = products.filter((p) => p.status !== "Archive");

  /*
   * Le stock du transporteur, lu en direct.
   *
   * La colonne `quantity` du catalogue ne bouge que lorsqu'on declenche
   * l'import a la main : elle affichait 200 la ou ForceLog en avait 57.
   * Comparer notre reel a un chiffre vieux de plusieurs jours ne dit
   * rien, et l'ecart qui en sortait etait faux de bout en bout.
   *
   * En cas de panne de leur API, on retombe sur la valeur enregistree :
   * un chiffre ancien vaut mieux qu'une page vide, et l'ecran affiche
   * de toute facon l'heure de la derniere synchronisation.
   */
  const stockVivant = new Map<string, number>();
  const apiKey = process.env.FORCELOG_API_KEY;
  let carrierLive = false;
  if (apiKey) {
    try {
      const stock = await getStock(apiKey);
      for (const produit of Object.values(stock)) {
        for (const v of produit.variants ?? []) {
          if (v.ref) stockVivant.set(v.ref, v.quantity ?? 0);
        }
      }
      carrierLive = true;
    } catch {
      // Transporteur muet : les valeurs enregistrees prennent le relais.
    }
  }

  /** Ce que le transporteur detient, au plus frais dont on dispose. */
  const carrierOf = (p: ProductRow) =>
    stockVivant.get(p.forcelog_ref ?? "") ??
    stockVivant.get(p.ref) ??
    p.quantity;

  // Une reference du transporteur mene a un produit du catalogue. Le
  // code interne sert de secours pour les fiches saisies a la main.
  const parRef = new Map<string, ProductRow>();
  for (const p of actifs) {
    if (p.forcelog_ref) parRef.set(p.forcelog_ref, p);
    if (!parRef.has(p.ref)) parRef.set(p.ref, p);
  }
  const parNom = new Map(actifs.map((p) => [p.name.trim().toLowerCase(), p]));

  const delivered = new Map<string, number>();
  const inTransit = new Map<string, number>();
  const returned = new Map<string, number>();
  const returns: ReturnedParcel[] = [];
  let unmatched = 0;

  for (const lead of leads) {
    // Sans numero de suivi, rien n'est sorti du depot.
    if (!lead.tracking_number) continue;

    const code = lead.delivery_status_code ?? "";
    const seau =
      code === DELIVERED ? delivered : FAILED.has(code) ? returned : inTransit;

    if (seau === returned) {
      returns.push({
        id: lead.id,
        reference: lead.reference,
        trackingNumber: lead.tracking_number,
        client: lead.client,
        productName: lead.product_name ?? "",
        units: lead.item_count ?? 1,
        status: lead.delivery_status ?? code,
        deliveryDate: lead.delivery_date ?? undefined,
        restockedAt: lead.restocked_at ?? undefined,
      });
    }

    /*
     * Le detail du colis d'abord : lui seul dit quelle reference et en
     * quelle quantite. Le nom du produit ne sert que pour les colis
     * anciens qui n'en portent pas.
     */
    const lignes = parseStockItems(lead.stock_items);
    if (lignes.size > 0) {
      for (const [ref, unites] of lignes) {
        const produit = parRef.get(ref);
        if (!produit) {
          unmatched += unites;
          continue;
        }
        seau.set(produit.id, (seau.get(produit.id) ?? 0) + unites);
      }
      continue;
    }

    const produit = parNom.get((lead.product_name ?? "").trim().toLowerCase());
    const unites = lead.item_count ?? 1;
    if (!produit) unmatched += unites;
    else seau.set(produit.id, (seau.get(produit.id) ?? 0) + unites);
  }

  const rows: ProductStock[] = actifs.map((p) => {
    const livre = delivered.get(p.id) ?? 0;
    const real = p.stock_sent - livre;
    const carrier = carrierOf(p);
    return {
      id: p.id,
      ref: p.ref,
      forcelogRef: p.forcelog_ref ?? undefined,
      name: p.name,
      image: p.image ?? undefined,
      received: p.stock_sent,
      delivered: livre,
      real,
      carrier,
      gap: real - carrier,
      inTransit: inTransit.get(p.id) ?? 0,
      returned: returned.get(p.id) ?? 0,
    };
  });

  const somme = (pick: (r: ProductStock) => number) =>
    rows.reduce((total, r) => total + pick(r), 0);

  return {
    products: rows,
    totals: {
      received: somme((r) => r.received),
      delivered: somme((r) => r.delivered),
      real: somme((r) => r.real),
      carrier: somme((r) => r.carrier),
      gap: somme((r) => r.gap),
      inTransit: somme((r) => r.inTransit),
      returned: somme((r) => r.returned),
    },
    returns: returns.sort(
      (a, b) => Number(Boolean(a.restockedAt)) - Number(Boolean(b.restockedAt))
    ),
    unmatched,
    carrierLive,
  };
}
