/**
 * Colis simple ou colis de stock : la decision, prise au moment de
 * l'expedition.
 *
 * Elle etait prise a l'import de la commande, et gravee sur la ligne.
 * Une commande arrivee avant qu'un produit passe en colis de stock
 * partait donc en colis simple pour toujours, meme corrigee dans le
 * catalogue le lendemain. Le catalogue est l'autorite : c'est lui qu'on
 * relit au moment d'appeler le transporteur, pas ce qui avait ete decide
 * a l'arrivee.
 *
 * Module pur : la lecture du catalogue appartient a l'appelant.
 */

export type CatalogueProduct = {
  name: string;
  forcelogRef?: string;
  defaultParcelType: "simple" | "stock";
};

export type ParcelChoice = {
  parcelType: "simple" | "stock";
  /** "1FKGUA:1" — references a prelever au depot, absent en colis simple. */
  stockItems?: string;
};

export type DispatchableOrder = {
  productName: string;
  itemCount?: number;
  parcelType?: "simple" | "stock";
  stockItems?: string;
};

export function resolveParcelType(
  order: DispatchableOrder,
  catalogue: CatalogueProduct[]
): ParcelChoice {
  const stored: ParcelChoice = {
    parcelType: order.parcelType ?? "simple",
    stockItems: order.stockItems,
  };

  // Une commande a plusieurs references a ete composee a l'import, a
  // partir de ses lignes d'origine. La commande ne retient que le nom du
  // premier article : impossible de la recomposer ici sans inventer les
  // autres. On garde donc ce qui avait ete calcule.
  if (order.stockItems?.includes(",")) return stored;

  const wanted = order.productName?.trim().toLowerCase();
  if (!wanted) return stored;

  const matches = catalogue.filter((p) => p.name.trim().toLowerCase() === wanted);
  // Deux produits de meme nom : on ne sait pas lequel prelever, et se
  // tromper de reference enverrait le mauvais article au client.
  if (matches.length !== 1) return stored;

  const product = matches[0];
  if (product.defaultParcelType === "stock" && product.forcelogRef) {
    return {
      parcelType: "stock",
      stockItems: `${product.forcelogRef}:${order.itemCount ?? 1}`,
    };
  }

  // Repasse aussi en colis simple un produit qui a quitte le stock :
  // prelever une reference qui n'y est plus ferait echouer l'envoi.
  return { parcelType: "simple", stockItems: undefined };
}
