"use client";

import { useState } from "react";
import { Bot, ExternalLink, Loader2 } from "lucide-react";

/**
 * Systeme multi-agents.
 *
 * Le panneau de controle des agents IA ne vit pas dans Orderly : il
 * tourne sur un serveur a part, et cette page l'encadre. Le recopier
 * ici obligerait a le suivre a chaque changement ; l'encadrer le
 * laisse evoluer de son cote tout en restant a sa place dans la
 * navigation.
 *
 * Le cadre garde ses propres scripts, ses formulaires et son cookie de
 * connexion : la connexion se fait dans le panneau, jamais ici, et
 * aucun mot de passe ne passe par Orderly.
 */

const PANNEAU = "https://161-97-176-65.sslip.io/";

export default function MultiAgentsPage() {
  const [charge, setCharge] = useState(false);

  return (
    <div className="scrollbar-hide flex-1 overflow-y-auto bg-gray-50 px-4 py-4 lg:px-6 lg:py-5">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100">
            <Bot className="h-4 w-4 text-gray-600" />
          </div>
          <div>
            <h1 className="text-h1 font-semibold text-gray-900">
              Systeme multi-agents
            </h1>
            <p className="text-[13px] text-gray-500">
              Controle et suivi des agents IA
            </p>
          </div>
        </div>

        {/*
          La sortie de secours. Certains navigateurs — Safari en tete —
          refusent le cookie de connexion d'un site affiche dans le
          cadre d'un autre ; le panneau s'ouvre alors seul, dans son
          propre onglet, ou rien ne le gene.
        */}
        <a
          href={PANNEAU}
          target="_blank"
          rel="noopener noreferrer"
          className="flex shrink-0 items-center gap-1.5 self-start rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-50"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Ouvrir dans un nouvel onglet
        </a>
      </div>

      <div
        className="relative overflow-hidden rounded-xl border border-gray-200 bg-white"
        style={{ height: "calc(100vh - 140px)", minHeight: 600 }}
      >
        {/*
          Pose au-dessus du cadre plutot qu'a sa place : un cadre qui
          n'est pas encore dans la page ne charge pas, et le chargement
          ne finirait jamais.
        */}
        {!charge && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white text-gray-400">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-[13px]">Chargement du panneau...</p>
          </div>
        )}

        <iframe
          src={PANNEAU}
          title="Systeme multi-agents"
          onLoad={() => setCharge(true)}
          className="h-full w-full border-0"
        />
      </div>
    </div>
  );
}
