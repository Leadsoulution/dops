"use client";

import { useState } from "react";
import {
  Settings2,
  RefreshCw,
  Save,
  User,
  Info,
} from "lucide-react";
import ConfirmationHome from "./ConfirmationHome";
import { useTeamStats } from "./useTeamStats";
import Toggle from "./Toggle";
import SelectDropdown from "./SelectDropdown";
import RuleList from "./RuleList";
import {
  rebalanceModes,
  sourceKeyOptions,
  productCatalog,
  regionOptions,
  initialProductRules,
  initialSourceRules,
  initialRegionRules,
  type AssignedRule,
} from "./confirmation-data";

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
  const [activeMode, setActiveMode] = useState(rebalanceModes[0]);
  const [autoAssign, setAutoAssign] = useState(true);
  const [autoReassign, setAutoReassign] = useState(true);
  const [dedupDetection, setDedupDetection] = useState(true);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [productRules, setProductRules] = useState<AssignedRule[]>(initialProductRules);
  const [sourceRules, setSourceRules] = useState<AssignedRule[]>(initialSourceRules);
  const [regionRules, setRegionRules] = useState<AssignedRule[]>(initialRegionRules);
  const [weights, setWeights] = useState<Record<string, number>>({});

  // Les regles d'assignation nomment des agents : on lit l'equipe sur
  // tout l'historique, la liste des comptes ne dependant pas d'une
  // periode.
  const { stats } = useTeamStats({ label: "Maximum", custom: null });
  const agentList = stats?.agents ?? [];
  const agentNames = agentList.map((a) => a.name);

  const totalWeight = agentNames.reduce(
    (sum, name) => sum + (weights[name] ?? 10),
    0
  );
  const weightedRules = agentList.map((agent) => ({
    name: agent.name,
    avatarColor: agent.avatarColor,
    weight: weights[agent.name] ?? 10,
    percent:
      totalWeight > 0
        ? Math.round(((weights[agent.name] ?? 10) / totalWeight) * 100)
        : 0,
  }));
  const totalPercent = weightedRules.reduce((sum, r) => sum + r.percent, 0);

  function resetWeights() {
    setWeights(Object.fromEntries(agentNames.map((name) => [name, 10])));
  }

  function toggleExcluded(name: string) {
    setExcluded((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
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
        <ConfirmationHome />
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
              {agentNames.map((name) => (
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
              options={agentNames}
            />
          </div>
        </div>
      )}
    </div>
  );
}
