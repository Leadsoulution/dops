"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  Boxes,
  DollarSign,
  Loader2,
  Megaphone,
  Package,
  Plus,
  Receipt,
  Repeat,
  TrendingUp,
  Wallet,
  Zap,
} from "lucide-react";
import Sparkline from "./Sparkline";
import AreaTrendChart from "./AreaTrendChart";
import ExpensesTab from "./ExpensesTab";
import CarrierFloatCard from "./CarrierFloatCard";
import type { ExpenseType } from "@/lib/finance/expense-types";

/**
 * Finance : ce que la boutique a gagne, ce qu'elle a depense, et ce
 * qu'il reste.
 *
 * Tous les chiffres de cette page venaient de la maquette — un revenu
 * de vingt-sept millions, un profit de moins vingt-huit millions, des
 * courbes inventees. Ils ne bougeaient jamais et ne voulaient rien
 * dire. Ils viennent maintenant des commandes remises au client et des
 * charges saisies dans l'onglet Depenses.
 *
 * Le revenu est l'argent encaisse a la livraison : une commande
 * confirmee n'a rien rapporte tant que le colis n'est pas remis. Le
 * profit par commande livree divise ce qui reste par le nombre de
 * livraisons — c'est le chiffre qui dit si une vente de plus vaut la
 * peine d'etre faite.
 */

type Overview = {
  from: string;
  to: string;
  revenue: number;
  delivered: number;
  expenses: number;
  profit: number;
  profitPerDelivered: number;
  margin: number;
  byType: Record<ExpenseType, number>;
  lines: {
    id: string;
    label: string;
    type: ExpenseType;
    category?: string;
    amount: number;
    orders?: number;
    unit?: number;
  }[];
  monthly: { month: string; revenue: number; expenses: number; profit: number }[];
  inTransit: { orders: number; amount: number };
};

const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

function formatMad(value: number) {
  return `${nf.format(value)} MAD`;
}

/** "2026-09" devient "sept. 2026", comme ailleurs dans l'application. */
function moisCourt(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("fr-FR", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "2026-09-17" devient "17 sept. 2026". */
function jourCourt(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

const TYPE_CARDS: { type: ExpenseType; label: string; icon: typeof Boxes }[] = [
  { type: "par_commande", label: "Par commande", icon: Package },
  { type: "publicite", label: "Publicite", icon: Megaphone },
  { type: "fixe", label: "Fixes", icon: Repeat },
  { type: "variable", label: "Variables", icon: Zap },
  { type: "ponctuelle", label: "Ponctuelles", icon: Receipt },
];

const TYPE_LABELS: Record<ExpenseType, string> = {
  par_commande: "Par commande",
  fixe: "Fixe",
  variable: "Variable",
  publicite: "Publicite",
  ponctuelle: "Ponctuelle",
};

export default function FinancePage() {
  const [activeTab, setActiveTab] = useState<
    "vue-ensemble" | "depenses" | "rentabilite"
  >("vue-ensemble");
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Rechargee quand une charge est ajoutee ou modifiee : le profit en
  // depend, et un chiffre qui ne bouge pas apres une saisie passe pour
  // un chiffre faux.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/finance/summary")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.error) setError(d.error);
        else {
          setData(d as Overview);
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Chiffres indisponibles.");
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  const kpis = [
    {
      label: "Revenu livre",
      value: data?.revenue,
      subtitle: data
        ? `${data.delivered} livrees${
            data.inTransit.orders > 0 ? ` · ${data.inTransit.orders} en route` : ""
          }`
        : "commandes remises au client",
      icon: DollarSign,
      spark: data?.monthly.map((m) => m.revenue),
      sparkPositive: true,
    },
    {
      label: "Depenses totales",
      value: data?.expenses,
      subtitle: data ? `${data.lines.length} charges actives` : "charges saisies",
      icon: Receipt,
      spark: data?.monthly.map((m) => m.expenses),
      sparkPositive: false,
    },
    {
      label: "Profit total",
      value: data?.profit,
      subtitle: data ? `marge ${data.margin}%` : "revenu - depenses",
      icon: TrendingUp,
      badge: data && data.profit < 0 ? "negatif" : undefined,
      spark: data?.monthly.map((m) => m.profit),
      sparkPositive: (data?.profit ?? 0) >= 0,
    },
    {
      label: "Profit par commande livree",
      value: data?.profitPerDelivered,
      subtitle: data ? `sur ${data.delivered} livraisons` : "profit / livraisons",
      icon: Wallet,
    },
  ];

  const courbe = data?.monthly ?? [];
  const maxCourbe = Math.max(
    1,
    ...courbe.map((m) => Math.max(m.revenue, m.expenses))
  );
  // Quatre graduations rondes, calculees sur le plus haut point : les
  // valeurs etaient ecrites en dur et n'ont jamais correspondu a la
  // courbe qu'elles bordaient.
  const pas = Math.ceil(maxCourbe / 4 / 1000) * 1000 || 1000;
  const yAxisTicks = [4, 3, 2, 1, 0].map((i) => i * pas);

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
              {data
                ? `Du ${jourCourt(data.from)} au ${jourCourt(data.to)}`
                : "Vue d'ensemble financiere"}
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

      {error && (
        <p className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}

      <div className="mb-4">
        <CarrierFloatCard />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          const negative = (kpi.value ?? 0) < 0;
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
                    <span className="shrink-0 rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600">
                      {kpi.badge}
                    </span>
                  )}
                </div>
                <Icon className="h-4 w-4 shrink-0 text-gray-300" />
              </div>
              {kpi.value === undefined ? (
                <p className="flex h-[26px] items-center">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-300" />
                </p>
              ) : (
                <p
                  className={`truncate font-mono text-[19px] font-semibold ${
                    negative ? "text-red-600" : "text-gray-900"
                  }`}
                >
                  {formatMad(kpi.value)}
                </p>
              )}
              <p className="mb-1 text-[11px] text-gray-400">{kpi.subtitle}</p>
              {kpi.spark && kpi.spark.length > 1 && (
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

      {/* Les charges par nature : c'est la que se voit ce qui pese. */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {TYPE_CARDS.map(({ type, label, icon: Icon }) => {
          const montant = data?.byType[type];
          const part =
            data && data.expenses > 0 && montant
              ? Math.round((montant / data.expenses) * 100)
              : 0;
          return (
            <div
              key={type}
              className="rounded-xl border border-gray-200 bg-white p-3.5"
            >
              <div className="mb-2 flex items-start justify-between gap-1.5">
                <p className="truncate text-[10.5px] font-semibold uppercase tracking-wide text-gray-400">
                  {label}
                </p>
                <Icon className="h-4 w-4 shrink-0 text-gray-300" />
              </div>
              <p className="truncate font-mono text-[16px] font-semibold text-gray-900">
                {montant === undefined ? "—" : formatMad(montant)}
              </p>
              <p className="truncate text-[11px] text-gray-400">
                {montant ? `${part}% des depenses` : "aucune charge"}
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
            Cashflow &mdash; {courbe.length} derniers mois
          </p>
          {courbe.length === 0 ? (
            <p className="py-10 text-center text-[12.5px] text-gray-400">
              {data ? "Aucun mois a montrer." : "Lecture des chiffres..."}
            </p>
          ) : (
            <>
              <div className="flex items-stretch gap-2">
                <div className="flex shrink-0 flex-col justify-between py-1 font-mono text-[10px] text-gray-400">
                  {yAxisTicks.map((tick) => (
                    <span key={tick}>{nf.format(tick)}</span>
                  ))}
                </div>
                <div className="min-w-0 flex-1">
                  <AreaTrendChart
                    labels={courbe.map((m) => moisCourt(m.month))}
                    series={[
                      {
                        name: "depenses",
                        data: courbe.map((m) => m.expenses),
                        color: "#ef4444",
                      },
                      {
                        name: "revenu",
                        data: courbe.map((m) => m.revenue),
                        color: "#10b981",
                      },
                    ]}
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

              {/* Le profit du mois, en chiffres : une courbe ne se lit
                  pas au dirham pres, et c'est pourtant ce qu'on vient
                  chercher. */}
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[420px] text-[12.5px]">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                      <th className="py-2">Mois</th>
                      <th className="py-2 text-right">Revenu</th>
                      <th className="py-2 text-right">Depenses</th>
                      <th className="py-2 text-right">Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {courbe.map((m) => (
                      <tr key={m.month} className="border-b border-gray-50 last:border-0">
                        <td className="py-2 text-gray-700">{moisCourt(m.month)}</td>
                        <td className="py-2 text-right font-mono text-gray-700">
                          {nf.format(m.revenue)}
                        </td>
                        <td className="py-2 text-right font-mono text-gray-700">
                          {nf.format(m.expenses)}
                        </td>
                        <td
                          className={`py-2 text-right font-mono font-semibold ${
                            m.profit < 0 ? "text-red-600" : "text-emerald-600"
                          }`}
                        >
                          {nf.format(m.profit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === "depenses" && (
        <ExpensesTab onChanged={() => setVersion((v) => v + 1)} />
      )}

      {activeTab === "rentabilite" && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="mb-4 text-h3 font-semibold text-gray-900">
            Rentabilite de la periode
          </p>
          {!data ? (
            <p className="flex items-center justify-center gap-2 py-10 text-[12.5px] text-gray-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Lecture des chiffres...
            </p>
          ) : (
            <>
              <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-emerald-50 p-3.5">
                  <p className="text-[10.5px] font-semibold uppercase tracking-wide text-emerald-600">
                    Revenu livre
                  </p>
                  <p className="font-mono text-[17px] font-semibold text-gray-900">
                    {formatMad(data.revenue)}
                  </p>
                </div>
                <div className="rounded-lg bg-red-50 p-3.5">
                  <p className="text-[10.5px] font-semibold uppercase tracking-wide text-red-600">
                    Total depenses
                  </p>
                  <p className="font-mono text-[17px] font-semibold text-gray-900">
                    {formatMad(data.expenses)}
                  </p>
                </div>
                <div
                  className={`rounded-lg p-3.5 ${
                    data.profit < 0 ? "bg-red-50" : "bg-emerald-50"
                  }`}
                >
                  <p
                    className={`text-[10.5px] font-semibold uppercase tracking-wide ${
                      data.profit < 0 ? "text-red-600" : "text-emerald-600"
                    }`}
                  >
                    Profit net &middot; marge {data.margin}%
                  </p>
                  <p
                    className={`font-mono text-[17px] font-semibold ${
                      data.profit < 0 ? "text-red-600" : "text-gray-900"
                    }`}
                  >
                    {formatMad(data.profit)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-gray-500">
                    {formatMad(data.profitPerDelivered)} par commande livree
                  </p>
                </div>
              </div>

              <div className="mb-5 space-y-2">
                <div>
                  <div className="mb-1 flex items-center justify-between text-[11.5px] text-gray-500">
                    <span>Revenu</span>
                    <span className="font-mono">{formatMad(data.revenue)}</span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: data.revenue > 0 ? "100%" : "0%" }}
                    />
                  </div>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between text-[11.5px] text-gray-500">
                    <span>Depenses</span>
                    <span className="font-mono">{formatMad(data.expenses)}</span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-red-500"
                      style={{
                        width: `${
                          data.revenue > 0
                            ? Math.min(
                                100,
                                Math.round((data.expenses / data.revenue) * 100)
                              )
                            : data.expenses > 0
                              ? 100
                              : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Le detail : quelle charge coute quoi, et sur combien de
                  commandes. C'est ce qui permet de la discuter. */}
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Detail des charges
              </p>
              {data.lines.length === 0 ? (
                <p className="rounded-lg border border-dashed border-gray-200 py-6 text-center text-[12.5px] text-gray-400">
                  Aucune charge saisie sur la periode.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-[12.5px]">
                    <thead>
                      <tr className="border-b border-gray-100 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                        <th className="py-2">Charge</th>
                        <th className="py-2">Nature</th>
                        <th className="py-2 text-right">Base</th>
                        <th className="py-2 text-right">Total</th>
                        <th className="py-2 text-right">Part</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.lines.map((l) => (
                        <tr key={l.id} className="border-b border-gray-50 last:border-0">
                          <td className="py-2 text-gray-800">
                            {l.label}
                            {l.category && (
                              <span className="ml-1.5 text-[11px] text-gray-400">
                                {l.category}
                              </span>
                            )}
                          </td>
                          <td className="py-2 text-gray-500">{TYPE_LABELS[l.type]}</td>
                          <td className="py-2 text-right font-mono text-gray-500">
                            {l.orders !== undefined
                              ? `${nf.format(l.unit ?? 0)} x ${l.orders}`
                              : "—"}
                          </td>
                          <td className="py-2 text-right font-mono text-gray-800">
                            {nf.format(l.amount)}
                          </td>
                          <td className="py-2 text-right font-mono text-gray-400">
                            {data.expenses > 0
                              ? `${Math.round((l.amount / data.expenses) * 100)}%`
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
