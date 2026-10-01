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
  // Annules et refuses : trois jours, pas plus (voir plus bas).
  "REFUSE",
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

/**
 * Au-dela, on renonce : le dossier quitte la file.
 *
 * Trois jours, c'est la duree pendant laquelle un rappel a encore des
 * chances d'aboutir. Passe ce delai le client s'est decide ailleurs,
 * et laisser le dossier en liste ferait porter la file par des cas
 * perdus — ceux qu'il faut appeler aujourd'hui disparaitraient sous
 * ceux de la semaine derniere.
 */
export const ABANDON_JOURS = 3;

/**
 * Colis annules ou refuses : le client a dit non une fois. On retente
 * trois jours, pas plus. Les autres echecs de livraison — sans
 * reponse, reporte — restent en file sans limite : le client n'a rien
 * refuse, il n'a pas encore repondu.
 */
const RENONCE_APRES_TROIS_JOURS = new Set([
  "CANCELED",
  "CANCELED_TEAM",
  "REFUSE",
]);

export type FollowUpKind = "confirmation" | "livraison";

/**
 * Cette commande attend-elle un appel de confirmation ?
 *
 * `days` est le silence depuis la derniere action. Au-dela de trois
 * jours le dossier sort de la file : ce n'est plus une relance, c'est
 * un abandon, et il n'a rien a faire dans une liste d'appels du jour.
 */
export function needsConfirmationFollowUp(status: string, days = 0): boolean {
  if (CLOSED.has(status) || status === NOT_YET_CALLED) return false;
  return days <= ABANDON_JOURS;
}

/**
 * Ce colis demande-t-il qu'on rattrape sa livraison ?
 *
 * Un colis annule ou refuse ne reste en file que trois jours : le
 * client a deja dit non une fois, insister au-dela encombre la liste.
 * Un colis sans reponse y reste, lui, tant qu'il n'a pas repondu.
 */
export function needsDeliveryFollowUp(
  code: string | null | undefined,
  days = 0
): boolean {
  const c = (code ?? "").trim().toUpperCase();
  if (!DELIVERY_FOLLOW_UP.has(c)) return false;
  if (RENONCE_APRES_TROIS_JOURS.has(c)) return days <= ABANDON_JOURS;
  return true;
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

/**
 * Le cycle "traite".
 *
 * Marquer un dossier le met de cote pour vingt-quatre heures, puis il
 * revient de lui-meme. Trois marquages suffisent : au troisieme, on a
 * appele trois jours de suite sans resultat, et le dossier quitte la
 * file pour de bon. Il reste visible dans Commandes, ou rien ne
 * disparait jamais.
 */
export const MARQUAGES_MAX = 3;

/** Duree pendant laquelle un dossier marque reste de cote. */
const REPOS_HEURES = 24;

export type FollowUpState =
  /** A traiter maintenant, dans sa file d'origine. */
  | "due"
  /** Marque il y a moins de 24 h : au repos, onglet Traite. */
  | "resting"
  /** Trois marquages : le dossier sort du suivi. */
  | "done";

/**
 * Ou en est un dossier de son cycle.
 *
 * `markedAt` est la date du dernier marquage, `count` le nombre de
 * marquages. Un dossier jamais marque est du tout de suite.
 */
export function followUpState(
  count: number,
  markedAt: string | null | undefined,
  now = new Date()
): FollowUpState {
  if (count >= MARQUAGES_MAX) return "done";
  if (!markedAt) return "due";

  const avecFuseau = /[zZ]|[+-]\d{2}:?\d{2}$/.test(markedAt)
    ? markedAt
    : `${markedAt}+01:00`;
  const t = new Date(avecFuseau).getTime();
  if (!Number.isFinite(t)) return "due";

  const ecoule = now.getTime() - t;
  return ecoule < REPOS_HEURES * 3_600_000 ? "resting" : "due";
}

/** Le libelle du bouton : "Marquer traite 1", puis 2, puis 3. */
export function markLabel(count: number): string {
  return `Marquer traite ${Math.min(count + 1, MARQUAGES_MAX)}`;
}
