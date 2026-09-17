"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Clock,
  History,
  Mail,
  PackageX,
  PhoneCall,
  Timer,
  X,
} from "lucide-react";
import DonutRing from "./DonutRing";
import { LEAD_STATUSES } from "./leads-data";
import type { AgentStats } from "./confirmation-data";

/** Chaque statut garde la couleur qu'il a partout ailleurs. */
const badgeByStatus = new Map(
  LEAD_STATUSES.map((s) => [s.label as string, s.badge as string])
);

/**
 * La meme carte sert les deux sections. Elles posent deux questions
 * differentes sur le meme agent : ce qu'il a confirme, et ce que ses
 * confirmations sont devenues chez le transporteur.
 */
export type CardSection = "confirmation" | "livraison";

export default function AgentPerformanceCard({
  agent,
  section = "confirmation",
}: {
  agent: AgentStats;
  section?: CardSection;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const initial = agent.name.trim().charAt(0).toUpperCase();
  const livraison = section === "livraison";

  // Le taux montre par l'anneau : confirmations obtenues, ou colis
  // remis. Le second ne se calcule que sur les commandes expediees.
  const percent = livraison ? agent.delivery.rate : agent.confirmRate;

  const tiles = livraison
    ? [
        { value: agent.delivery.shipped, label: "Expediees", tone: "purple" },
        { value: agent.delivery.delivered, label: "Livrees", tone: "emerald" },
        { value: agent.delivery.inTransit, label: "En cours", tone: "cyan" },
        { value: agent.delivery.returned, label: "Retours", tone: "amber" },
      ]
    : [
        { value: agent.treated, label: "Traitees", tone: "purple" },
        { value: agent.contacted, label: "Contactes", tone: "cyan" },
        { value: agent.confirmed, label: "Confirmes", tone: "emerald" },
        { value: agent.pending, label: "En cours", tone: "amber" },
      ];

  const toneClasses: Record<string, string> = {
    purple: "bg-purple-50 text-purple-700",
    cyan: "bg-cyan-50 text-cyan-700",
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
  };
  const toneLabel: Record<string, string> = {
    purple: "text-purple-500",
    cyan: "text-cyan-600",
    emerald: "text-emerald-600",
    amber: "text-amber-600",
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-semibold text-white ${agent.avatarColor}`}
          >
            {initial}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13.5px] font-semibold text-gray-900">
              {agent.name}
            </p>
            <p className="flex items-center gap-1 truncate text-[11.5px] text-gray-400">
              <Mail className="h-3 w-3 shrink-0" />
              {agent.email}
            </p>
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
            agent.active
              ? "bg-emerald-50 text-emerald-600"
              : "bg-gray-100 text-gray-500"
          }`}
        >
          {agent.active ? "Actif" : "Inactif"}
        </span>
      </div>

      <div className="mb-3 flex items-center gap-3 border-b border-gray-100 pb-3">
        <DonutRing percent={percent} color={percent === 0 ? "#d1d5db" : "#10b981"} />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-[11px] font-medium text-gray-400">
            {livraison ? "Taux de livraison" : "Taux Confs"}
          </p>
          {livraison ? (
            <p className="text-[12px] text-gray-600">
              sur{" "}
              <span className="font-mono">{agent.confirmed}</span> commande
              {agent.confirmed > 1 ? "s" : ""} confirmee
              {agent.confirmed > 1 ? "s" : ""}
              {agent.delivery.notShipped > 0 && (
                <span
                  className="text-amber-600"
                  title="Confirmees mais jamais envoyees au transporteur"
                >
                  {" "}
                  &middot; {agent.delivery.notShipped} non expediee
                  {agent.delivery.notShipped > 1 ? "s" : ""}
                </span>
              )}
            </p>
          ) : (
            <div className="flex items-center gap-1.5 text-[12px] text-gray-600">
              <Clock
                className="h-3 w-3 shrink-0 text-blue-400"
                aria-label="Delai de prise en charge"
              />
              <span className="font-mono" title="Delai moyen de prise en charge">
                {agent.avgFirstTouch}
              </span>
              <span className="text-gray-300">·</span>
              <span className="font-mono" title="Duree moyenne de traitement">
                {agent.avgHandling}
              </span>
            </div>
          )}
        </div>
        <button
          onClick={() => setHistoryOpen(true)}
          disabled={agent.history.length === 0}
          title="Historique des actions"
          className="shrink-0 rounded-md p-1.5 text-gray-400 hover:bg-gray-50 hover:text-gray-600 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <History className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className={`rounded-md px-2.5 py-1.5 ${toneClasses[tile.tone]}`}
          >
            <p className="font-mono text-[13px] font-semibold">
              {tile.value.toLocaleString("fr-FR")}
            </p>
            <p className={`text-[10.5px] ${toneLabel[tile.tone]}`}>{tile.label}</p>
          </div>
        ))}
      </div>

      <button
        onClick={() => setHistoryOpen(true)}
        className="mt-3 w-full rounded-lg border border-gray-200 py-1.5 text-[12.5px] font-medium text-gray-600 hover:bg-gray-50"
      >
        Voir details
      </button>

      {historyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-xl bg-white shadow-2xl">
            <div className="flex items-center gap-2.5 border-b border-gray-100 px-4 py-3.5">
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-semibold text-white ${agent.avatarColor}`}
              >
                {initial}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-semibold text-gray-900">
                  {agent.name}
                </p>
                <p className="truncate text-[11.5px] text-gray-400">
                  {agent.email}
                </p>
              </div>
              <button
                onClick={() => setHistoryOpen(false)}
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-4 gap-1.5 px-4 pt-3">
              {tiles.map((tile) => (
                <div
                  key={tile.label}
                  className={`rounded-md px-1.5 py-1.5 text-center ${toneClasses[tile.tone]}`}
                >
                  <p className="font-mono text-[12px] font-semibold">
                    {tile.value.toLocaleString("fr-FR")}
                  </p>
                  <p className={`text-[9.5px] ${toneLabel[tile.tone]}`}>
                    {tile.label}
                  </p>
                </div>
              ))}
            </div>

            {livraison ? (
              <div className="grid grid-cols-2 gap-1.5 px-4 pt-2">
                <div className="flex flex-col items-center gap-0.5 rounded-md bg-gray-50 py-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  <p className="font-mono text-[11.5px] font-medium text-gray-700">
                    {agent.confirmed.toLocaleString("fr-FR")}
                  </p>
                  <p className="text-[9px] text-gray-400">Confirmees</p>
                </div>
                <div
                  className="flex flex-col items-center gap-0.5 rounded-md bg-gray-50 py-1.5"
                  title="Confirmees mais jamais envoyees au transporteur"
                >
                  <PackageX className="h-3.5 w-3.5 text-amber-400" />
                  <p className="font-mono text-[11.5px] font-medium text-gray-700">
                    {agent.delivery.notShipped.toLocaleString("fr-FR")}
                  </p>
                  <p className="text-[9px] text-gray-400">Non expediees</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1.5 px-4 pt-2">
                <div className="flex flex-col items-center gap-0.5 rounded-md bg-gray-50 py-1.5">
                  <Clock className="h-3.5 w-3.5 text-blue-400" />
                  <p className="font-mono text-[11.5px] font-medium text-gray-700">
                    {agent.avgFirstTouch}
                  </p>
                  <p className="text-[9px] text-gray-400">Prise en charge</p>
                </div>
                <div className="flex flex-col items-center gap-0.5 rounded-md bg-gray-50 py-1.5">
                  <Timer className="h-3.5 w-3.5 text-violet-400" />
                  <p className="font-mono text-[11.5px] font-medium text-gray-700">
                    {agent.avgHandling}
                  </p>
                  <p className="text-[9px] text-gray-400">Duree traitement</p>
                </div>
                <div
                  className="flex flex-col items-center gap-0.5 rounded-md bg-gray-50 py-1.5"
                  title="Non mesure : l'application ne passe pas les appels."
                >
                  <PhoneCall className="h-3.5 w-3.5 text-gray-300" />
                  <p className="font-mono text-[11.5px] font-medium text-gray-400">
                    {agent.avgCallDuration}
                  </p>
                  <p className="text-[9px] text-gray-400">Duree appels</p>
                </div>
              </div>
            )}

            <p className="px-4 pb-1 pt-3 text-[11px] font-semibold tracking-wide text-gray-500">
              HISTORIQUE DES ACTIONS
              {agent.actions > agent.history.length && (
                <span className="ml-1 font-normal text-gray-400">
                  ({agent.history.length} dernieres sur {agent.actions})
                </span>
              )}
            </p>
            <div className="max-h-64 space-y-2 overflow-y-auto px-4 pb-4">
              {agent.history.length === 0 && (
                <p className="py-6 text-center text-[12px] text-gray-400">
                  Aucune action enregistree sur cette periode
                </p>
              )}
              {agent.history.map((action, i) => (
                <div
                  key={`${action.reference}-${i}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] font-medium text-gray-800">
                      {action.reference}
                    </p>
                    <p className="truncate text-[11px] text-gray-400">
                      {action.phone ? (
                        <span className="font-mono">{action.phone}</span>
                      ) : (
                        action.field
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="font-mono text-[11px] text-gray-400">
                      {action.when}
                    </span>
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-[10.5px] font-medium whitespace-nowrap ${
                        badgeByStatus.get(action.to) ?? "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {action.to}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end border-t border-gray-100 px-4 py-3">
              <button
                onClick={() => setHistoryOpen(false)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-1.5 text-[12.5px] font-medium text-gray-700 hover:bg-gray-50"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
