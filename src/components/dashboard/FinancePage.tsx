"use client";

import { useState } from "react";
import {
  Boxes,
  Clock,
  DollarSign,
  Plus,
  Receipt,
  TrendingDown,
  TrendingUp,
  Truck,
  Wallet,
} from "lucide-react";
import Sparkline from "./Sparkline";
import AreaTrendChart from "./AreaTrendChart";
import ExpensesTab from "./ExpensesTab";
import CarrierFloatCard from "./CarrierFloatCard";
import {
  financeKpis,
  expenseKpis,
  cashflowMonths,
  cashflowSeries,
} from "./finance-data";

const kpiIcons: Record<string, typeof DollarSign> = {
  "Revenu total": DollarSign,
  "COD recu": Wallet,
  "COD en attente": Clock,
  "Profit estime": TrendingUp,
};

const expenseIcons: Record<string, typeof Boxes> = {
  "Achats fournisseurs": Boxes,
  "Paiements fournisseurs": TrendingDown,
  "Frais livraison": Truck,
  "Depenses manuelles": Receipt,
  "Total depenses": Boxes,
};

const badgeStyles: Record<string, string> = {
  emerald: "bg-emerald-50 text-emerald-600",
  orange: "bg-orange-50 text-orange-600",
  red: "bg-red-50 text-red-600",
  neutral: "bg-gray-100 text-gray-500",
};

function formatMad(value: number) {
  return `${value.toLocaleString("fr-FR")} MAD`;
}

export default function FinancePage() {
  const [activeTab, setActiveTab] = useState<
    "vue-ensemble" | "depenses" | "rentabilite"
  >("vue-ensemble");

  const yAxisTicks = [60000, 45000, 30000, 15000, 0];

  return (
    <div className="scrollbar-hide flex-1 overflow-y-auto bg-gray-50 px-4 py-4 lg:px-6 lg:py-5">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100">
            <DollarSign className="h-4 w-4 text-gray-600" />
          </div>
          <div>
            <h1 className="text-h1 font-semibold text-gray-900">Finance</h1>
            <p className="text-[13px] text-gray-500">
              Vue d&apos;ensemble financiere
            </p>
          </div>
        </div>

        <button
          onClick={() => setActiveTab("depenses")}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-gray-900 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-gray-800 sm:w-auto"
        >
          <Plus className="h-3.5 w-3.5" />
          Ajouter depense
        </button>
      </div>

      {/*
        Le seul chiffre reel de cette page pour l'instant : il est donc
        pose au-dessus, la ou on le verra, et non noye parmi les cartes
        d'exemple qui l'entourent encore.
      */}
      <div className="mb-4">
        <CarrierFloatCard />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {financeKpis.map((kpi) => {
          const Icon = kpiIcons[kpi.label] ?? DollarSign;
          const negative = kpi.value < 0;
          return (
            <div
              key={kpi.label}
              className="overflow-hidden rounded-xl border border-gray-200 bg-white p-3.5"
            >
              <div className="mb-2 flex items-start justify-between gap-1.5">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <p className="truncate text-[10.5px] font-semibold uppercase tracking-wide text-gray-400">
                    {kpi.label}
                  </p>
                  {kpi.badge && (
                    <span
                      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${badgeStyles[kpi.badgeTone]}`}
                    >
                      {kpi.badge}
                    </span>
                  )}
                </div>
                <Icon className="h-4 w-4 shrink-0 text-gray-300" />
              </div>
              <p
                className={`truncate font-mono text-[19px] font-semibold ${
                  negative ? "text-red-600" : "text-gray-900"
                }`}
              >
                {formatMad(kpi.value)}
              </p>
              <p className="mb-1 text-[11px] text-gray-400">{kpi.subtitle}</p>
              {kpi.spark && (
                <Sparkline
                  data={kpi.spark}
                  positive={kpi.sparkPositive ?? true}
                  width={160}
                  height={30}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {expenseKpis.map((kpi) => {
          const Icon = expenseIcons[kpi.label] ?? Boxes;
          return (
            <div
              key={kpi.label}
              className="rounded-xl border border-gray-200 bg-white p-3.5"
            >
              <div className="mb-2 flex items-start justify-between gap-1.5">
                <p className="truncate text-[10.5px] font-semibold uppercase tracking-wide text-gray-400">
                  {kpi.label}
                </p>
                <Icon className="h-4 w-4 shrink-0 text-gray-300" />
              </div>
              <p className="truncate font-mono text-[16px] font-semibold text-gray-900">
                {formatMad(kpi.value)}
              </p>
              <p className="truncate text-[11px] text-gray-400">
                {kpi.subtitle}
              </p>
            </div>
          );
        })}
      </div>

      <div className="mb-4 flex items-center gap-6 border-b border-gray-200">
        <button
          onClick={() => setActiveTab("vue-ensemble")}
          className={`whitespace-nowrap border-b-2 pb-2.5 text-[13.5px] transition-colors ${
            activeTab === "vue-ensemble"
              ? "border-gray-900 font-semibold text-gray-900"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Vue d&apos;ensemble
        </button>
        <button
          onClick={() => setActiveTab("depenses")}
          className={`whitespace-nowrap border-b-2 pb-2.5 text-[13.5px] transition-colors ${
            activeTab === "depenses"
              ? "border-gray-900 font-semibold text-gray-900"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Depenses
        </button>
        <button
          onClick={() => setActiveTab("rentabilite")}
          className={`whitespace-nowrap border-b-2 pb-2.5 text-[13.5px] transition-colors ${
            activeTab === "rentabilite"
              ? "border-gray-900 font-semibold text-gray-900"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Rentabilite
        </button>
      </div>

      {activeTab === "vue-ensemble" && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="mb-4 text-h3 font-semibold text-gray-900">
            Cashflow &mdash; 6 derniers mois
          </p>
          <div className="flex items-stretch gap-2">
            <div className="flex shrink-0 flex-col justify-between py-1 font-mono text-[10px] text-gray-400">
              {yAxisTicks.map((tick) => (
                <span key={tick}>{tick.toLocaleString("fr-FR")}k</span>
              ))}
            </div>
            <div className="min-w-0 flex-1">
              <AreaTrendChart
                labels={cashflowMonths}
                series={cashflowSeries}
                height={260}
              />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-4 text-[11.5px] text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              Depenses
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Revenu
            </span>
          </div>
        </div>
      )}

      {activeTab === "depenses" && <ExpensesTab />}

      {activeTab === "rentabilite" && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="mb-4 text-h3 font-semibold text-gray-900">
            Rentabilite de la periode
          </p>
          {(() => {
            const revenu = financeKpis.find((k) => k.label === "Revenu total")?.value ?? 0;
            const depenses =
              expenseKpis.find((k) => k.label === "Total depenses")?.value ?? 0;
            const profit = financeKpis.find((k) => k.label === "Profit estime")?.value ?? 0;
            const marge = revenu > 0 ? Math.round((profit / revenu) * 100) : 0;
            const revenuBar = 100;
            const depensesBar = revenu > 0 ? Math.min(100, Math.round((depenses / revenu) * 100)) : 0;
            return (
              <>
                <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-lg bg-emerald-50 p-3.5">
                    <p className="text-[10.5px] font-semibold uppercase tracking-wide text-emerald-600">
                      Revenu total
                    </p>
                    <p className="font-mono text-[17px] font-semibold text-gray-900">
                      {formatMad(revenu)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-red-50 p-3.5">
                    <p className="text-[10.5px] font-semibold uppercase tracking-wide text-red-600">
                      Total depenses
                    </p>
                    <p className="font-mono text-[17px] font-semibold text-gray-900">
                      {formatMad(depenses)}
                    </p>
                  </div>
                  <div className={`rounded-lg p-3.5 ${profit < 0 ? "bg-red-50" : "bg-emerald-50"}`}>
                    <p
                      className={`text-[10.5px] font-semibold uppercase tracking-wide ${
                        profit < 0 ? "text-red-600" : "text-emerald-600"
                      }`}
                    >
                      Profit net &middot; marge {marge}%
                    </p>
                    <p
                      className={`font-mono text-[17px] font-semibold ${
                        profit < 0 ? "text-red-600" : "text-gray-900"
                      }`}
                    >
                      {formatMad(profit)}
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div>
                    <div className="mb-1 flex items-center justify-between text-[11.5px] text-gray-500">
                      <span>Revenu</span>
                      <span className="font-mono">{formatMad(revenu)}</span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${revenuBar}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-[11.5px] text-gray-500">
                      <span>Depenses</span>
                      <span className="font-mono">{formatMad(depenses)}</span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
                      <div className="h-full rounded-full bg-red-500" style={{ width: `${depensesBar}%` }} />
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}

    </div>
  );
}
