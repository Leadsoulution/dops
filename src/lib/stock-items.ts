/**
 * Le detail d'un colis de stock : quelle reference, en quelle quantite.
 *
 * Enregistre sous la forme "REF:qte,REF:qte" au moment de l'expedition.
 * C'est la seule source exacte du nombre d'unites par produit : le
 * compte d'articles d'une commande dit combien de pieces elle contient,
 * jamais lesquelles. Une commande de deux produits differents les
 * attribuait donc entierement au premier.
 */

/** Unites par reference. La quantite vaut 1 quand elle est omise. */
export function parseStockItems(stockItems: string | null | undefined): Map<string, number> {
  const out = new Map<string, number>();
  if (!stockItems) return out;

  for (const morceau of stockItems.split(",")) {
    const [brut, quantite] = morceau.split(":");
    const ref = brut?.trim();
    if (!ref) continue;
    const n = Number.parseInt((quantite ?? "").trim(), 10);
    const unites = Number.isFinite(n) && n > 0 ? n : 1;
    out.set(ref, (out.get(ref) ?? 0) + unites);
  }
  return out;
}

/** Total des unites d'un colis, toutes references confondues. */
export function totalUnits(stockItems: string | null | undefined): number {
  let total = 0;
  for (const n of parseStockItems(stockItems).values()) total += n;
  return total;
}
