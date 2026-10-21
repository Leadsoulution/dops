/**
 * Les statuts de Speedaf, traduits dans ceux de l'application.
 *
 * L'application parle la langue de ForceLog : "DELIVERED", "RETURNED",
 * "NO_ANSWER"... C'est sur ces codes que reposent le taux de livraison,
 * les paiements, l'inventaire et les files de suivi. Un deuxieme
 * transporteur ne doit pas introduire un deuxieme vocabulaire, sinon
 * chaque calcul devrait apprendre les deux.
 *
 * Speedaf a deux niveaux : un code d'etape (`action`) pour le trajet
 * normal, et des codes de probleme (`IP01`...) quand ca se passe mal.
 * Les deux arrivent dans le meme champ `action` des evenements de
 * suivi.
 *
 * La correspondance ci-dessous suit leur documentation. Les libelles
 * francais sont ceux deja affiches dans l'application, pour qu'une
 * commande Speedaf se lise comme une commande ForceLog.
 */

export type EtatLivraison = {
  /** Code machine, celui de l'application. */
  code: string;
  /** Libelle affiche. */
  label: string;
};

/** Le trajet normal, du ramassage a la remise. */
const ETAPES: Record<string, EtatLivraison> = {
  "1": { code: "TSUIVI", label: "Ramasse par le transporteur" },
  "2": { code: "TSUIVI", label: "En transit" },
  "3": { code: "TSUIVI", label: "Arrive au centre de tri" },
  "4": { code: "DISTRIBUTION", label: "En cours de livraison" },
  "5": { code: "DELIVERED", label: "Livre" },
  "-710": { code: "RETURNED", label: "En cours de retour" },
  "730": { code: "RETURNED", label: "Retourne" },
};

/**
 * Les colis a probleme.
 *
 * Un refus n'est pas un retour : le colis est encore chez le livreur et
 * peut repartir en livraison. L'application distingue deja ces cas, et
 * c'est ce qui permet de rappeler un client plutot que de clore la
 * commande.
 */
const PROBLEMES: Record<string, EtatLivraison> = {
  IP01: { code: "UNREACHABLE", label: "Injoignable" },
  "IP01-01": { code: "UNREACHABLE", label: "Faux numero" },
  "IP01-02": { code: "NO_ANSWER", label: "Pas de reponse" },
  "IP01-03": { code: "UNREACHABLE", label: "Telephone eteint" },
  IP02: { code: "POSTPONED", label: "Adresse incomplete" },
  IP03: { code: "POSTPONED", label: "Adresse modifiee" },
  IP04: { code: "OUT_OF_AREA", label: "Hors zone" },
  IP05: { code: "REFUSE", label: "Refuse par le client" },
  "IP05-09": { code: "CANCELED", label: "Commande en double" },
  IP06: { code: "PROGRAMMED", label: "Livraison programmee" },
  IP07: { code: "TSUIVI", label: "Erreur d'acheminement" },
  IP08: { code: "PROGRAMMED", label: "Retrait en agence" },
  IP09: { code: "RETURNED", label: "Retour demande par l'expediteur" },
  IP10: { code: "CANCELED", label: "Commande en double" },
  IP11: { code: "RETURNED", label: "Colis perdu" },
  IP12: { code: "RETURNED", label: "Colis endommage" },
  IP13: { code: "TSUIVI", label: "Bordereau modifie" },
  IP14: { code: "TSUIVI", label: "Incident" },
  IP16: { code: "TSUIVI", label: "Paiement avance" },
  "5573": { code: "POSTPONED", label: "Force majeure" },
};

/** L'etat de depart, avant tout evenement de suivi. */
export const NOUVEAU: EtatLivraison = {
  code: "NEW_PARCEL",
  label: "Nouveau Colis",
};

/**
 * L'etat correspondant a un evenement Speedaf.
 *
 * Le sous-code passe devant quand il precise le probleme : "pas de
 * reponse" et "faux numero" ne se traitent pas pareil, et l'equipe de
 * confirmation a besoin de la difference.
 *
 * Un code inconnu laisse l'etat inchange plutot que d'inventer : la
 * documentation ne promet pas d'etre exhaustive, et ranger un
 * evenement nouveau dans "livre" serait pire que de l'ignorer.
 */
export function speedafStatus(
  action: string | null | undefined,
  subAction?: string | null
): EtatLivraison | null {
  const sous = (subAction ?? "").trim();
  const parent = (action ?? "").trim();
  return (
    PROBLEMES[sous] ??
    PROBLEMES[parent] ??
    ETAPES[sous] ??
    ETAPES[parent] ??
    null
  );
}

/** Le dernier evenement connu d'un colis decide de son etat. */
export function latestStatus(
  tracks: { action?: string | null; subAction?: string | null; time?: string }[]
): EtatLivraison {
  for (let i = tracks.length - 1; i >= 0; i -= 1) {
    const etat = speedafStatus(tracks[i].action, tracks[i].subAction);
    if (etat) return etat;
  }
  return NOUVEAU;
}
