import { parseStockItems } from "@/lib/stock-items";

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

  /*
   * Le code article d'abord : c'est lui qui dit ce que le client a
   * achete.
   *
   * Le nom ne le dit pas. Deux produits peuvent porter le meme intitule
   * — la boutique vend une variante sous le titre de l'ancienne — et un
   * produit renomme laisse derriere lui des commandes au nom perime.
   * Chercher par le nom, c'etait risquer de prelever le mauvais article
   * au depot du transporteur.
   *
   * Les references sont relues au catalogue : chacune doit encore y
   * exister et s'y prelever. Une reference devenue inconnue laisse la
   * commande telle qu'elle avait ete prevue, faute de mieux.
   */
  const refs = [...parseStockItems(order.stockItems)];
  if (refs.length > 0) {
    const lignes = refs.map(([ref, qte]) => ({
      ref,
      qte,
      produit: catalogue.find((p) => p.forcelogRef === ref),
    }));
    if (lignes.some((l) => !l.produit)) return stored;
    if (lignes.every((l) => l.produit!.defaultParcelType === "stock")) {
      return {
        parcelType: "stock",
        stockItems: lignes.map((l) => `${l.ref}:${l.qte}`).join(","),
      };
    }
    // Un produit a quitte le stock du transporteur : le colis repart de
    // notre depot plutot que d'echouer au prelevement.
    return { parcelType: "simple", stockItems: undefined };
  }

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
