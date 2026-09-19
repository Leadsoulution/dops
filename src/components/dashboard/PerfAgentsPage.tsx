"use client";

import { useState } from "react";
import {
  Activity,
  ChevronRight,
  Clock,
  PhoneCall,
  PhoneOff,
  RefreshCw,
  Target,
  UserCheck,
  Users,
} from "lucide-react";
import AgentLiveDetailModal from "./AgentLiveDetailModal";
import PeriodFilter from "./PeriodFilter";
import { useTeamStats, type Range } from "./useTeamStats";
import type { AgentStats } from "./confirmation-data";

export default function PerfAgentsPage() {
  const [range, setRange] = useState<Range>({ label: "Maximum", custom: null });
  const { stats, error, loading } = useTeamStats(range);
  const [selectedAgent, setSelectedAgent] = useState<AgentStats | null>(null);

  const agents = stats?.agents ?? [];
  const team = stats?.team;

  const somme = (pick: (a: AgentStats) => number) =>
    agents.reduce((total, a) => total + pick(a), 0);

  /**
   * Les huit indicateurs de tete.
   *
   * Les totaux d'equipe viennent du serveur plutot que de la somme des
   * colonnes : deux agents ayant travaille la meme commande la
   * compteraient deux fois. Les trois mesures qui n'ont pas d'equivalent
   * d'equipe — rappels, sans reponse, agents actifs — se somment, elles,
   * sans risque de doublon.
   */
  const kpiRows = [
    [
      {
        label: "Agents actifs",
        value: `${agents.filter((a) => a.active).length} / ${agents.length}`,
        icon: Users,
      },
      {
        label: "Commandes traitees",
        value: (team?.treated ?? 0).toLocaleString("fr-FR"),
        subtitle: "sur la periode",
        icon: UserCheck,
      },
      {
        label: "En cours",
        value: somme((a) => a.pending).toLocaleString("fr-FR"),
        icon: Clock,
      },
      {
        label: "Confirmes",
        value: (team?.confirmed ?? 0).toLocaleString("fr-FR"),
        icon: RefreshCw,
      },
    ],
    [
      {
        label: "Rappels",
        value: somme((a) => a.rappels).toLocaleString("fr-FR"),
        subtitle: "actuellement au rappel",
        icon: PhoneCall,
      },
      {
        label: "Sans reponse",
        value: somme((a) => a.sansReponse).toLocaleString("fr-FR"),
        subtitle: "le client n'a pas decroche",
        icon: PhoneOff,
      },
      {
        label: "Leads contactes",
        value: (team?.contacted ?? 0).toLocaleString("fr-FR"),
        icon: Activity,
      },
      {
        label: "Taux de conversion",
        value: `${team?.confirmRate ?? 0}%`,
        icon: Target,
      },
    ],
  ];

  return (
    <div className="scrollbar-hide flex-1 overflow-y-auto bg-gray-50 px-4 py-4 lg:px-6 lg:py-5">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100">
            <Activity className="h-4 w-4 text-gray-600" />
          </div>
          <div>
            <h1 className="text-h1 font-semibold text-gray-900">
              Performance des agents
            </h1>
            <p className="max-w-md text-[13px] text-gray-500">
              Vue d&apos;etat de file en temps reel pour piloter l&apos;activite
              recente, depuis les donnees de confirmation.
            </p>
          </div>
        </div>
        <button
          disabled
          title="Bientot disponible"
          className="flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-[13px] font-medium text-gray-400 opacity-60"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Actualiser
        </button>
      </div>

      <div className="mb-4">
        <PeriodFilter range={range} onChange={setRange} />
      </div>

      {error && (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[12.5px] text-red-700">
          {error}
        </p>
      )}

      <div className="mb-5 space-y-3">
        {kpiRows.map((row, i) => (
          <div key={i} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {row.map((kpi) => {
              const Icon = kpi.icon;
              return (
                <div
                  key={kpi.label}
                  className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-3.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[10.5px] font-semibold uppercase tracking-wide text-gray-400">
                      {kpi.label}
                    </p>
                    <p className="font-mono text-[19px] font-semibold text-gray-900">
                      {kpi.value}
                    </p>
                    {"subtitle" in kpi && kpi.subtitle && (
                      <p className="truncate text-[11px] text-gray-400">
                        {kpi.subtitle}
                      </p>
                    )}
                  </div>
                  <Icon className="h-4 w-4 shrink-0 text-gray-300" />
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-5 py-4">
          <p className="text-[14px] font-semibold text-gray-900">
            Detail par agent
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead>
              <tr className="border-b border-gray-100 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                <th className="px-5 py-3">Agent</th>
                <th className="px-3 py-3">Statut du compte</th>
                <th className="px-3 py-3">Traitees</th>
                <th className="px-3 py-3">En cours</th>
                <th className="px-3 py-3">Rappels</th>
                <th className="px-3 py-3">Confirmes</th>
                <th className="px-3 py-3">Contactes</th>
                <th className="px-3 py-3">Conversion</th>
                <th className="w-10 px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading && !stats && (
                <tr>
                  <td colSpan={9} className="px-5 py-12 text-center text-[13px] text-gray-400">
                    Calcul des statistiques...
                  </td>
                </tr>
              )}
              {!loading && agents.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-12 text-center text-[13px] text-gray-400">
                    Aucun agent dans l&apos;equipe. Creez-en depuis la page
                    Utilisateurs.
                  </td>
                </tr>
              )}
              {agents.map((agent) => {
                const initial = agent.name.trim().charAt(0).toUpperCase();
                return (
                  <tr
                    key={agent.id}
                    onClick={() => setSelectedAgent(agent)}
                    className="cursor-pointer border-b border-gray-50 text-[13px] text-gray-700 last:border-0 hover:bg-gray-50/60"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white ${agent.avatarColor}`}
                        >
                          {initial}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-gray-800">
                            {agent.name}
                          </p>
                          <p className="truncate text-[11.5px] text-gray-400">
                            {agent.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11.5px] font-medium ${
                          agent.active
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {agent.active ? "Compte actif" : "Compte inactif"}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-mono font-medium text-gray-800">
                      {agent.treated.toLocaleString("fr-FR")}
                    </td>
                    <td className="px-3 py-3 font-mono text-gray-600">
                      {agent.pending.toLocaleString("fr-FR")}
                    </td>
                    <td className="px-3 py-3 font-mono font-medium text-orange-500">
                      {agent.rappels.toLocaleString("fr-FR")}
                    </td>
                    <td className="px-3 py-3 font-mono font-medium text-emerald-600">
                      {agent.confirmed.toLocaleString("fr-FR")}
                    </td>
                    <td className="px-3 py-3 font-mono text-gray-500">
                      {agent.contacted.toLocaleString("fr-FR")}
                    </td>
                    <td className="px-3 py-3 font-mono text-gray-500">
                      {agent.confirmRate}%
                    </td>
                    <td className="px-3 py-3 text-right">
                      <ChevronRight className="ml-auto h-4 w-4 text-gray-300" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selectedAgent && (
        <AgentLiveDetailModal
          agent={selectedAgent}
          onClose={() => setSelectedAgent(null)}
        />
      )}
    </div>
  );
}
