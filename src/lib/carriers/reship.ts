/**
 * Renvoyer une commande deja revenue.
 *
 * Un colis refuse ou rentre au depot ne repart pas : chez Speedaf il
 * est clos, et son numero de suivi ne bougera plus. Pour que le client
 * soit servi, il faut un nouveau colis — mais une seule commande
 * dans Orderly, sinon le chiffre d'affaires, les statistiques de
 * l'agent et l'inventaire compteraient deux ventes la ou il n'y en a
 * qu'une.
 *
 * Ce fichier tient les deux regles qui rendent cela possible : quelles
 * commandes peuvent repartir, et sous quelle reference les annoncer au
 * transporteur.
 */

/**
 * Les etats d'ou un colis ne reviendra pas de lui-meme.
 *
 * Tant que le colis roule — en transit, injoignable, reporte — il est
 * encore chez le livreur et peut aboutir. En creer un second ferait
 * partir deux fois la meme marchandise, et le client paierait la
 * livraison deux fois.
 */
const TERMINES = new Set([
  "RETURNED",
  "REFUSE",
  "CANCELED",
  "CANCELED_TEAM",
  "OUT_OF_AREA",
]);

/**
 * Cette commande peut-elle repartir ? Rend la raison du refus, ou
 * `null` quand rien ne s'y oppose.
 */
export function refusDeRenvoi(lead: {
  trackingNumber?: string | null;
  deliveryStatusCode?: string | null;
}): string | null {
  if (!lead.trackingNumber) {
    return "Jamais expediee : confirmez-la, le colis partira tout seul.";
  }
  const code = (lead.deliveryStatusCode ?? "").trim();
  if (code === "DELIVERED") {
    return "Deja livree : dupliquez-la plutot, le client recommande.";
  }
  if (!TERMINES.has(code)) {
    return "Le colis est encore chez le transporteur.";
  }
  return null;
}

/** Longueur maximale d'une reference acceptee par Speedaf. */
const MAX = 16;

/**
 * La reference annoncee au transporteur pour le colis de renvoi.
 *
 * Speedaf reconnait une commande a sa reference : redemander un colis
 * sous la meme lui fait rendre celui qui existe deja — le colis revenu
 * — au lieu d'en creer un. Le renvoi porte donc un suffixe, et le
 * deuxieme colis d'une commande s'y lit d'un coup d'oeil dans leur
 * portail.
 *
 * La reference est raccourcie si le suffixe la fait depasser seize
 * caracteres : au-dela, Speedaf la coupe lui-meme, et deux renvois
 * finiraient tronques a la meme chaine, donc sur le meme colis.
 */
export function referenceRenvoi(reference: string, essai: number): string {
  const base = reference.trim();
  if (essai < 2) return base;
  const suffixe = `-R${essai}`;
  const place = MAX - suffixe.length;
  return `${base.length > place ? base.slice(0, place) : base}${suffixe}`;
}
