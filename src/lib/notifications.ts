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
  options: { tag?: string; sound?: "order" | "payment" } = {}
) {
  if (options.sound === "payment") playPaymentSound();
  else if (options.sound === "order") playNewOrderSound();

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
