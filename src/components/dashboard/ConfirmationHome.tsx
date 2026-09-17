"use client";

import { useEffect, useState } from "react";
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
import { periodBounds, useTeamStats, type Range } from "./useTeamStats";

type PayReport = {
  rate: number;
  orders: { paid: boolean }[];
  totals: { dueAmount: number }[];
  payments: { paidAt: string; count: number; amount: number; paidBy: string }[];
};

/** "17 sept. 2026, 16:18", a l'heure du Maroc. */
function whenText(iso: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Africa/Casablanca",
  }).format(new Date(iso));
}

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

  // Le suivi des paiements vient d'une autre route : il lit les
  // livraisons et non le journal des agents. Son absence ne doit pas
  // emporter la page — tant que la migration n'est pas passee, le cadre
  // s'affiche sans chiffres plutot que de disparaitre.
  const [pay, setPay] = useState<PayReport | null>(null);
  const bounds = periodBounds(range);
  const payKey = `${bounds.from ?? ""}|${bounds.to ?? ""}`;

  useEffect(() => {
    let cancelled = false;
    const [from, to] = payKey.split("|");
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    fetch(`/api/confirmation-payments?${params}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && !data.error) setPay(data);
      })
      .catch(() => {
        /* Cadre sans chiffres : le detail reste accessible. */
      });
    return () => {
      cancelled = true;
    };
  }, [payKey]);

  const delivered = pay?.orders.length ?? 0;
  const paidCount = pay?.orders.filter((o) => o.paid).length ?? 0;
  const dueAmount = (pay?.totals ?? []).reduce((s, t) => s + t.dueAmount, 0);
  const lastPayment = pay?.payments[0];

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

          {/*
            Troisieme cadre, pleine largeur : le paiement decoule des deux
            premiers — on confirme, la commande est livree, l'agent est
            paye. Il vient donc apres, et non a cote.
          */}
          <Link
            href="/confirmation/paiement"
            className="group flex flex-col rounded-xl border border-gray-200 bg-white p-5 transition-colors hover:border-amber-300 lg:col-span-2"
          >
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50">
                <Wallet className="h-5 w-5 text-amber-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-h2 font-semibold text-gray-900">
                  Paiement de confirmatrice
                </p>
                <p className="mt-0.5 text-[12.5px] text-gray-500">
                  Commission versee a l&apos;agent pour chaque commande livree
                  &middot;{" "}
                  <span className="font-mono">{pay?.rate ?? 11} DH</span> par
                  commande
                </p>
              </div>
              <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-gray-500" />
            </div>

            <div className="grid grid-cols-2 gap-4 border-t border-gray-100 pt-4 sm:grid-cols-4">
              <Figure value={delivered} label="Commandes livrees" />
              <Figure value={paidCount} label="Payees" tone="text-emerald-600" />
              <Figure
                value={delivered - paidCount}
                label="Non payees"
                tone="text-amber-600"
              />
              <div className="min-w-0">
                <p className="font-mono text-[19px] font-semibold text-gray-900">
                  {dueAmount.toLocaleString("fr-FR")} DH
                </p>
                <p className="truncate text-[11.5px] text-gray-500">
                  Reste a payer
                </p>
              </div>
            </div>

            <p className="mt-4 border-t border-gray-100 pt-3 text-[12px] text-gray-500">
              {lastPayment ? (
                <>
                  Dernier paiement le{" "}
                  <span className="font-medium text-gray-700">
                    {whenText(lastPayment.paidAt)}
                  </span>{" "}
                  &middot;{" "}
                  <span className="font-mono">{lastPayment.count}</span> commande
                  {lastPayment.count > 1 ? "s" : ""} pour{" "}
                  <span className="font-mono font-medium text-gray-700">
                    {Math.round(lastPayment.amount)} DH
                  </span>
                  {lastPayment.paidBy && <> &middot; par {lastPayment.paidBy}</>}
                </>
              ) : (
                "Aucun paiement enregistre pour l'instant."
              )}
            </p>
          </Link>
        </div>
      )}
    </>
  );
}

function Figure({
  value,
  label,
  tone = "text-gray-900",
}: {
  value: number;
  label: string;
  tone?: string;
}) {
  return (
    <div className="min-w-0">
      <p className={`font-mono text-[19px] font-semibold ${tone}`}>
        {value.toLocaleString("fr-FR")}
      </p>
      <p className="truncate text-[11.5px] text-gray-500">{label}</p>
    </div>
  );
}
