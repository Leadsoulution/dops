"use client";

import { Bot } from "lucide-react";

/**
 * Systeme multi-agents.
 *
 * La section est posee avant son contenu : l'entree existe dans la
 * barre laterale, l'adresse repond, les droits se cochent comme pour
 * les autres pages. Ce qu'elle montrera reste a definir.
 *
 * L'ecran annonce donc qu'il est vide plutot que de laisser une page
 * blanche, qu'on lirait comme une panne.
 */
export default function MultiAgentsPage() {
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
            <p className="text-[13px] text-gray-500">Section a definir</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-10 text-center">
        <p className="text-[13px] text-gray-500">
          Cette section est vide pour l&apos;instant.
        </p>
      </div>
    </div>
  );
}
