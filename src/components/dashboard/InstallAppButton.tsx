"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Check, Download, Share, X } from "lucide-react";

/**
 * Installation d'Orderly comme application.
 *
 * Les navigateurs ne laissent pas declencher l'installation quand on
 * veut : ils emettent `beforeinstallprompt` lorsqu'ils la jugent
 * possible, et c'est cet evenement qu'il faut garder pour le rejouer sur
 * un clic. Sans lui, aucun bouton ne peut installer quoi que ce soit.
 *
 * iOS ne l'emet pas du tout : Safari n'installe que par son menu de
 * partage. On y montre donc la marche a suivre plutot qu'un bouton qui
 * ne ferait rien.
 */

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * Deux lectures du navigateur, faites par `useSyncExternalStore` plutot
 * que dans un effet : ce sont des etats exterieurs a React, et le serveur
 * doit rendre la meme chose que le premier rendu du navigateur.
 */
function subscribeDisplayMode(onChange: () => void) {
  const query = window.matchMedia("(display-mode: standalone)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari sur iOS n'expose pas display-mode et utilise ce drapeau.
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

/** Rien a surveiller : la plateforme ne change pas en cours de route. */
function subscribeNothing() {
  return () => {};
}

function isIOSDevice() {
  const ua = window.navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !/CriOS|FxiOS/.test(ua);
}

export default function InstallAppButton() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [justInstalled, setJustInstalled] = useState(false);
  const [showIOSHelp, setShowIOSHelp] = useState(false);

  const standalone = useSyncExternalStore(
    subscribeDisplayMode,
    isStandalone,
    () => false
  );
  const isIOS = useSyncExternalStore(subscribeNothing, isIOSDevice, () => false);
  const installed = standalone || justInstalled;

  useEffect(() => {
    function onPrompt(event: Event) {
      // Retenir l'evenement : le navigateur ne le reproposera pas.
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    }
    function onInstalled() {
      setJustInstalled(true);
      setPrompt(null);
    }

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    // L'agent de service conditionne la proposition d'installation.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* Hors HTTPS ou navigateur recalcitrant : pas d'installation. */
      });
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) {
    return (
      <div className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] text-slate-500">
        <Check className="h-[17px] w-[17px] shrink-0 text-emerald-500" />
        <span>Application installee</span>
      </div>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSHelp(true)}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
        >
          <Download className="h-[17px] w-[17px] shrink-0" />
          <span>Installer l&apos;application</span>
        </button>

        {showIOSHelp && (
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 px-4">
            <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl">
              <div className="mb-3 flex items-start justify-between">
                <h2 className="text-h2 font-semibold text-gray-900">
                  Installer sur iPhone
                </h2>
                <button
                  onClick={() => setShowIOSHelp(false)}
                  className="rounded-md p-1 text-gray-400 hover:bg-gray-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <ol className="space-y-2 text-[13px] text-gray-600">
                <li className="flex gap-2">
                  <span className="font-medium text-gray-900">1.</span>
                  <span className="flex items-center gap-1.5">
                    Touchez <Share className="h-3.5 w-3.5" /> en bas de Safari
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="font-medium text-gray-900">2.</span>
                  <span>Choisissez &laquo; Sur l&apos;ecran d&apos;accueil &raquo;</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-medium text-gray-900">3.</span>
                  <span>Touchez &laquo; Ajouter &raquo;</span>
                </li>
              </ol>
              <p className="mt-3 text-[12px] text-gray-400">
                Safari est le seul navigateur qui installe sur iPhone. Depuis
                Chrome, ouvrez d&apos;abord cette page dans Safari.
              </p>
            </div>
          </div>
        )}
      </>
    );
  }

  // Aucun evenement recu : soit c'est deja installe, soit le navigateur
  // ne le propose pas. Un bouton mort serait pire que rien.
  if (!prompt) return null;

  return (
    <button
      onClick={async () => {
        await prompt.prompt();
        const choice = await prompt.userChoice;
        if (choice.outcome === "accepted") setJustInstalled(true);
        // Un evenement ne se rejoue pas : le navigateur en emettra un
        // nouveau s'il juge l'installation toujours possible.
        setPrompt(null);
      }}
      className="flex w-full items-center gap-2.5 rounded-lg bg-blue-600/10 px-3 py-2 text-left text-[13px] font-medium text-blue-300 transition-colors hover:bg-blue-600/20"
    >
      <Download className="h-[17px] w-[17px] shrink-0" />
      <span>Installer l&apos;application</span>
    </button>
  );
}
