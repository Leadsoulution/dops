/**
 * Le total d'une commande de stock.
 *
 * Extrait du formulaire pour etre verifiable : la regle "chaque article
 * ajoute son prix, en retirer un le soustrait" se dit en une ligne mais
 * se casse en silence des qu'elle vit au milieu d'un composant.
 */

export type TarifArticle = { ref: string; price: number | null };

/**
 * Prix unitaire des commandes saisies a la main, en dirhams.
 *
 * Les ventes par telephone se font a un tarif unique, quel que soit
 * l'article : le prix du catalogue ne les concerne pas. Les commandes
 * de la boutique, elles, gardent le montant que le site a facture — il
 * vient de `order.total` a l'import et n'est jamais recalcule ici.
 *
 * Une seule ligne a changer le jour ou ce tarif bouge.
 */
export const PRIX_UNITAIRE_MANUEL = 200;

/**
 * Somme des prix, quantites comprises.
 *
 * Un article sans prix au catalogue compte pour zero. Inventer un
 * montant serait pire : le total paraitrait juste, et le client se
 * verrait reclamer une somme que personne n'a decidee.
 */
export function stockTotal(
  quantities: Record<string, number>,
  items: TarifArticle[],
  /** Tarif unique applique a tout article. Sinon, le prix du catalogue. */
  prixUnitaire?: number
): number {
  const prix = new Map(
    items.map((i) => [i.ref, prixUnitaire ?? i.price ?? 0])
  );
  const somme = Object.entries(quantities).reduce(
    (total, [ref, qte]) =>
      total + (prix.get(ref) ?? prixUnitaire ?? 0) * (qte > 0 ? qte : 0),
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
