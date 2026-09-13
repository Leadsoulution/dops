"use client";

import { useState } from "react";
import {
  Settings2,
  RefreshCw,
  Save,
  Calendar,
  Clock,
  Activity,
  Phone,
  Target,
  Maximize2,
  User,
  Info,
} from "lucide-react";
import DonutRing from "./DonutRing";
import AgentPerformanceCard from "./AgentPerformanceCard";
import Toggle from "./Toggle";
import SelectDropdown from "./SelectDropdown";
import RuleList from "./RuleList";
import DateRangeCalendar from "./DateRangeCalendar";
import {
  agentPerformance,
  rebalanceModes,
  percentageRules,
  sourceKeyOptions,
  productCatalog,
  regionOptions,
  initialProductRules,
  initialSourceRules,
  initialRegionRules,
  excludedFromReassignment,
  type AssignedRule,
} from "./confirmation-data";
import { agents } from "./leads-data";
import { periodScale, scaleCount } from "./dashboard-data";

const dateRanges = [
  "Aujourd'hui",
  "Hier",
  "7 derniers jours",
  "Ce mois-ci",
  "Maximum",
  "Personnalisee",
];

const modeDescriptions: Record<string, string> = {
  "Par pourcentage":
    "Repartissez les nouvelles assignations entre les agents actifs avec des poids.",
  "Par produit":
    "Faites correspondre le produit selectionne au catalogue admin. La regle assignera d'utiliser l'id du produit correspondant. Chaque produit cible peut avoir un agent qui recoit les commandes correspondantes.",
  "Par source":
    "Faites correspondre la source ou le nom de source enregistre sur les commandes entrantes. Chaque regle cible une seule source qui pointe vers un seul agent.",
  "Par region":
    "Faites correspondre la ville ou region enregistree sur les commandes entrantes. Chaque regle cible une ville ou region personnalisee.",
  Manuel:
    "Aucune assignation automatique n'est appliquee dans ce mode. Chaque commande doit etre assignee manuellement depuis Leads & Commandes.",
};

export default function ConfirmationPage() {
  const [activeTab, setActiveTab] = useState<"performance" | "parametres">(
    "performance"
  );
  const [activeRange, setActiveRange] = useState("Maximum");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [customRangeLabel, setCustomRangeLabel] = useState<string | null>(null);
  const [customRange, setCustomRange] = useState<{ start: Date; end: Date } | null>(null);
  const [activeMode, setActiveMode] = useState(rebalanceModes[0]);
  const [autoAssign, setAutoAssign] = useState(true);
  const [autoReassign, setAutoReassign] = useState(true);
  const [dedupDetection, setDedupDetection] = useState(true);
  const [excluded, setExcluded] = useState<string[]>(excludedFromReassignment);
  const [productRules, setProductRules] = useState<AssignedRule[]>(initialProductRules);
  const [sourceRules, setSourceRules] = useState<AssignedRule[]>(initialSourceRules);
  const [regionRules, setRegionRules] = useState<AssignedRule[]>(initialRegionRules);
  const [weights, setWeights] = useState<Record<string, number>>(
    Object.fromEntries(percentageRules.map((r) => [r.name, r.weight]))
  );

  const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
  const weightedRules = percentageRules.map((rule) => ({
    ...rule,
    weight: weights[rule.name],
    percent:
      totalWeight > 0 ? Math.round((weights[rule.name] / totalWeight) * 100) : 0,
  }));
  const totalPercent = weightedRules.reduce((sum, r) => sum + r.percent, 0);

  function resetWeights() {
    setWeights(Object.fromEntries(percentageRules.map((r) => [r.name, r.weight])));
  }

  const customDays = customRange
    ? Math.max(
        1,
        Math.round(
          (customRange.end.getTime() - customRange.start.getTime()) / 86400000
        ) + 1
      )
    : 1;
  const customScale = Math.min(1, Math.max(0.01, customDays / 365));
  const scale =
    activeRange === "Personnalisee" ? customScale : periodScale[activeRange] ?? 1;

  const scaledAgents = agentPerformance.map((agent) => ({
    ...agent,
    assigned: scaleCount(agent.assigned, scale),
    contacted: scaleCount(agent.contacted, scale),
    confirmed: scaleCount(agent.confirmed, scale),
    pending: scaleCount(agent.pending, scale),
  }));

  const teamAssigned = agentPerformance.reduce((sum, a) => sum + a.assigned, 0);
  const teamConfirmed = agentPerformance.reduce((sum, a) => sum + a.confirmed, 0);
  const teamContacted = scaledAgents.reduce((sum, a) => sum + a.contacted, 0);
  const globalRate = teamAssigned > 0 ? Math.round((teamConfirmed / teamAssigned) * 100) : 0;

  function toggleExcluded(name: string) {
    setExcluded((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  }

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

  const productOptions = productCatalog.map((p) => ({ label: p.name, sublabel: p.sku }));
  const sourceOptions = sourceKeyOptions.map((s) => ({ label: s }));
  const regionSelectOptions = regionOptions.map((r) => ({ label: r }));

  return (
    <div className="scrollbar-hide flex-1 overflow-y-auto bg-gray-50 px-4 py-4 lg:px-6 lg:py-5">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100">
            <Settings2 className="h-4 w-4 text-gray-600" />
          </div>
          <div>
            <h1 className="text-h1 font-semibold text-gray-900">
              Gestion de la confirmation
            </h1>
            <p className="text-[13px] text-gray-500">
              Configurez les regles d&apos;assignation et suivez la performance
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            disabled
            title="Bientot disponible"
            className="flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-[13px] font-medium text-gray-400 opacity-60"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Reequilibrer
          </button>
          <button
            disabled
            title="Bientot disponible"
            className="flex cursor-not-allowed items-center gap-1.5 rounded-lg bg-gray-300 px-3.5 py-2 text-[13px] font-medium text-gray-500"
          >
            <Save className="h-3.5 w-3.5" />
            Enregistrer
          </button>
        </div>
      </div>

      <div className="mb-5 flex items-center gap-6 border-b border-gray-200">
        <button
          onClick={() => setActiveTab("performance")}
          className={`whitespace-nowrap border-b-2 pb-2.5 text-[13.5px] transition-colors ${
            activeTab === "performance"
              ? "border-gray-900 font-semibold text-gray-900"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Performance agents
        </button>
        <button
          onClick={() => setActiveTab("parametres")}
          className={`whitespace-nowrap border-b-2 pb-2.5 text-[13.5px] transition-colors ${
            activeTab === "parametres"
              ? "border-gray-900 font-semibold text-gray-900"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Parametres
        </button>
      </div>

      {activeTab === "performance" ? (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {dateRanges.map((range) => (
                <div key={range} className="relative">
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

            <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5">
              <DonutRing percent={globalRate} size={32} strokeWidth={4} />
              <p className="text-[12px] text-gray-500">
                Taux de
                <br />
                confirmation
              </p>
            </div>
          </div>

          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-stretch">
            <div className="grid flex-1 grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="flex items-center gap-2.5 rounded-xl bg-violet-50 p-3.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white">
                  <Clock className="h-4 w-4 text-violet-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-[17px] font-semibold text-gray-900">—</p>
                  <p className="truncate text-[11.5px] text-gray-500">
                    Duree moy. traitement
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 rounded-xl bg-violet-50 p-3.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white">
                  <Activity className="h-4 w-4 text-violet-600" />
                </div>
                <div className="min-w-0">
                  <p className="font-mono text-[17px] font-semibold text-gray-900">
                    3m 37s
                  </p>
                  <p className="truncate text-[11.5px] text-gray-500">
                    Duree moy. session
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 rounded-xl bg-blue-50 p-3.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white">
                  <Phone className="h-4 w-4 text-blue-600" />
                </div>
                <div className="min-w-0">
                  <p className="font-mono text-[17px] font-semibold text-gray-900">
                    {teamContacted.toLocaleString("fr-FR")}
                  </p>
                  <p className="truncate text-[11.5px] text-gray-500">
                    Contactes (equipe)
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 rounded-xl bg-emerald-50 p-3.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white">
                  <Target className="h-4 w-4 text-emerald-600" />
                </div>
                <div className="min-w-0">
                  <p className="font-mono text-[17px] font-semibold text-gray-900">
                    {globalRate}%
                  </p>
                  <p className="truncate text-[11.5px] text-gray-500">
                    Taux conv. equipe
                  </p>
                </div>
              </div>
            </div>
            <button
              disabled
              title="Bientot disponible"
              className="flex h-11 w-11 shrink-0 cursor-not-allowed items-center justify-center self-center rounded-lg bg-gray-200 text-gray-400 sm:self-stretch"
            >
              <Maximize2 className="h-4.5 w-4.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {scaledAgents.map((agent) => (
              <AgentPerformanceCard key={agent.name} agent={agent} />
            ))}
          </div>
        </>
      ) : (
        <div className="max-w-3xl space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold tracking-wide text-gray-500">
                  MODE ACTIF &mdash; {activeMode.toUpperCase()}
                </p>
                <p className="mt-1 text-[12.5px] text-gray-500">
                  {modeDescriptions[activeMode]}
                </p>
              </div>
              <div className="w-full shrink-0 sm:w-52">
                <SelectDropdown
                  variant="field"
                  pinnedLabel={rebalanceModes[0]}
                  options={rebalanceModes}
                  value={activeMode}
                  onSelect={setActiveMode}
                />
              </div>
            </div>

            {activeMode === "Par pourcentage" && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[13px] font-semibold text-gray-800">
                    Regles pour ce mode
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      disabled
                      title="Bientot disponible"
                      className="cursor-not-allowed rounded-md border border-gray-300 bg-white px-3 py-1.5 text-[12px] font-medium text-gray-400 opacity-60"
                    >
                      Expliquer
                    </button>
                    <button
                      onClick={resetWeights}
                      className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-[12px] font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Reinitialiser
                    </button>
                  </div>
                </div>
                <div className="space-y-3">
                  {weightedRules.map((rule) => (
                    <div key={rule.name} className="flex items-center gap-3">
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white ${rule.avatarColor}`}
                      >
                        {rule.name.charAt(0).toUpperCase()}
                      </span>
                      <span className="w-32 shrink-0 truncate text-[12.5px] text-gray-700">
                        {rule.name}
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={30}
                        value={rule.weight}
                        onChange={(e) =>
                          setWeights((prev) => ({
                            ...prev,
                            [rule.name]: Number(e.target.value),
                          }))
                        }
                        className="h-1.5 flex-1 cursor-pointer accent-gray-900"
                      />
                      <span className="w-6 shrink-0 text-right font-mono text-[12.5px] text-gray-500">
                        {rule.weight}
                      </span>
                      <span className="w-10 shrink-0 text-right font-mono text-[12.5px] font-medium text-gray-700">
                        {rule.percent}%
                      </span>
                    </div>
                  ))}
                  <div
                    className={`mt-3 rounded-lg px-3 py-2 text-center text-[12.5px] font-medium ${
                      totalPercent === 100
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    <span className="font-mono">{totalPercent}%</span> &middot; Total reparti
                  </div>
                </div>
              </div>
            )}

            {activeMode === "Par produit" && (
              <RuleList
                rules={productRules}
                onChange={setProductRules}
                options={productOptions}
                emptyText="Aucune regle pour ce mode"
                searchPlaceholder="Selectionner une valeur"
              />
            )}

            {activeMode === "Par source" && (
              <RuleList
                rules={sourceRules}
                onChange={setSourceRules}
                options={sourceOptions}
                emptyText="Aucune regle pour ce mode"
                searchPlaceholder="Selectionner une valeur"
              />
            )}

            {activeMode === "Par region" && (
              <RuleList
                rules={regionRules}
                onChange={setRegionRules}
                options={regionSelectOptions}
                emptyText="Aucune regle pour ce mode"
                searchPlaceholder="Selectionner une valeur"
              />
            )}

            {activeMode === "Manuel" && (
              <div className="flex items-start gap-2.5 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-4">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                <p className="text-[12.5px] text-gray-500">
                  {modeDescriptions.Manuel}
                </p>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="mb-1 text-[13px] font-semibold text-gray-800">
              Regles automatiques
            </p>
            <div className="divide-y divide-gray-100">
              <Toggle
                checked={autoAssign}
                onChange={() => setAutoAssign((v) => !v)}
                label="Auto-assignation"
                description="Assigner automatiquement les nouveaux leads"
              />
              <Toggle
                checked={autoReassign}
                onChange={() => setAutoReassign((v) => !v)}
                label="Reassignation automatique des non-reponses"
                description="Controle le retour en file, la limite de tentatives et le transfert entre agents"
              />
            </div>

            {autoReassign && (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-gray-200 p-3">
                  <label className="mb-1 block text-[12px] font-medium text-gray-600">
                    Retour en file
                  </label>
                  <input
                    type="number"
                    defaultValue={90}
                    className="w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-[13px] text-gray-800 focus:border-blue-400 focus:outline-none"
                  />
                  <p className="mt-1 text-[11px] text-gray-400">
                    Temps avant qu&apos;une commande soit remise en file si
                    l&apos;agent ne repond pas
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                  <label className="mb-1 block text-[12px] font-medium text-gray-600">
                    Tentatives agent
                  </label>
                  <input
                    type="number"
                    defaultValue={3}
                    className="w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-[13px] text-gray-800 focus:border-blue-400 focus:outline-none"
                  />
                  <p className="mt-1 text-[11px] text-gray-400">
                    Nombre de tentatives de contact par agent avant de
                    reassigner
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                  <label className="mb-1 block text-[12px] font-medium text-gray-600">
                    Transfert equipe
                  </label>
                  <input
                    type="number"
                    defaultValue={18}
                    className="w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-[13px] text-gray-800 focus:border-blue-400 focus:outline-none"
                  />
                  <p className="mt-1 text-[11px] text-gray-400">
                    Temps de passage au groupe suivant apres plusieurs
                    tentatives
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-[13px] font-semibold text-gray-800">
              Agents exclus de la reassignation
            </p>
            <p className="mb-3 text-[12px] text-gray-500">
              Les agents coches ne recevront pas de leads reassignes
              automatiquement entre agents
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
              {agents.map((name) => (
                <label
                  key={name}
                  className="flex items-center gap-2 text-[12.5px] text-gray-700"
                >
                  <input
                    type="checkbox"
                    checked={excluded.includes(name)}
                    onChange={() => toggleExcluded(name)}
                    className="h-3.5 w-3.5 rounded border-gray-300"
                  />
                  <span className="truncate">{name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <Toggle
              checked={dedupDetection}
              onChange={() => setDedupDetection((v) => !v)}
              label="Detection de doublons"
              description="Marquer les leads en doublon automatiquement"
            />
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold text-gray-800">
              <User className="h-3.5 w-3.5 text-gray-400" />
              Agent de secours
            </p>
            <p className="mb-3 text-[12px] text-gray-500">
              Utilise cet agent systematiquement si aucune regle ne
              correspond ou si aucun agent n&apos;est configure
            </p>
            <SelectDropdown
              variant="field"
              pinnedLabel="Aucun agent de secours"
              options={agents}
            />
          </div>
        </div>
      )}
    </div>
  );
}
