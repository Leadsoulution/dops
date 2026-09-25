/**
 * Le total d'une commande de stock.
 *
 * Extrait du formulaire pour etre verifiable : la regle "chaque article
 * ajoute son prix, en retirer un le soustrait" se dit en une ligne mais
 * se casse en silence des qu'elle vit au milieu d'un composant.
 */

export type TarifArticle = { ref: string; price: number | null };

/**
 * Somme des prix, quantites comprises.
 *
 * Un article sans prix au catalogue compte pour zero. Inventer un
 * montant serait pire : le total paraitrait juste, et le client se
 * verrait reclamer une somme que personne n'a decidee.
 */
export function stockTotal(
  quantities: Record<string, number>,
  items: TarifArticle[]
): number {
  const prix = new Map(items.map((i) => [i.ref, i.price ?? 0]));
  const somme = Object.entries(quantities).reduce(
    (total, [ref, qte]) => total + (prix.get(ref) ?? 0) * (qte > 0 ? qte : 0),
    0
  );
  return Math.round(somme);
}

/** Les references choisies dont le catalogue ignore le prix. */
export function refsSansPrix(
  quantities: Record<string, number>,
  items: TarifArticle[]
): string[] {
  const prix = new Map(items.map((i) => [i.ref, i.price]));
  return Object.keys(quantities).filter((ref) => !prix.get(ref));
}
