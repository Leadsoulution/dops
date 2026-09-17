"use client";

/**
 * Reglages des alertes, par appareil.
 *
 * Ils restent sur l'appareil et non en base, parce que c'est l'appareil
 * qui sonne : l'autorisation du navigateur, le haut-parleur et le son
 * choisi lui appartiennent. Le meme compte ouvert sur un ordinateur et
 * sur un telephone peut vouloir deux reglages differents.
 */

export type EventKind = "order" | "payment" | "status";

export type SoundName =
  | "carillon"
  | "cloche"
  | "bip"
  | "caisse"
  | "alerte"
  | "aucun";

export type NotificationPrefs = {
  /** Interrupteur general : coupe tout sans defaire l'abonnement. */
  enabled: boolean;
  /** Chaque evenement peut etre eteint separement. */
  events: Record<EventKind, boolean>;
  sounds: Record<EventKind, SoundName>;
};

export const EVENTS: { key: EventKind; label: string; help: string }[] = [
  {
    key: "order",
    label: "Nouvelle commande",
    help: "Une commande arrive de la boutique",
  },
  {
    key: "payment",
    label: "Commande livree",
    help: "Le transporteur a remis le colis et encaisse",
  },
  {
    key: "status",
    label: "Changement de statut",
    help: "Un collegue change le statut d'une commande",
  },
];

export const SOUNDS: { key: SoundName; label: string }[] = [
  { key: "carillon", label: "Carillon" },
  { key: "cloche", label: "Cloche" },
  { key: "bip", label: "Bip" },
  { key: "caisse", label: "Tiroir-caisse" },
  { key: "alerte", label: "Alerte" },
  { key: "aucun", label: "Silencieux" },
];

export const DEFAULT_PREFS: NotificationPrefs = {
  enabled: true,
  events: { order: true, payment: true, status: false },
  sounds: { order: "carillon", payment: "caisse", status: "bip" },
};

const KEY = "orderly:notifications";

export function readPrefs(): NotificationPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    const saved = JSON.parse(raw) as Partial<NotificationPrefs>;
    // Fusion avec les valeurs par defaut : un reglage ajoute plus tard
    // ne doit pas casser la lecture d'un enregistrement plus ancien.
    return {
      enabled: saved.enabled ?? DEFAULT_PREFS.enabled,
      events: { ...DEFAULT_PREFS.events, ...saved.events },
      sounds: { ...DEFAULT_PREFS.sounds, ...saved.sounds },
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function writePrefs(prefs: NotificationPrefs) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
    // Previent les autres composants de la page, que `storage` ne
    // notifie pas dans l'onglet qui ecrit.
    window.dispatchEvent(new CustomEvent("orderly:prefs"));
  } catch {
    /* Stockage refuse (navigation privee) : les reglages ne tiennent
       que le temps de la session, ce qui vaut mieux qu'une erreur. */
  }
}

/** Faut-il alerter pour cet evenement sur cet appareil ? */
export function wants(kind: EventKind, prefs = readPrefs()): boolean {
  return prefs.enabled && prefs.events[kind];
}

export function soundFor(kind: EventKind, prefs = readPrefs()): SoundName {
  return prefs.sounds[kind];
}
