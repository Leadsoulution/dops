/**
 * Le parcours d'un colis, tel qu'un client peut le lire.
 *
 * Le transporteur emploie une vingtaine de codes ; un client n'en
 * comprend pas la moitie et n'a rien a faire de la difference entre
 * "Recu Hub" et "Expedie vers la ville". Ils se rangent donc en cinq
 * etapes, celles qu'on suit du regard sur une ligne.
 *
 * Module sans dependance : la page publique s'en sert, et il se teste
 * seul.
 */

export const STEPS = [
  { key: "created", label: "Colis cree" },
  { key: "collected", label: "Collecte" },
  { key: "processing", label: "En cours de traitement" },
  { key: "delivering", label: "En cours de livraison" },
  { key: "delivered", label: "Livre" },
] as const;

export type StepKey = (typeof STEPS)[number]["key"];

/**
 * A quelle etape correspond chaque code du transporteur.
 *
 * Un code absent de cette table ne fait pas tomber la page : il est
 * range dans "en cours de traitement", l'etape la plus neutre. Le
 * transporteur ajoute des codes sans prevenir, et un client ne doit pas
 * voir une page vide parce qu'il en a invente un nouveau.
 */
const BY_CODE: Record<string, StepKey> = {
  NEW_PARCEL: "created",
  ATT_CONF: "created",
  WAITING_PICKUP: "created",

  PICKED_UP: "collected",

  SENT: "processing",
  RECEIVED: "processing",
  TSUIVI: "processing",
  VOICEMAIL_TEAM: "processing",

  DISTRIBUTION: "delivering",
  PROGRAMMED: "delivering",
  POSTPONED: "delivering",
  NO_ANSWER: "delivering",
  NO_ANSWER_SMS: "delivering",
  NO_ANSWER_TEAM: "delivering",
  UNREACHABLE: "delivering",
  UNREACHABLE_TEAM: "delivering",
  RELAUNCH: "delivering",
  OUT_OF_AREA: "delivering",

  DELIVERED: "delivered",
};

/**
 * Codes qui terminent le parcours sans livraison.
 *
 * Ils ne peuvent pas se placer sur la ligne des cinq etapes : un colis
 * refuse n'est pas "plus avance" qu'un colis en livraison, il est
 * sorti du chemin. La page les annonce a part.
 */
const STOPPED: Record<string, string> = {
  RETURNED: "Retourne a l'expediteur",
  REFUSE: "Refuse par le destinataire",
  CANCELED: "Annule",
  CANCELED_TEAM: "Annule",
};

export type TrackingView = {
  /** Index de l'etape atteinte, -1 si le parcours s'est arrete. */
  currentIndex: number;
  /** Message final quand le colis ne sera pas livre. */
  stopped?: string;
  /** Vrai une fois le colis remis : la ligne est alors complete. */
  done: boolean;
};

export function viewForStatus(statusCode: string | undefined): TrackingView {
  const code = (statusCode ?? "").toUpperCase();

  const arret = STOPPED[code];
  if (arret) return { currentIndex: -1, stopped: arret, done: false };

  const step = BY_CODE[code] ?? "processing";
  const index = STEPS.findIndex((s) => s.key === step);
  return { currentIndex: index, done: step === "delivered" };
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
    const code = (e.STATUS_CODE ?? "").toUpperCase();
    const step = BY_CODE[code];
    if (step && e.TIME && !dates[step]) dates[step] = e.TIME;
  }
  return dates;
}

/**
 * L'adresse publique de suivi d'un colis.
 *
 * Une seule definition : elle sert au lien affiche dans la fiche, a
 * celui envoye par webhook, et a la page elle-meme. Trois versions
 * auraient fini par diverger.
 */
export function trackingUrl(code: string, base?: string): string {
  const racine = (base ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://orderly.host")
    .replace(/\/+$/, "");
  return `${racine}/suivi-${encodeURIComponent(code)}`;
}
