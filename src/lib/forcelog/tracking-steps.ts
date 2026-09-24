/**
 * Le parcours d'un colis, tel qu'un client peut le lire.
 *
 * Deux principes.
 *
 * Le transporteur emploie une vingtaine de codes et les nomme pour ses
 * propres equipes : "Attente De Ramassage", "Recu Hub", "Traitement
 * Suivi en cours". Ces mots ne disent rien a un client et donnent
 * l'impression que rien n'avance. Aucun d'eux n'est montre : ils se
 * rangent dans quatre etapes, formulees de son point de vue a lui.
 *
 * Et l'etape parle de ce qui le concerne. "Recu ville" devient "dans
 * votre ville" : le fait est le meme, mais l'un decrit un entrepot et
 * l'autre la distance qui reste.
 */

export const STEPS = [
  { key: "collected", label: "Collecte" },
  { key: "shipping", label: "En cours de livraison" },
  { key: "in_city", label: "Dans votre ville" },
  { key: "delivered", label: "Livre" },
] as const;

export type StepKey = (typeof STEPS)[number]["key"];

/**
 * A quelle etape correspond chaque code du transporteur.
 *
 * Un colis a peine cree est deja annonce "collecte" : entre notre
 * enregistrement et le passage du ramasseur il s'ecoule quelques
 * heures, et afficher "en attente" pendant ce temps inquiete sans rien
 * apprendre.
 *
 * Un code absent de cette table ne fait pas tomber la page : il tombe
 * dans "en cours de livraison". Le transporteur en ajoute sans
 * prevenir, et un client ne doit pas voir une page vide pour autant.
 */
const BY_CODE: Record<string, StepKey> = {
  NEW_PARCEL: "collected",
  ATT_CONF: "collected",

  WAITING_PICKUP: "shipping",
  PICKED_UP: "shipping",
  SENT: "shipping",
  TSUIVI: "shipping",
  VOICEMAIL_TEAM: "shipping",

  RECEIVED: "in_city",
  DISTRIBUTION: "in_city",
  PROGRAMMED: "in_city",
  POSTPONED: "in_city",
  NO_ANSWER: "in_city",
  NO_ANSWER_SMS: "in_city",
  NO_ANSWER_TEAM: "in_city",
  UNREACHABLE: "in_city",
  UNREACHABLE_TEAM: "in_city",
  RELAUNCH: "in_city",
  OUT_OF_AREA: "in_city",

  DELIVERED: "delivered",
};

/**
 * Codes qui terminent le parcours sans livraison.
 *
 * Ils ne peuvent pas se placer sur la ligne : un colis refuse n'est pas
 * "plus avance" qu'un colis en route, il est sorti du chemin.
 */
const STOPPED: Record<string, string> = {
  RETURNED: "Colis retourne",
  REFUSE: "Colis refuse",
  CANCELED: "Commande annulee",
  CANCELED_TEAM: "Commande annulee",
};

export type TrackingView = {
  /** Index de l'etape atteinte, -1 si le parcours s'est arrete. */
  currentIndex: number;
  /** Message final quand le colis ne sera pas livre. */
  stopped?: string;
  done: boolean;
  /** Ce qu'on annonce au client, en un mot juste. */
  headline: string;
};

/** La phrase affichee en grand, une par etape. */
const HEADLINES: Record<StepKey, string> = {
  collected: "Votre colis est pris en charge",
  shipping: "Votre colis est en route",
  in_city: "Votre colis est arrive dans votre ville",
  delivered: "Votre colis a ete livre",
};

export function viewForStatus(statusCode: string | undefined): TrackingView {
  const code = (statusCode ?? "").toUpperCase();

  const arret = STOPPED[code];
  if (arret) {
    return { currentIndex: -1, stopped: arret, done: false, headline: arret };
  }

  const step = BY_CODE[code] ?? "shipping";
  const index = STEPS.findIndex((s) => s.key === step);
  return {
    currentIndex: index,
    done: step === "delivered",
    headline: HEADLINES[step],
  };
}

/** L'etape correspondant a un code, pour reecrire l'historique. */
export function stepOf(statusCode: string | undefined): StepKey | null {
  const code = (statusCode ?? "").toUpperCase();
  if (STOPPED[code]) return null;
  return BY_CODE[code] ?? "shipping";
}

/**
 * Date de passage a chaque etape, lue dans l'historique.
 *
 * On garde la premiere fois qu'une etape est atteinte, pas la
 * derniere : un colis qui repasse en livraison apres un report a bien
 * commence sa livraison le premier jour.
 */
export function stepDates(
  history: { STATUS_CODE?: string; TIME?: string }[]
): Partial<Record<StepKey, string>> {
  const dates: Partial<Record<StepKey, string>> = {};
  for (const e of history) {
    const step = stepOf(e.STATUS_CODE);
    if (step && e.TIME && !dates[step]) dates[step] = e.TIME;
  }
  return dates;
}

/**
 * L'historique reecrit pour le client.
 *
 * Les libelles du transporteur sont remplaces par les notres, et les
 * repetitions disparaissent : cinq lignes disant "en cours de
 * livraison" ne racontent rien de plus qu'une seule.
 */
export function publicHistory(
  history: { STATUS_CODE?: string; STATUS_NAME?: string; TIME?: string; CITY_NAME?: string }[]
): { label: string; time?: string; city?: string }[] {
  const out: { label: string; time?: string; city?: string }[] = [];
  for (const e of history) {
    const code = (e.STATUS_CODE ?? "").toUpperCase();
    const label = STOPPED[code] ?? (BY_CODE[code] ? labelOf(BY_CODE[code]) : null);
    if (!label) continue;
    if (out.at(-1)?.label === label) continue;
    out.push({ label, time: e.TIME, city: e.CITY_NAME || undefined });
  }
  return out;
}

function labelOf(key: StepKey): string {
  return STEPS.find((s) => s.key === key)?.label ?? "";
}

/**
 * L'adresse publique de suivi d'un colis.
 *
 * Une seule definition : elle sert au lien affiche dans la fiche, a
 * celui envoye par webhook, au mot-cle des messages, et a la page
 * elle-meme. Quatre versions auraient fini par diverger.
 */
export function trackingUrl(code: string, base?: string): string {
  const racine = (base ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://orderly.host")
    .replace(/\/+$/, "");
  return `${racine}/suivi-${encodeURIComponent(code)}`;
}
