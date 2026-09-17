"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Loader2,
  PackageCheck,
  Phone,
  Target,
  Truck,
  Undo2,
} from "lucide-react";
import type { ComponentType } from "react";
import DonutRing from "./DonutRing";
import AgentPerformanceCard, { type CardSection } from "./AgentPerformanceCard";
import PeriodFilter from "./PeriodFilter";
import { useTeamStats, type Range } from "./useTeamStats";

/**
 * Les agents d'une section, avec le detail de leurs commandes.
 *
 * Une seule page pour la confirmation et la livraison : ce sont les
 * memes agents, la meme periode et la meme mise en page. Seules les
 * quatre mesures du haut et le contenu des cartes changent, et les
 * dupliquer aurait garanti qu'elles divergent.
 */

type Tile = {
  value: string;
  label: string;
  hint?: string;
  icon: ComponentType<{ className?: string }>;
  tone: string;
};

export default function AgentsSectionPage({ section }: { section: CardSection }) {
  const [range, setRange] = useState<Range>({ label: "Maximum", custom: null });
  const { stats, error, loading } = useTeamStats(range);

  const livraison = section === "livraison";
  const rate = livraison ? (stats?.delivery.rate ?? 0) : (stats?.team.confirmRate ?? 0);

  const tiles: Tile[] = livraison
    ? [
        {
          value: (stats?.delivery.shipped ?? 0).toLocaleString("fr-FR"),
          label: "Expediees au transporteur",
          icon: Truck,
          tone: "blue",
        },
        {
          value: (stats?.delivery.delivered ?? 0).toLocaleString("fr-FR"),
          label: "Livrees",
          icon: PackageCheck,
          tone: "emerald",
        },
        {
          value: (stats?.delivery.returned ?? 0).toLocaleString("fr-FR"),
          label: "Retours et refus",
          icon: Undo2,
          tone: "amber",
        },
        {
          value: `${stats?.delivery.rate ?? 0}%`,
          label: "Taux de livraison",
          hint: "Livrees rapportees aux commandes reellement expediees",
          icon: Target,
          tone: "emerald",
        },
      ]
    : [
        {
          value: (stats?.team.treated ?? 0).toLocaleString("fr-FR"),
          label: "Total commandes traitees",
          icon: Clock,
          tone: "violet",
        },
        {
          value: (stats?.team.confirmed ?? 0).toLocaleString("fr-FR"),
          label: "Commandes confirmees",
          icon: CheckCircle2,
          tone: "violet",
        },
        {
          value: (stats?.team.contacted ?? 0).toLocaleString("fr-FR"),
          label: "Contactes (equipe)",
          icon: Phone,
          tone: "blue",
        },
        {
          value: `${stats?.team.confirmRate ?? 0}%`,
          label: "Taux de confirmation",
          icon: Target,
          tone: "emerald",
        },
      ];

  const toneBg: Record<string, string> = {
    violet: "bg-violet-50",
    blue: "bg-blue-50",
    emerald: "bg-emerald-50",
    amber: "bg-amber-50",
  };
  const toneIcon: Record<string, string> = {
    violet: "text-violet-600",
    blue: "text-blue-600",
    emerald: "text-emerald-600",
    amber: "text-amber-600",
  };

  const agents = stats?.agents ?? [];

  return (
    <div className="scrollbar-hide flex-1 overflow-y-auto bg-gray-50 px-4 py-4 lg:px-6 lg:py-5">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-lg ${
              livraison ? "bg-blue-50" : "bg-emerald-50"
            }`}
          >
            {livraison ? (
              <Truck className="h-4 w-4 text-blue-600" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            )}
          </div>
          <div>
            <h1 className="text-h1 font-semibold text-gray-900">
              {livraison ? "Livraison" : "Confirmation"}
            </h1>
            <p className="text-[13px] text-gray-500">
              {livraison
                ? "Ce que deviennent les commandes confirmees, agent par agent"
                : "Ce que chaque agent confirme, et en combien de temps"}
            </p>
          </div>
        </div>

        <Link
          href="/confirmation"
          className="flex items-center gap-1.5 self-start rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-50"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Retour
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <PeriodFilter range={range} onChange={setRange} />
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5">
          <DonutRing percent={rate} size={32} strokeWidth={4} />
          <p className="text-[12px] text-gray-500">
            Taux
            <br />
            {livraison ? "de livraison" : "de confirmation"}
          </p>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <div
              key={tile.label}
              className={`flex items-center gap-2.5 rounded-xl p-3.5 ${toneBg[tile.tone]}`}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white">
                <Icon className={`h-4 w-4 ${toneIcon[tile.tone]}`} />
              </div>
              <div className="min-w-0">
                <p className="font-mono text-[17px] font-semibold text-gray-900">
                  {tile.value}
                </p>
                <p
                  className="truncate text-[11.5px] text-gray-500"
                  title={tile.hint}
                >
                  {tile.label}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {loading && !stats ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white py-16 text-[13px] text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Calcul des statistiques...
        </div>
      ) : error ? (
        <p className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[12.5px] text-red-700">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      ) : agents.length === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-white py-16 text-center text-[13px] text-gray-400">
          Aucun compte dans l&apos;equipe. Creez-en depuis la page Utilisateurs.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <AgentPerformanceCard key={agent.id} agent={agent} section={section} />
          ))}
        </div>
      )}
    </div>
  );
}
