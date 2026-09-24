/**
 * Le parcours d'un colis, tel qu'un client peut le lire.
 *
 * Trois principes.
 *
 * Le transporteur emploie une vingtaine de codes et les nomme pour ses
 * propres equipes : "Attente De Ramassage", "Recu Hub", "Traitement
 * Suivi en cours". Ces mots ne disent rien a un client et donnent
 * l'impression que rien n'avance. Aucun n'est montre : ils se rangent
 * dans cinq etapes, formulees de son point de vue a lui.
 *
 * Chaque texte existe en francais et en arabe. Nos clients lisent l'un
 * ou l'autre, rarement les deux, et une page qui n'en parle qu'une
 * laisse la moitie d'entre eux deviner.
 *
 * Enfin, l'etape parle de ce qui le concerne. "Recu ville" devient
 * "dans votre ville" : le fait est le meme, mais l'un decrit un hangar
 * et l'autre la distance qui reste.
 */

export type Bilingue = { fr: string; ar: string };

export const STEPS = [
  { key: "created", fr: "Colis cree", ar: "تم إنشاء الطلب" },
  { key: "collected", fr: "Collecte", ar: "تم الاستلام" },
  { key: "shipping", fr: "En cours de livraison", ar: "في طريق التوصيل" },
  { key: "in_city", fr: "Dans votre ville", ar: "وصل إلى مدينتكم" },
  { key: "delivered", fr: "Livre", ar: "تم التسليم" },
] as const;

export type StepKey = (typeof STEPS)[number]["key"];

/**
 * A quelle etape correspond chaque code du transporteur.
 *
 * "Colis cree" n'y figure jamais : elle n'est la que pour montrer d'ou
 * part le parcours, et se trouve franchie des qu'un colis existe. Le
 * premier etat reel est "collecte" — entre notre enregistrement et le
 * passage du ramasseur il s'ecoule quelques heures, et afficher "en
 * attente" pendant ce temps inquiete sans rien apprendre.
 *
 * Un code absent de cette table tombe dans "en cours de livraison" : le
 * transporteur en ajoute sans prevenir, et un client ne doit pas voir
 * une page vide pour autant.
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

/** Codes qui terminent le parcours sans livraison. */
const STOPPED: Record<string, Bilingue> = {
  RETURNED: { fr: "Colis retourne", ar: "تم إرجاع الطلب" },
  REFUSE: { fr: "Colis refuse", ar: "تم رفض الطلب" },
  CANCELED: { fr: "Commande annulee", ar: "تم إلغاء الطلب" },
  CANCELED_TEAM: { fr: "Commande annulee", ar: "تم إلغاء الطلب" },
};

/**
 * Codes disant que le livreur a essaye de joindre le client sans
 * succes. Ce sont les seuls ou le client a quelque chose a faire.
 */
const NO_ANSWER = new Set([
  "NO_ANSWER",
  "NO_ANSWER_SMS",
  "NO_ANSWER_TEAM",
  "UNREACHABLE",
  "UNREACHABLE_TEAM",
]);

const HEADLINES: Record<StepKey, Bilingue> = {
  created: { fr: "Votre commande est enregistree", ar: "تم تسجيل طلبكم" },
  collected: { fr: "Votre colis est pris en charge", ar: "تم استلام طلبكم" },
  shipping: { fr: "Votre colis est en route", ar: "طلبكم في طريقه إليكم" },
  in_city: {
    fr: "Votre colis est arrive dans votre ville",
    ar: "وصل طلبكم إلى مدينتكم",
  },
  delivered: { fr: "Votre colis a ete livre", ar: "تم تسليم طلبكم" },
};

export type Notice = {
  /** "attente" : rester joignable. "rappel" : le livreur a deja essaye. */
  kind: "attente" | "rappel";
  text: Bilingue;
};

export type TrackingView = {
  /** Index de l'etape atteinte, -1 si le parcours s'est arrete. */
  currentIndex: number;
  stopped?: Bilingue;
  done: boolean;
  headline: Bilingue;
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

/**
 * Le message a poser sous les etapes.
 *
 * Deux seulement, parce qu'il n'y a que deux choses qu'un client puisse
 * faire : rester joignable, ou rappeler. Tout autre message serait du
 * bruit sur une page qu'on lit en dix secondes.
 *
 * Le numero du livreur n'entre dans le texte que lorsqu'il a deja
 * essaye d'appeler. Avant, le donner inviterait a le deranger pour rien.
 */
export function noticeFor(
  statusCode: string | undefined,
  delivererPhone?: string | null
): Notice | null {
  const code = (statusCode ?? "").toUpperCase();
  if (STOPPED[code] || code === "DELIVERED") return null;

  if (NO_ANSWER.has(code)) {
    const tel = delivererPhone?.trim();
    return {
      kind: "rappel",
      text: {
        fr: tel
          ? `Le livreur a tente de vous joindre. Merci de le rappeler au ${tel}.`
          : "Le livreur a tente de vous joindre. Merci de rester disponible.",
        ar: tel
          ? `حاول عامل التوصيل الاتصال بكم. المرجو معاودة الاتصال به على الرقم ${tel}`
          : "حاول عامل التوصيل الاتصال بكم. المرجو البقاء متاحين",
      },
    };
  }

  return {
    kind: "attente",
    text: {
      fr: "Gardez votre telephone a portee : le livreur vous appellera avant de passer.",
      ar: "المرجو الانتباه لهاتفكم، سيتصل بكم عامل التوصيل قبل الوصول",
    },
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
  // Le colis existe forcement avant d'etre collecte : la premiere etape
  // prend la date de la plus ancienne connue.
  const premiere = history[0]?.TIME;
  if (premiere) dates.created = premiere;
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
  history: { STATUS_CODE?: string; TIME?: string; CITY_NAME?: string }[]
): { label: Bilingue; time?: string; city?: string }[] {
  const out: { label: Bilingue; time?: string; city?: string }[] = [];
  for (const e of history) {
    const code = (e.STATUS_CODE ?? "").toUpperCase();
    const arret = STOPPED[code];
    const step = arret ? null : BY_CODE[code];
    const label = arret ?? (step ? labelOf(step) : null);
    if (!label) continue;
    if (out.at(-1)?.label.fr === label.fr) continue;
    out.push({ label, time: e.TIME, city: e.CITY_NAME || undefined });
  }
  return out;
}

function labelOf(key: StepKey): Bilingue {
  const s = STEPS.find((x) => x.key === key);
  return s ? { fr: s.fr, ar: s.ar } : { fr: "", ar: "" };
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
