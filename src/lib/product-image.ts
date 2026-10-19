import { parseStockItems } from "./stock-items";

/**
 * La photo d'un produit, trouvee par son code article.
 *
 * Le rapprochement se faisait par le nom. Deux produits peuvent pourtant
 * porter le meme intitule — la boutique vend une variante sous le titre
 * de l'ancienne — et un produit renomme laisse derriere lui des
 * commandes au nom perime. Montrer la photo de l'un pour une commande
 * de l'autre est pire que n'en montrer aucune : l'agent croit voir ce
 * qu'il expedie.
 *
 * Le code preleve passe donc devant, et le nom ne sert que s'il ne
 * designe qu'un seul produit du catalogue.
 *
 * Module pur : la lecture du catalogue appartient a l'appelant.
 */

export type PhotoProduit = {
  name: string;
  image: string;
  forcelogRef?: string;
};

export type IndexPhotos = {
  byRef: Map<string, string>;
  byName: Map<string, string>;
};

const cle = (v: string) => v.trim().toLowerCase();

export function productImageIndex(produits: PhotoProduit[]): IndexPhotos {
  const combien = new Map<string, number>();
  for (const p of produits) {
    combien.set(cle(p.name), (combien.get(cle(p.name)) ?? 0) + 1);
  }
  return {
    byRef: new Map(
      produits
        .filter((p) => p.forcelogRef)
        .map((p) => [p.forcelogRef as string, p.image])
    ),
    byName: new Map(
      produits
        .filter((p) => combien.get(cle(p.name)) === 1)
        .map((p) => [cle(p.name), p.image])
    ),
  };
}

/** La photo d'une commande : son premier article preleve, sinon son nom. */
export function imageOfOrder(
  index: IndexPhotos,
  order: { productName?: string | null; stockItems?: string | null }
): string | undefined {
  for (const ref of parseStockItems(order.stockItems).keys()) {
    const image = index.byRef.get(ref);
    if (image) return image;
  }
  return index.byName.get(cle(order.productName ?? ""));
}
