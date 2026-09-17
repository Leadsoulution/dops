"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2, X } from "lucide-react";
import {
  askNotificationPermission,
  notificationState,
  subscribeToPush,
} from "@/lib/notifications";

/**
 * Relance ceux qui n'ont pas active les alertes.
 *
 * Une commande qui arrive sans prevenir personne ne sert a rien : c'est
 * l'alerte qui fait decrocher le telephone dans la minute plutot que
 * deux heures plus tard. Tant que l'autorisation manque, on la redemande
 * toutes les trois heures, et pas plus souvent : une fenetre qui revient
 * sans cesse finit par se faire fermer sans etre lue.
 *
 * Le refus est traite a part. Une fois l'autorisation refusee, le
 * navigateur ne la redemandera plus : le bouton ne peut rien, et
 * insister toutes les trois heures serait du harcelement sans issue. On
 * explique alors ou la reactiver, une fois par jour.
 */

const KEY = "orderly:notif-nudge";
const THREE_HOURS = 3 * 60 * 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;

function lastDismissed(): number {
  try {
    return Number(window.localStorage.getItem(KEY) ?? 0);
  } catch {
    return 0;
  }
}

function remember() {
  try {
    window.localStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* Sans stockage, la fenetre reviendra au prochain chargement. */
  }
}

export default function NotificationNudge() {
  const [open, setOpen] = useState(false);
  const [denied, setDenied] = useState(false);
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    function check() {
      const state = notificationState();
      // Rien a proposer : soit c'est fait, soit le navigateur ne sait
      // pas faire — sur iPhone, hors application installee.
      if (state === "granted" || state === "unsupported") {
        setOpen(false);
        return;
      }
      const refused = state === "denied";
      const delay = refused ? ONE_DAY : THREE_HOURS;
      if (Date.now() - lastDismissed() < delay) return;
      setDenied(refused);
      setOpen(true);
    }

    // Laisse la page s'installer avant de demander quoi que ce soit.
    const first = setTimeout(check, 4000);
    const timer = setInterval(check, 5 * 60 * 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);

  async function enable() {
    setWorking(true);
    setFailure(null);
    try {
      const state = await askNotificationPermission();
      if (state !== "granted") {
        setDenied(true);
        setWorking(false);
        return;
      }
      // L'autorisation ne suffit pas : sans abonnement, le telephone ne
      // peut pas etre joint application fermee.
      const result = await subscribeToPush();
      if (!result.ok) setFailure(result.reason);
      else {
        remember();
        setOpen(false);
      }
    } finally {
      setWorking(false);
    }
  }

  function later() {
    remember();
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/40 px-4 pb-6 sm:items-center sm:pb-0">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-3 flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              denied ? "bg-amber-50" : "bg-blue-50"
            }`}
          >
            {denied ? (
              <BellOff className="h-5 w-5 text-amber-600" />
            ) : (
              <Bell className="h-5 w-5 text-blue-600" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-h2 font-semibold text-gray-900">
              {denied
                ? "Les alertes sont bloquees"
                : "Activez les alertes sur cet appareil"}
            </h2>
            <p className="mt-1 text-[12.5px] leading-relaxed text-gray-500">
              {denied ? (
                <>
                  Votre navigateur a refuse les notifications pour Orderly.
                  Ouvrez ses reglages de site, autorisez les notifications,
                  puis rechargez cette page.
                </>
              ) : (
                <>
                  Vous serez prevenu des qu&apos;une commande arrive ou
                  qu&apos;un colis est livre, meme application fermee. Sans
                  cela, il faut penser a venir regarder.
                </>
              )}
            </p>
          </div>
          <button
            onClick={later}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {failure && (
          <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-700">
            {failure}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            onClick={later}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-50 sm:w-auto"
          >
            Pas encore
          </button>
          {!denied && (
            <button
              onClick={enable}
              disabled={working}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-blue-700 disabled:opacity-60 sm:w-auto"
            >
              {working ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Bell className="h-3.5 w-3.5" />
              )}
              Activer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
