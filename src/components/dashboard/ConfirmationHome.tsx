"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Truck,
  Wallet,
} from "lucide-react";
import DonutRing from "./DonutRing";
import PeriodFilter from "./PeriodFilter";
import { useTeamStats, type Range } from "./useTeamStats";

/**
 * Entree de la confirmation : deux cadres, deux questions.
 *
 * Le premier dit ce que l'equipe a confirme, le second ce que ces
 * confirmations sont devenues chez le transporteur. On choisit laquelle
 * regarder avant de descendre au detail par agent, plutot que de faire
 * defiler les deux d'un coup.
 */

export default function ConfirmationHome() {
  const [range, setRange] = useState<Range>({ label: "Maximum", custom: null });
  const { stats, error, loading } = useTeamStats(range);

  const cards = [
    {
      href: "/confirmation/agents",
      title: "Confirmation",
      description: "Commandes traitees par l'equipe et confirmees au telephone",
      icon: CheckCircle2,
      accent: "emerald" as const,
      percent: stats?.team.confirmRate ?? 0,
      rateLabel: "Taux de confirmation",
      figures: [
        { value: stats?.team.treated ?? 0, label: "Traitees" },
        { value: stats?.team.confirmed ?? 0, label: "Confirmees" },
        { value: stats?.team.contacted ?? 0, label: "Contactes" },
      ],
    },
    {
      href: "/confirmation/livraison",
      title: "Livraison",
      description: "Devenir des commandes confirmees, une fois chez le transporteur",
      icon: Truck,
      accent: "blue" as const,
      percent: stats?.delivery.rate ?? 0,
      rateLabel: "Taux de livraison",
      figures: [
        { value: stats?.delivery.shipped ?? 0, label: "Expediees" },
        { value: stats?.delivery.delivered ?? 0, label: "Livrees" },
        { value: stats?.delivery.returned ?? 0, label: "Retours" },
      ],
    },
  ];

  const accents = {
    amber: {
      ring: "#d97706",
      bg: "bg-amber-50",
      icon: "text-amber-600",
      hover: "hover:border-amber-300",
    },
    emerald: {
      ring: "#10b981",
      bg: "bg-emerald-50",
      icon: "text-emerald-600",
      hover: "hover:border-emerald-300",
    },
    blue: {
      ring: "#2563eb",
      bg: "bg-blue-50",
      icon: "text-blue-600",
      hover: "hover:border-blue-300",
    },
  };

  return (
    <>
      <div className="mb-4">
        <PeriodFilter range={range} onChange={setRange} />
      </div>

      {stats && (
        <Link
          href="/confirmation/paiement"
          className="group mb-4 flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 transition-colors hover:border-amber-300"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50">
            <Wallet className="h-5 w-5 text-amber-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-gray-900">
              Paiement de confirmatrice
            </p>
            <p className="text-[12.5px] text-gray-500">
              Commissions dues sur les{" "}
              <span className="font-mono">{stats.delivery.delivered}</span>{" "}
              commande{stats.delivery.delivered > 1 ? "s" : ""} livree
              {stats.delivery.delivered > 1 ? "s" : ""}
            </p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-gray-500" />
        </Link>
      )}

      {error ? (
        <p className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[12.5px] text-red-700">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      ) : loading && !stats ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white py-20 text-[13px] text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Calcul des statistiques...
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {cards.map((card) => {
            const Icon = card.icon;
            const a = accents[card.accent];
            return (
              <Link
                key={card.href}
                href={card.href}
                className={`group flex flex-col rounded-xl border border-gray-200 bg-white p-5 transition-colors ${a.hover}`}
              >
                <div className="mb-4 flex items-start gap-3">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${a.bg}`}
                  >
                    <Icon className={`h-5 w-5 ${a.icon}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-h2 font-semibold text-gray-900">
                      {card.title}
                    </p>
                    <p className="mt-0.5 text-[12.5px] text-gray-500">
                      {card.description}
                    </p>
                  </div>
                  <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-gray-500" />
                </div>

                <div className="flex items-center gap-5 border-t border-gray-100 pt-4">
                  <div className="flex shrink-0 flex-col items-center gap-1.5">
                    <DonutRing
                      percent={card.percent}
                      size={76}
                      strokeWidth={7}
                      color={card.percent === 0 ? "#d1d5db" : a.ring}
                    />
                    <p className="text-[11px] text-gray-400">{card.rateLabel}</p>
                  </div>

                  <div className="grid flex-1 grid-cols-3 gap-2">
                    {card.figures.map((f) => (
                      <div key={f.label} className="min-w-0">
                        <p className="font-mono text-[19px] font-semibold text-gray-900">
                          {f.value.toLocaleString("fr-FR")}
                        </p>
                        <p className="truncate text-[11.5px] text-gray-500">
                          {f.label}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <p className="mt-4 text-[12.5px] font-medium text-gray-500 group-hover:text-gray-700">
                  Voir le detail par agent
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
