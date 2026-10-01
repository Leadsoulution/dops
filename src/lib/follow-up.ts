/**
 * Les commandes qui attendent quelque chose de nous.
 *
 * Deux files, parce que ce sont deux metiers. Avant l'expedition, un
 * client qu'on n'arrive pas a joindre : il faut rappeler. Apres, un
 * colis qui stagne chez le transporteur : il faut rattraper la
 * livraison avant qu'elle ne devienne un retour.
 *
 * Les deux files vivent ailleurs dans l'application — melees aux
 * centaines de commandes reglees — et rien ne disait lesquelles
 * dormaient depuis une semaine.
 */

/**
 * Statuts de confirmation ou le dossier est clos : plus rien a faire.
 * Tout le reste attend un geste.
 */
const CLOSED = new Set([
  "Confirme",
  "EXPIDER",
  "Annulee",
  "Faux numero",
  "Non commandee",
  "Expiree",
  "En double",
  "TESTE",
]);

/**
 * Une commande jamais appelee n'est pas une relance : c'est le travail
 * courant, et elle a deja son onglet. La melanger ici noierait les
 * dossiers qui trainent sous les arrivees du jour.
 */
const NOT_YET_CALLED = "Nouveau";

/**
 * Codes du transporteur qui appellent une intervention.
 *
 * Un colis dont le client ne repond pas, qu'il a fait reporter ou
 * annuler, peut encore etre livre si on appelle. Un colis deja revenu
 * ou refuse a la porte, non : son sort est joue, et le mettre dans une
 * file de relance ferait perdre du temps sur des dossiers morts.
 */
const DELIVERY_FOLLOW_UP = new Set([
  "NO_ANSWER",
  "NO_ANSWER_TEAM",
  "NO_ANSWER_SMS",
  "NOANSWER3",
  "UNREACHABLE",
  "UNREACHABLE_TEAM",
  "VOICEMAIL",
  "POSTPONED",
  "POSTPONED_TEAM",
  "CANCELED",
  "CANCELED_TEAM",
  "RELAUNCH",
  "RERETURN",
  "TSUIVI",
]);

/**
 * Au-dela de ce silence, le dossier est en retard.
 *
 * Deux jours avant l'expedition : un client qui n'a pas ete rappele en
 * deux jours se refroidit. Trois apres : le transporteur retente de
 * lui-meme pendant ce temps, intervenir le premier jour ne servirait a
 * rien.
 */
export const RETARD_CONFIRMATION_JOURS = 2;
export const RETARD_LIVRAISON_JOURS = 3;

export type FollowUpKind = "confirmation" | "livraison";

/** Cette commande attend-elle un appel de confirmation ? */
export function needsConfirmationFollowUp(status: string): boolean {
  return !CLOSED.has(status) && status !== NOT_YET_CALLED;
}

/** Ce colis demande-t-il qu'on rattrape sa livraison ? */
export function needsDeliveryFollowUp(code: string | null | undefined): boolean {
  return DELIVERY_FOLLOW_UP.has((code ?? "").trim().toUpperCase());
}

/**
 * Jours ecoules depuis une date, au fuseau du Maroc.
 *
 * Les horodatages de la base portent leur fuseau, mais pas tous : une
 * date sans fuseau serait lue dans celui de la machine, qui tourne en
 * UTC sur le serveur et a l'heure locale en developpement. Le compteur
 * sautait alors d'un jour d'un environnement a l'autre.
 */
export function daysSince(iso: string | null | undefined, now = new Date()): number {
  if (!iso) return 0;
  const avecFuseau = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}+01:00`;
  const t = new Date(avecFuseau).getTime();
  if (!Number.isFinite(t)) return 0;
  const jours = Math.floor((now.getTime() - t) / 86_400_000);
  return jours > 0 ? jours : 0;
}

/** Le dossier a-t-il trop attendu ? */
export function isLate(kind: FollowUpKind, days: number): boolean {
  const seuil =
    kind === "confirmation"
      ? RETARD_CONFIRMATION_JOURS
      : RETARD_LIVRAISON_JOURS;
  return days >= seuil;
}
