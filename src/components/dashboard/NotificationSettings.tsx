"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  Bell,
  BellRing,
  Check,
  Loader2,
  Play,
  Smartphone,
} from "lucide-react";
import Switch from "./Switch";
import SelectDropdown from "./SelectDropdown";
import {
  askNotificationPermission,
  notificationState,
  playSound,
  sendTestPush,
  subscribeToPush,
} from "@/lib/notifications";
import {
  EVENTS,
  SOUNDS,
  DEFAULT_PREFS,
  readPrefs,
  writePrefs,
  type NotificationPrefs,
  type SoundName,
} from "@/lib/notification-prefs";

/**
 * Reglage des alertes, sur cet appareil.
 *
 * Deux choses differentes y sont montrees, et les confondre serait une
 * source d'incomprehension : l'autorisation, que seul le navigateur
 * accorde, et les preferences, qui choisissent quoi entendre une fois
 * l'autorisation obtenue.
 */

export default function NotificationSettings() {
  // Lecture paresseuse : `localStorage` n'existe pas au rendu serveur,
  // et la fonction d'initialisation n'est appelee que dans le navigateur.
  const [prefs, setPrefs] = useState<NotificationPrefs>(() =>
    typeof window === "undefined" ? DEFAULT_PREFS : readPrefs()
  );
  const [permission, setPermission] = useState<string>(() =>
    typeof window === "undefined" ? "default" : notificationState()
  );
  const [working, setWorking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [pushReady, setPushReady] = useState<boolean | null>(null);

  useEffect(() => {
    // Le serveur doit detenir ses clefs pour joindre un telephone :
    // sans elles, l'abonnement est impossible et il vaut mieux le dire
    // que de laisser croire a un reglage.
    fetch("/api/push/subscribe")
      .then((r) => r.json())
      .then((d) => setPushReady(Boolean(d.configured)))
      .catch(() => setPushReady(false));
  }, []);

  function update(next: NotificationPrefs) {
    setPrefs(next);
    writePrefs(next);
  }

  async function enable() {
    setWorking(true);
    setNote(null);
    try {
      const state = await askNotificationPermission();
      setPermission(state);
      if (state !== "granted") {
        setNote("Le navigateur a refuse. Autorisez les notifications dans ses reglages de site.");
        return;
      }
      const result = await subscribeToPush();
      setNote(
        result.ok
          ? "Cet appareil recevra les alertes, meme application fermee."
          : result.reason
      );
    } finally {
      setWorking(false);
    }
  }

  async function test() {
    setWorking(true);
    try {
      const sent = await sendTestPush();
      setNote(
        sent > 0
          ? `Notification envoyee a ${sent} appareil${sent > 1 ? "s" : ""}.`
          : "Aucun appareil abonne : activez les alertes ci-dessus."
      );
    } finally {
      setWorking(false);
    }
  }

  const granted = permission === "granted";
  const unsupported = permission === "unsupported";

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="mb-1 flex items-center gap-2 text-h3 font-semibold text-gray-900">
        <BellRing className="h-4 w-4 text-gray-400" />
        Alertes sur cet appareil
      </p>
      <p className="mb-4 text-[12.5px] text-gray-500">
        Ces reglages valent pour l&apos;appareil que vous utilisez : c&apos;est
        lui qui sonne. Un telephone et un ordinateur peuvent etre regles
        differemment.
      </p>

      {/* L'autorisation, d'abord : sans elle, le reste est sans effet. */}
      <div
        className={`mb-4 flex flex-wrap items-center gap-3 rounded-lg border px-3.5 py-3 ${
          granted
            ? "border-emerald-200 bg-emerald-50"
            : "border-amber-200 bg-amber-50"
        }`}
      >
        {granted ? (
          <Check className="h-4 w-4 shrink-0 text-emerald-600" />
        ) : (
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
        )}
        <p className="min-w-0 flex-1 text-[12.5px] text-gray-700">
          {unsupported
            ? "Ce navigateur ne gere pas les notifications. Sur iPhone, installez d'abord l'application sur l'ecran d'accueil."
            : granted
              ? "Autorisation accordee. Les alertes s'affichent en haut de l'ecran, comme celles de WhatsApp."
              : "Autorisation non accordee : aucune alerte ne peut s'afficher."}
        </p>
        {!granted && !unsupported && (
          <button
            onClick={enable}
            disabled={working}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-[12.5px] font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {working ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Bell className="h-3.5 w-3.5" />
            )}
            Activer
          </button>
        )}
        {granted && (
          <button
            onClick={test}
            disabled={working}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-[12px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            <Smartphone className="h-3.5 w-3.5" />
            Tester sur mon telephone
          </button>
        )}
      </div>

      {pushReady === false && (
        <p className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Les clefs d&apos;envoi ne sont pas configurees sur le serveur : les
          alertes ne peuvent pas atteindre un telephone application fermee.
        </p>
      )}

      {note && (
        <p className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[12px] text-gray-600">
          {note}
        </p>
      )}

      <div className="mb-3 flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
        <div>
          <p className="text-[13px] font-medium text-gray-800">
            Recevoir les alertes
          </p>
          <p className="text-[12px] text-gray-500">
            Coupe tout d&apos;un coup, sans avoir a tout reregler ensuite.
          </p>
        </div>
        <Switch
          checked={prefs.enabled}
          onChange={(v) => update({ ...prefs, enabled: v })}
          label="Recevoir les alertes"
        />
      </div>

      <div
        className={`divide-y divide-gray-100 rounded-lg border border-gray-100 ${
          prefs.enabled ? "" : "opacity-50"
        }`}
      >
        {EVENTS.map((event) => (
          <div
            key={event.key}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-medium text-gray-800">
                {event.label}
              </p>
              <p className="truncate text-[11.5px] text-gray-500">{event.help}</p>
            </div>

            <div className="flex items-center gap-1.5">
              <div className="w-36">
                <SelectDropdown
                  variant="field"
                  pinnedLabel="Son"
                  options={SOUNDS.map((s) => s.label)}
                  value={
                    SOUNDS.find((s) => s.key === prefs.sounds[event.key])?.label
                  }
                  onSelect={(label) => {
                    const sound = SOUNDS.find((s) => s.label === label);
                    if (!sound) return;
                    update({
                      ...prefs,
                      sounds: { ...prefs.sounds, [event.key]: sound.key },
                    });
                    playSound(sound.key);
                  }}
                />
              </div>
              <button
                onClick={() => playSound(prefs.sounds[event.key])}
                title="Ecouter"
                className="rounded-md border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50"
              >
                <Play className="h-3.5 w-3.5" />
              </button>
              <Switch
                checked={prefs.events[event.key]}
                onChange={(v) =>
                  update({
                    ...prefs,
                    events: { ...prefs.events, [event.key]: v },
                  })
                }
                label={event.label}
              />
            </div>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[11.5px] leading-relaxed text-gray-400">
        Le son choisi est joue par l&apos;application quand elle est ouverte.
        Application fermee, le telephone utilise son propre son de
        notification : les navigateurs ne laissent pas un site en choisir un.
      </p>
    </div>
  );
}

/** Le catalogue, reexporte pour les ecrans qui veulent le presenter. */
export type { SoundName };
