"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  Calendar,
  FileBarChart,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  AlertTriangle,
  Info,
  Truck,
  RefreshCw,
  ShoppingCart,
  CheckCircle2,
  Clock,
  PhoneOff,
  PackageCheck,
  DollarSign,
} from "lucide-react";
import Sparkline from "./Sparkline";
import SourceDonut from "./SourceDonut";
import AreaTrendChart from "./AreaTrendChart";
import DateRangeCalendar from "./DateRangeCalendar";
import {
  kpiCards,
  funnelStages,
  leadsBySource,
  weeklyTrend,
  operationalInsights,
  topProducts,
  adPerformance,
  leadSourceHealth,
  carrierHealth,
  periodScale,
  scaleCount,
  formatKpiValue,
} from "./dashboard-data";
import { agentPerformance } from "./confirmation-data";
import { leads } from "./leads-data";
import AssignModal from "./AssignModal";
import { periodBounds, type Range } from "./useTeamStats";

/** Un indicateur tel que le serveur le renvoie. */
type Kpi = {
  key: string;
  label: string;
  value: number;
  unit?: "MAD";
  subtitle?: string;
  trend: string;
  trendUp: boolean;
  neutral?: boolean;
  spark: number[];
};

/** "4 200 MAD", "145", "-1 989 MAD". */
function formatKpi(kpi: Kpi): string {
  const sign = kpi.value < 0 ? "-" : "";
  const body = Math.abs(kpi.value).toLocaleString("fr-FR", {
    maximumFractionDigits: 0,
  });
  return kpi.unit ? `${sign}${body} ${kpi.unit}` : `${sign}${body}`;
}

const dateRanges = [
  "Aujourd'hui",
  "Hier",
  "7 derniers jours",
  "Ce mois-ci",
  "Maximum",
  "Personnalisee",
];

const topAgents = [...agentPerformance]
  .sort((a, b) => b.confirmRate - a.confirmRate)
  .slice(0, 3);

const recentActivity = leads.slice(0, 5);
const recentOrders = leads.slice(0, 5);

const kpiIcons: Record<string, typeof ShoppingCart> = {
  "Leads de la periode": ShoppingCart,
  Confirmes: CheckCircle2,
  "En attente": Clock,
  "Pas de reponse": PhoneOff,
  Expedies: Truck,
  Livres: PackageCheck,
  "COGS collecte": DollarSign,
  "Profit net estime": TrendingUp,
};

const todayLabel = new Date().toLocaleDateString("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const fullDateFmt = (d: Date) =>
  d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

export default function DashboardPage() {
  const [activeRange, setActiveRange] = useState("Maximum");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [customRangeLabel, setCustomRangeLabel] = useState<string | null>(null);
  const [customRange, setCustomRange] = useState<{ start: Date; end: Date } | null>(null);
  const [sourceTab, setSourceTab] = useState<"leads" | "carriers">("leads");
  const [panelScope, setPanelScope] = useState<"periode" | "direct">("periode");
  const [assignOpen, setAssignOpen] = useState(false);

  function applyCustomRange(start: Date, end: Date) {
    const fmt = (d: Date) =>
      d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
    setCustomRangeLabel(`${fmt(start)} - ${fmt(end)}`);
    setCustomRange({ start, end });
    setActiveRange("Personnalisee");
    setCalendarOpen(false);
  }

  /** Retire la plage personnalisee et revient a la periode par defaut. */
  function clearCustomRange() {
    setCustomRange(null);
    setCustomRangeLabel(null);
    setActiveRange("Maximum");
    setCalendarOpen(false);
  }

  // Indicateurs reels, relus a chaque changement de periode.
  const [kpis, setKpis] = useState<Kpi[] | null>(null);
  const bornes = periodBounds({
    label: activeRange,
    custom: customRange,
  } as Range);
  const kpiKey = `${bornes.from ?? ""}|${bornes.to ?? ""}`;

  useEffect(() => {
    let cancelled = false;
    const [from, to] = kpiKey.split("|");
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    fetch(`/api/dashboard/kpis?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && Array.isArray(d.kpis)) setKpis(d.kpis);
      })
      .catch(() => {
        /* Cartes vides plutot qu'un ecran d'erreur. */
      });
    return () => {
      cancelled = true;
    };
  }, [kpiKey]);

  const customDays = customRange
    ? Math.max(
        1,
        Math.round(
          (customRange.end.getTime() - customRange.start.getTime()) / 86400000
        ) + 1
      )
    : 1;
  const customScale = Math.min(1, Math.max(0.01, customDays / 365));
  const rangeScale =
    activeRange === "Personnalisee" ? customScale : periodScale[activeRange] ?? 1;
  const scale = panelScope === "direct" ? periodScale["Aujourd'hui"] : rangeScale;

  const periodeActiveLabel = (() => {
    const today = new Date();
    if (activeRange === "Aujourd'hui") return fullDateFmt(today);
    if (activeRange === "Hier") {
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      return fullDateFmt(yesterday);
    }
    if (activeRange === "7 derniers jours") {
      const start = new Date(today);
      start.setDate(today.getDate() - 6);
      return `${fullDateFmt(start)} – ${fullDateFmt(today)}`;
    }
    if (activeRange === "Ce mois-ci") {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return `${fullDateFmt(start)} – ${fullDateFmt(today)}`;
    }
    if (activeRange === "Personnalisee" && customRange) {
      return `${fullDateFmt(customRange.start)} – ${fullDateFmt(customRange.end)}`;
    }
    return "25 aout 2025 – 25 aout 2026";
  })();

  const pendingLeads = leads.filter((l) => l.status === "Nouveau");

  return (
    <div className="scrollbar-hide flex-1 overflow-y-auto bg-gray-50 px-4 py-4 lg:px-6 lg:py-5">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100">
            <LayoutDashboard className="h-4 w-4 text-gray-600" />
          </div>
          <div>
            <h1 className="text-h1 font-semibold text-gray-900">
              Tableau de bord
            </h1>
            <p className="text-[13px] capitalize text-gray-500">
              Vue d&apos;ensemble operationnelle &mdash;{" "}
              <span className="font-mono">{todayLabel}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
          <div className="flex items-center gap-2 overflow-x-auto lg:flex-wrap lg:overflow-visible">
            {dateRanges.map((range) => (
              <div key={range} className="relative shrink-0">
                <button
                  onClick={() => {
                    if (range === "Personnalisee") {
                      setCalendarOpen((v) => !v);
                    } else {
                      setActiveRange(range);
                      setCalendarOpen(false);
                    }
                  }}
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition-colors ${
                    activeRange === range
                      ? "bg-gray-900 text-white"
                      : "border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {range === "Maximum" && <Calendar className="h-3.5 w-3.5" />}
                  {range === "Personnalisee" && customRangeLabel
                    ? customRangeLabel
                    : range}
                </button>
                {range === "Personnalisee" && calendarOpen && (
                  <DateRangeCalendar
                    initialStart={customRange?.start}
                    initialEnd={customRange?.end}
                    onApply={applyCustomRange}
                    onClear={clearCustomRange}
                    onCancel={() => setCalendarOpen(false)}
                  />
                )}
              </div>
            ))}
          </div>
          <button
            disabled
            title="Bientot disponible"
            className="flex w-full cursor-not-allowed items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-[13px] font-medium text-gray-400 opacity-60 lg:w-auto"
          >
            <FileBarChart className="h-3.5 w-3.5" />
            Rapport complet
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-2.5 rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="h-3.5 w-3.5 shrink-0 text-blue-500" />
          <div>
            <p className="text-[10px] font-semibold tracking-wide text-gray-400">
              PERIODE ACTIVE
            </p>
            <p className="font-mono text-[13px] font-medium text-gray-800">
              {periodeActiveLabel}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:text-right">
          <p className="text-[10px] font-semibold tracking-wide text-gray-400">
            PORTEE DES PANNEAUX
          </p>
          <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 p-0.5">
            <button
              onClick={() => setPanelScope("periode")}
              className={`whitespace-nowrap rounded-md px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
                panelScope === "periode"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500"
              }`}
            >
              Sur la periode
            </button>
            <button
              onClick={() => setPanelScope("direct")}
              className={`whitespace-nowrap rounded-md px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
                panelScope === "direct"
                  ? "bg-gray-900 text-white"
                  : "text-gray-500"
              }`}
            >
              Direct
            </button>
          </div>
        </div>
      </div>

      <div className="mb-5 rounded-xl border border-gray-200 bg-white p-4">
        <p className="mb-3 text-[13.5px] font-semibold text-gray-900">
          Alertes du jour
        </p>
        <div className="space-y-2.5">
          <div className="flex flex-col gap-1 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <span className="flex items-center gap-2 text-[12.5px] text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span className="font-mono">{pendingLeads.length}</span> leads en
              attente de premiere confirmation
            </span>
            <button
              onClick={() => setAssignOpen(true)}
              className="shrink-0 text-left text-[12px] font-medium text-amber-700 hover:underline sm:text-right"
            >
              Assigner un agent
            </button>
          </div>
          <div className="flex flex-col gap-1 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <span className="flex items-center gap-2 text-[12.5px] text-blue-700">
              <Info className="h-3.5 w-3.5 shrink-0" />1 integration(s)
              necessite(nt) une action
            </span>
            <Link
              href="/integrations"
              className="shrink-0 text-left text-[12px] font-medium text-blue-700 hover:underline sm:text-right"
            >
              Acceder aux integrations
            </Link>
          </div>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(kpis ?? kpiCards.map((k) => ({ ...k, key: k.label }))).map((kpi) => {
          const Icon = kpiIcons[kpi.label] ?? ShoppingCart;
          return (
            <div
              key={kpi.key}
              className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white pt-3.5"
            >
              <div className="px-3.5">
              <div className="mb-2 flex items-start justify-between gap-1.5">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <p className="truncate text-[10.5px] font-semibold uppercase tracking-wide text-gray-400">
                    {kpi.label}
                  </p>
                  <span
                    className={`flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-medium ${
                      (kpi as Kpi).neutral
                        ? "bg-gray-100 text-gray-500"
                        : kpi.trendUp
                          ? "bg-emerald-50 text-emerald-600"
                          : "bg-red-50 text-red-600"
                    }`}
                  >
                    {(kpi as Kpi).neutral ? null : kpi.trendUp ? (
                      <TrendingUp className="h-2.5 w-2.5" />
                    ) : (
                      <TrendingDown className="h-2.5 w-2.5" />
                    )}
                    {kpi.trend}
                  </span>
                </div>
                <Icon className="h-4 w-4 shrink-0 text-gray-300" />
              </div>
              <div className="mb-1 flex items-baseline gap-1.5">
                <p className="truncate font-mono text-[18px] font-semibold text-gray-900">
                  {kpis ? formatKpi(kpi as Kpi) : formatKpiValue(kpi, scale)}
                </p>
                {kpi.subtitle && (
                  <span className="shrink-0 text-[11px] text-gray-400">
                    {kpi.subtitle}
                  </span>
                )}
              </div>
              </div>

              {/*
                La courbe occupe toute la largeur de la carte, bord a
                bord : elle sert de fond au chiffre plutot que de
                vignette posee a cote.
              */}
              <Sparkline
                data={kpi.spark}
                positive={kpi.trendUp}
                neutral={(kpi as Kpi).neutral}
                width={160}
                height={30}
                className="mt-1 block h-[38px] w-full"
              />
            </div>
          );
        })}
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="rounded-xl border border-gray-200 bg-white p-4 lg:col-span-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="flex items-center gap-2 text-[13.5px] font-semibold text-gray-900">
                Entonnoir de conversion
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10.5px] font-medium text-blue-600">
                  Sur la periode
                </span>
              </p>
              <p className="text-[12px] text-gray-500">
                Pipeline du lead a la livraison
              </p>
            </div>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-600">
              Taux global <span className="font-mono">64%</span>
            </span>
          </div>

          <div className="mb-3 flex items-center justify-between rounded-lg bg-red-50 px-3 py-2 text-[12px]">
            <span className="flex items-center gap-1.5 font-medium text-red-600">
              <TrendingDown className="h-3.5 w-3.5" />
              PLUS GROSSE FUITE &middot; Confirmes
            </span>
            <span className="font-mono font-semibold text-red-600">-26%</span>
          </div>

          <div className="space-y-2.5">
            {funnelStages.map((stage, i) => {
              const Icon = kpiIcons[stage.label] ?? ShoppingCart;
              return (
                <div
                  key={stage.label}
                  className="flex items-center gap-3 rounded-lg border border-gray-100 px-3 py-2"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] font-semibold text-gray-500">
                    {i + 1}
                  </span>
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white ${stage.color}`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-1.5">
                      <span className="text-[12.5px] text-gray-700">
                        {stage.label}
                      </span>
                      {stage.delta && (
                        <span className="text-[11px] font-medium text-emerald-600">
                          {stage.delta}
                        </span>
                      )}
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                      <div
                        className={`h-full rounded-full ${stage.color}`}
                        style={{ width: `${Math.max(stage.percent, 3)}%` }}
                      />
                    </div>
                  </div>
                  <div className="w-16 shrink-0 text-right">
                    <p className="font-mono text-[11px] text-gray-400">{stage.percent}%</p>
                    <p className="font-mono text-[12.5px] font-semibold text-gray-800">
                      {scaleCount(stage.value, scale).toLocaleString("fr-FR")}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 lg:col-span-2">
          <div className="mb-3 flex items-start justify-between">
            <div>
              <p className="flex items-center gap-2 text-[13.5px] font-semibold text-gray-900">
                Leads par source
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10.5px] font-medium text-blue-600">
                  Sur la periode
                </span>
              </p>
              <p className="text-[12px] text-gray-500">
                Repartition des acquisitions
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <SourceDonut data={leadsBySource} />
            <ul className="min-w-0 flex-1 space-y-1.5">
              {leadsBySource.map((slice) => (
                <li
                  key={slice.label}
                  className="flex items-center justify-between gap-2 text-[12px] text-gray-600"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: slice.color }}
                    />
                    <span className="truncate">{slice.label}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="font-mono text-gray-400">{slice.percent}%</span>
                    <span className="w-14 text-right font-mono font-medium text-gray-700">
                      {scaleCount(slice.value, scale).toLocaleString("fr-FR")}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="mb-5 rounded-xl border border-gray-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <p className="text-[13.5px] font-semibold text-gray-900">
              Tendance hebdomadaire
            </p>
            <p className="text-[12px] text-gray-500">Leads vs Confirmes &middot; 7 derniers jours</p>
          </div>
          <div className="flex items-center gap-3 text-[11.5px] text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-blue-500" />
              Leads
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Confirmes
            </span>
          </div>
        </div>
        <AreaTrendChart
          labels={weeklyTrend.labels}
          series={[
            { name: "leads", data: weeklyTrend.leads, color: "#3b82f6" },
            { name: "confirmes", data: weeklyTrend.confirmes, color: "#10b981" },
          ]}
        />
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[13.5px] font-semibold text-gray-900">
              Insights operationnels
            </p>
          </div>
          <div className="space-y-3">
            {operationalInsights.map((insight, i) => (
              <div key={i} className="flex items-start gap-2.5">
                {insight.tone === "warning" ? (
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                ) : (
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-400" />
                )}
                <p className="text-[12.5px] text-gray-700">{insight.text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[13.5px] font-semibold text-gray-900">
              Performance agents
            </p>
            <button className="text-[11.5px] font-medium text-blue-600 hover:underline">
              Voir le sommaire
            </button>
          </div>
          <div className="space-y-3">
            {topAgents.map((agent) => (
              <div key={agent.name} className="flex items-center gap-2.5">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10.5px] font-semibold text-white ${agent.avatarColor}`}
                >
                  {agent.name.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-medium text-gray-700">
                    {agent.name}
                  </p>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${agent.confirmRate}%` }}
                    />
                  </div>
                </div>
                <span className="shrink-0 font-mono text-[12px] font-semibold text-gray-700">
                  {agent.confirmRate}%
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[13.5px] font-semibold text-gray-900">
              Top produits
            </p>
            <button className="text-[11.5px] font-medium text-blue-600 hover:underline">
              Voir le sommaire
            </button>
          </div>
          <div className="space-y-3">
            {topProducts.map((product) => (
              <div key={product.name} className="flex items-center gap-2.5">
                <div className="h-8 w-8 shrink-0 rounded-md bg-gray-100" />
                <p className="min-w-0 flex-1 truncate text-[12.5px] text-gray-700">
                  {product.name}
                </p>
                <span className="shrink-0 font-mono text-[12px] font-semibold text-gray-700">
                  {scaleCount(product.count, scale).toLocaleString("fr-FR")}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[13.5px] font-semibold text-gray-900">
              Performance pub
            </p>
            <button className="text-[11.5px] font-medium text-blue-600 hover:underline">
              Voir le sommaire
            </button>
          </div>
          <div className="space-y-3">
            {adPerformance.map((ad) => (
              <div key={ad.platform} className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-100 text-[10px] font-medium text-gray-500">
                  {ad.platform.slice(0, 2)}
                </div>
                <p className="min-w-0 flex-1 truncate text-[12.5px] text-gray-700">
                  {ad.campaign}
                </p>
                <span className="shrink-0 font-mono text-[12px] font-semibold text-emerald-600">
                  {ad.metric}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[13.5px] font-semibold text-gray-900">
              Sante des sources
            </p>
            <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 p-0.5">
              <button
                onClick={() => setSourceTab("leads")}
                className={`rounded-md px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
                  sourceTab === "leads"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500"
                }`}
              >
                Sources de leads
              </button>
              <button
                onClick={() => setSourceTab("carriers")}
                className={`rounded-md px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
                  sourceTab === "carriers"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500"
                }`}
              >
                Transporteurs
              </button>
            </div>
          </div>
          <div className="space-y-3">
            {(sourceTab === "leads" ? leadSourceHealth : carrierHealth).map(
              (source) => (
                <div key={source.name}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-2 text-[12.5px] font-medium text-gray-700">
                      {sourceTab === "carriers" && (
                        <Truck className="h-3.5 w-3.5 text-gray-400" />
                      )}
                      {source.name}
                    </span>
                    <button
                      disabled
                      title="Bientot disponible"
                      className="flex cursor-not-allowed items-center gap-1 text-[11.5px] text-gray-400"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Voir logs
                    </button>
                  </div>
                  <p className="mb-1 text-[11.5px] text-gray-400">
                    {source.status}
                  </p>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={`h-full rounded-full ${source.color}`}
                      style={{ width: `${source.fill}%` }}
                    />
                  </div>
                </div>
              )
            )}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[13.5px] font-semibold text-gray-900">
              Activite recente
            </p>
            <Link
              href="/"
              className="flex items-center gap-1 text-[11.5px] font-medium text-blue-600 hover:underline"
            >
              Voir tout
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-3">
            {recentActivity.map((lead) => (
              <div key={lead.id} className="flex items-center gap-2.5">
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    lead.assignedTo ? "bg-emerald-500" : "bg-gray-300"
                  }`}
                />
                <p className="min-w-0 flex-1 truncate text-[12.5px] text-gray-700">
                  <span className="font-medium">{lead.reference}</span> &mdash;{" "}
                  {lead.client}{" "}
                  <span className="text-gray-400">
                    ({lead.assignedTo ? "assigne" : "non assigne"})
                  </span>
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[13.5px] font-semibold text-gray-900">
            Dernieres commandes
          </p>
          <Link
            href="/"
            className="flex items-center gap-1 text-[11.5px] font-medium text-blue-600 hover:underline"
          >
            Voir tout
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="space-y-2">
          {recentOrders.map((lead) => (
            <div
              key={lead.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-[12.5px] font-medium text-gray-800">
                  {lead.reference}
                </p>
                <p className="truncate text-[11.5px] text-gray-400">
                  {lead.client}
                </p>
              </div>
              <span className="shrink-0 font-mono text-[12.5px] font-semibold text-gray-900">
                {lead.amount}
              </span>
            </div>
          ))}
        </div>
      </div>

      {assignOpen && (
        <AssignModal
          count={pendingLeads.length}
          onClose={() => setAssignOpen(false)}
          onApply={() => setAssignOpen(false)}
        />
      )}
    </div>
  );
}
