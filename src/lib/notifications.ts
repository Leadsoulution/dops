"use client";

/**
 * Alertes sonores et visuelles.
 *
 * Les sons sont synthetises plutot que charges : deux fichiers audio
 * pesent plus lourd que ce code, et un fichier manquant ne previendrait
 * de rien. La synthese sonne toujours, meme hors ligne.
 *
 * Le navigateur refuse de jouer un son avant la premiere interaction de
 * la personne avec la page. `unlockAudio` est appele au premier clic
 * pour lever cette reserve : sans lui, la premiere commande arriverait
 * en silence.
 */

import {
  readPrefs,
  soundFor,
  wants,
  type EventKind,
} from "./notification-prefs";

let audioContext: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  if (!audioContext) audioContext = new Ctor();
  return audioContext;
}

/**
 * Les sons proposes dans les reglages. Chacun est une suite de notes :
 * une hauteur, un instant de depart, une duree, un volume et une forme
 * d'onde. Les synthetiser evite cinq fichiers a telecharger et garantit
 * qu'ils sonnent meme hors ligne.
 */
const RECIPES: Record<string, [number, number, number, number, OscillatorType][]> = {
  // Deux notes montantes, breves.
  carillon: [
    [880, 0, 0.14, 0.18, "sine"],
    [1174.66, 0.1, 0.2, 0.16, "sine"],
  ],
  // Une note pleine qui resonne.
  cloche: [
    [1318.5, 0, 0.5, 0.2, "sine"],
    [2637, 0, 0.3, 0.07, "sine"],
  ],
  // Deux impulsions seches.
  bip: [
    [1000, 0, 0.07, 0.2, "square"],
    [1000, 0.12, 0.07, 0.2, "square"],
  ],
  // Accord bref puis quinte tenue, comme un tiroir qui s'ouvre.
  caisse: [
    [1046.5, 0, 0.12, 0.16, "triangle"],
    [1567.98, 0.07, 0.14, 0.14, "triangle"],
    [2093, 0.15, 0.45, 0.13, "triangle"],
    [1567.98, 0.15, 0.45, 0.08, "sine"],
  ],
  // Trois notes descendantes : quelque chose demande attention.
  alerte: [
    [988, 0, 0.12, 0.2, "sawtooth"],
    [784, 0.14, 0.12, 0.2, "sawtooth"],
    [659, 0.28, 0.22, 0.18, "sawtooth"],
  ],
};

/** Joue un son du catalogue. "aucun" ne joue rien, volontairement. */
export function playSound(name: string) {
  const recipe = RECIPES[name];
  if (!recipe) return;
  const ctx = getContext();
  if (!ctx) return;
  void ctx.resume();
  const now = ctx.currentTime;
  for (const [frequency, delay, duration, gain, type] of recipe) {
    note(ctx, frequency, now + delay, duration, gain, type);
  }
}

export function unlockAudio() {
  const ctx = getContext();
  if (ctx?.state === "suspended") void ctx.resume();
}

/** Une note simple, avec une attaque douce et une extinction naturelle. */
function note(
  ctx: AudioContext,
  frequency: number,
  startAt: number,
  duration: number,
  gain: number,
  type: OscillatorType = "sine"
) {
  const osc = ctx.createOscillator();
  const envelope = ctx.createGain();
  osc.type = type;
  osc.frequency.value = frequency;

  // Une enveloppe plutot qu'un volume constant : un son qui s'arrete net
  // produit un claquement desagreable.
  envelope.gain.setValueAtTime(0, startAt);
  envelope.gain.linearRampToValueAtTime(gain, startAt + 0.012);
  envelope.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  osc.connect(envelope).connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.05);
}

/** Deux notes montantes, breves : une commande vient d'arriver. */
export function playNewOrderSound() {
  const ctx = getContext();
  if (!ctx) return;
  void ctx.resume();
  const now = ctx.currentTime;
  note(ctx, 880, now, 0.14, 0.18);
  note(ctx, 1174.66, now + 0.1, 0.2, 0.16);
}

/** Carillon de caisse, plus riche : la commande est livree et encaissee. */
export function playPaymentSound() {
  const ctx = getContext();
  if (!ctx) return;
  void ctx.resume();
  const now = ctx.currentTime;
  // Un accord bref puis une quinte tenue, comme un tiroir-caisse.
  note(ctx, 1046.5, now, 0.12, 0.16, "triangle");
  note(ctx, 1567.98, now + 0.07, 0.14, 0.14, "triangle");
  note(ctx, 2093, now + 0.15, 0.45, 0.13, "triangle");
  note(ctx, 1567.98, now + 0.15, 0.45, 0.08, "sine");
}

export type NotificationPermissionState = "granted" | "denied" | "default" | "unsupported";

export function notificationState(): NotificationPermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}

export async function askNotificationPermission(): Promise<NotificationPermissionState> {
  if (!("Notification" in window)) return "unsupported";
  return Notification.requestPermission();
}

/**
 * Affiche une notification systeme si la permission existe. Le son est
 * joue dans tous les cas : c'est lui qui fait lever la tete, et il ne
 * depend d'aucune autorisation.
 */
export function notify(
  title: string,
  body: string,
  options: { tag?: string; kind?: EventKind } = {}
) {
  const kind = options.kind;
  // Les reglages de l'appareil decident : un evenement eteint ne sonne
  // pas et n'affiche rien, meme si l'autorisation existe.
  if (kind) {
    const prefs = readPrefs();
    if (!wants(kind, prefs)) return;
    playSound(soundFor(kind, prefs));
  }

  if (notificationState() !== "granted") return;
  try {
    new Notification(title, {
      body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      // Un tag par commande : deux alertes sur la meme commande se
      // remplacent au lieu de s'empiler.
      tag: options.tag,
    });
  } catch {
    /* Certains navigateurs refusent hors d'un agent de service. */
  }
}

/**
 * Abonne cet appareil aux notifications push.
 *
 * Sans cet abonnement, une alerte n'existe que dans un onglet ouvert.
 * Avec lui, le serveur peut joindre le telephone application fermee.
 *
 * Sur iPhone, cela n'est possible qu'apres installation sur l'ecran
 * d'accueil : Safari refuse l'abonnement depuis un onglet ordinaire.
 */
export async function subscribeToPush(): Promise<
  { ok: true } | { ok: false; reason: string }
> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { ok: false, reason: "Ce navigateur ne gere pas les notifications push." };
  }

  try {
    const info = await fetch("/api/push/subscribe").then((r) => r.json());
    if (!info.publicKey) {
      return { ok: false, reason: "Notifications push non configurees sur le serveur." };
    }

    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        // Obligatoire : un abonnement muet, sans notification visible,
        // serait refuse par les navigateurs.
        userVisibleOnly: true,
        applicationServerKey: info.publicKey,
      }));

    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });
    if (!res.ok) {
      return { ok: false, reason: (await res.json()).error ?? "Enregistrement refuse." };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error
          ? error.message
          : "Abonnement impossible sur cet appareil.",
    };
  }
}

/** Demande au serveur d'envoyer une notification a cet appareil. */
export async function sendTestPush(): Promise<number> {
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ test: true }),
  });
  const data = await res.json();
  return data.sent ?? 0;
}
