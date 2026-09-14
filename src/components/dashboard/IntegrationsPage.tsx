"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Inbox,
  LayoutGrid,
  Link2,
  Megaphone,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Store,
  Truck,
} from "lucide-react";
import ConnectIntegrationModal from "./ConnectIntegrationModal";
import { integrations, alertPlatforms, type Integration } from "./integrations-data";

type TabKey = "toutes" | "leads" | "ads" | "shipping";

const tabs: { key: TabKey; label: string; icon: typeof LayoutGrid; category?: Integration["category"] }[] = [
  { key: "toutes", label: "Toutes", icon: LayoutGrid },
  { key: "leads", label: "Sources de leads", icon: Inbox, category: "leads" },
  { key: "ads", label: "Regies publicitaires", icon: Megaphone, category: "ads" },
  { key: "shipping", label: "Societes de livraison", icon: Truck, category: "shipping" },
];

const healthDot: Record<Integration["health"], string> = {
  Sain: "bg-emerald-500",
  "A verifier": "bg-orange-500",
  "Aucun run": "bg-gray-300",
};

const healthText: Record<Integration["health"], string> = {
  Sain: "text-emerald-600",
  "A verifier": "text-orange-600",
  "Aucun run": "text-gray-400",
};

const quickAddShops = ["WooCommerce", "YouCan"];

function PlatformCard({
  integration,
  onConnect,
  liveConnected,
}: {
  integration: Integration;
  onConnect: (integration: Integration) => void;
  liveConnected?: boolean | null;
}) {
  const isAds = integration.category === "ads";
  const isActive =
    liveConnected === undefined || liveConnected === null
      ? integration.status === "Active"
      : liveConnected;
  const [syncState, setSyncState] = useState<"idle" | "syncing" | "done">("idle");

  useEffect(() => {
    if (syncState !== "done") return;
    const timer = setTimeout(() => setSyncState("idle"), 2000);
    return () => clearTimeout(timer);
  }, [syncState]);

  function runSync() {
    setSyncState("syncing");
    setTimeout(() => setSyncState("done"), 800);
  }
  const rightLabel = integration.activeCount
    ? `${integration.activeCount} actives`
    : integration.connectedAt
    ? `Connecte le ${integration.connectedAt}`
    : "Pas encore connecte";
  const health: Integration["health"] =
    liveConnected === true ? "Sain" : liveConnected === false ? "A verifier" : integration.health;

  return (
    <div className="flex flex-col rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[11.5px] font-semibold ${integration.logo.bg} ${integration.logo.fg}`}
          >
            {integration.logo.letter}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13.5px] font-semibold text-gray-900">
              {integration.name}
            </p>
            <p className="truncate text-[11.5px] text-gray-500">
              {integration.subtitle}
            </p>
          </div>
        </div>
        <span
          className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
            isActive ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-500"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-emerald-500" : "bg-gray-400"}`} />
          {isActive ? "Active" : "Configuration en attente"}
        </span>
      </div>

      {integration.needsReconnect && (
        <span className="mb-3 inline-block w-fit rounded-md bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-600">
          Reconnexion requise
        </span>
      )}

      <div className="mb-3 grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            Dernier import
          </p>
          <p className="font-mono text-[13px] font-medium text-gray-800">
            {integration.lastImport.toLocaleString("fr-FR")}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            Derniere sync
          </p>
          <p className="truncate font-mono text-[12px] text-gray-600">
            {integration.lastSync ?? "—"}
          </p>
        </div>
      </div>

      <div className="mb-3 flex min-w-0 items-center gap-1.5 text-[12px]">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${healthDot[health]}`} />
        <span className={`shrink-0 font-medium ${healthText[health]}`}>
          {health}
        </span>
        <span className="truncate text-gray-400">&middot; {rightLabel}</span>
      </div>

      <div className="mt-auto flex items-center gap-2">
        {isAds ? (
          <>
            <button
              onClick={runSync}
              disabled={syncState === "syncing"}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-medium text-white ${
                syncState === "done"
                  ? "bg-emerald-600"
                  : "bg-gray-900 hover:bg-gray-800"
              } disabled:opacity-70`}
            >
              {syncState === "done" ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <RefreshCw
                  className={`h-3.5 w-3.5 ${syncState === "syncing" ? "animate-spin" : ""}`}
                />
              )}
              {syncState === "syncing"
                ? "Synchronisation..."
                : syncState === "done"
                ? "Synchronise"
                : "Synchroniser les campagnes"}
            </button>
            <button
              onClick={() => onConnect(integration)}
              title="Modifier la connexion"
              className="shrink-0 rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-50"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => onConnect(integration)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-[12.5px] font-medium text-white hover:bg-gray-800"
            >
              {integration.activeCount ? (
                <Store className="h-3.5 w-3.5" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {integration.activeCount ? "Gerer les boutiques" : "Modifier la connexion"}
            </button>
            <button
              onClick={() => onConnect(integration)}
              className="shrink-0 rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-50"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>

      {integration.needsReconnect && (
        <button
          onClick={() => onConnect(integration)}
          className="mt-2 w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[12px] font-medium text-amber-700 hover:bg-amber-100"
        >
          Reconnexion requise
        </button>
      )}
    </div>
  );
}

export default function IntegrationsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("leads");
  const [connectTarget, setConnectTarget] = useState<Integration | null>(null);
  const [forcelogConnected, setForcelogConnected] = useState<boolean | null>(null);
  const [wooConnected, setWooConnected] = useState<boolean | null>(null);

  // Les deux integrations reellement branchees disent leur etat plutot
  // que de l'afficher en dur : une cle revoquee doit se voir ici.
  const refreshHealth = useCallback(() => {
    fetch("/api/forcelog/health")
      .then((res) => res.json())
      .then((data) => setForcelogConnected(Boolean(data.connected)))
      .catch(() => setForcelogConnected(false));
    fetch("/api/woocommerce/health")
      .then((res) => res.json())
      .then((data) => setWooConnected(Boolean(data.connected)))
      .catch(() => setWooConnected(false));
  }, []);

  useEffect(() => {
    refreshHealth();
  }, [refreshHealth]);

  const isConnected = (integration: Integration) => {
    if (integration.id === "forcelog") return Boolean(forcelogConnected);
    if (integration.id === "woocommerce") return Boolean(wooConnected);
    return integration.status === "Active";
  };

  const totalCount = integrations.length;
  const connectedCount = integrations.filter(isConnected).length;
  const activeImports = connectedCount;
  const totalRecords = integrations.reduce((sum, i) => sum + i.lastImport, 0);
  const errorCount = 0;

  const activeTabDef = tabs.find((t) => t.key === activeTab)!;
  const visible = activeTabDef.category
    ? integrations.filter((i) => i.category === activeTabDef.category)
    : integrations;

  function findByName(name: string) {
    return integrations.find((i) => i.name === name) ?? null;
  }

  return (
    <div className="scrollbar-hide flex-1 overflow-y-auto bg-gray-50 px-4 py-4 lg:px-6 lg:py-5">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100">
            <Link2 className="h-4 w-4 text-gray-600" />
          </div>
          <div>
            <h1 className="text-h1 font-semibold text-gray-900">
              Integrations
            </h1>
            <p className="max-w-xl text-[13px] text-gray-500">
              Gerez les connexions et l&apos;historique d&apos;import utilises
              par Google Sheets, les boutiques WooCommerce et les prochains
              imports de commandes.
            </p>
          </div>
        </div>

        <button
          onClick={() => setConnectTarget(integrations[0])}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-gray-900 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-gray-800 sm:w-auto"
        >
          <Link2 className="h-3.5 w-3.5" />
          Nouvelle integration
        </button>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-3.5">
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-400">
              Plateformes connectees
            </p>
            <p className="font-mono text-[19px] font-semibold text-gray-900">
              {connectedCount}/{totalCount}
            </p>
            <p className="text-[11px] text-gray-400">
              Connexions partagees enregistrees
            </p>
          </div>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100">
            <Link2 className="h-4 w-4 text-gray-500" />
          </span>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-3.5">
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-400">
              Imports actifs
            </p>
            <p className="font-mono text-[19px] font-semibold text-gray-900">
              {activeImports}
            </p>
            <p className="text-[11px] text-gray-400">
              Connexions actuellement actives
            </p>
          </div>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </span>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-3.5">
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-400">
              Enregistrements importes
            </p>
            <p className="font-mono text-[19px] font-semibold text-gray-900">
              {totalRecords.toLocaleString("fr-FR")}
            </p>
            <p className="text-[11px] text-gray-400">
              Issus des derniers runs enregistres
            </p>
          </div>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50">
            <RefreshCw className="h-4 w-4 text-blue-500" />
          </span>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-3.5">
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-400">
              Plateformes en erreur
            </p>
            <p className="font-mono text-[19px] font-semibold text-gray-900">
              {errorCount}
            </p>
            <p className="text-[11px] text-gray-400">
              A verifier avant le prochain import
            </p>
          </div>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100">
            <AlertTriangle className="h-4 w-4 text-gray-400" />
          </span>
        </div>
      </div>

      {alertPlatforms.length > 0 && (
        <div className="mb-5 flex items-center gap-2.5 rounded-lg border border-amber-100 bg-amber-50 px-3.5 py-2.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          <div>
            <p className="text-[12.5px] font-medium text-amber-700">
              {alertPlatforms.length} plateforme(s) demandent une action
            </p>
            <p className="text-[11.5px] text-amber-600">
              {alertPlatforms.join(", ")}
            </p>
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[13.5px] font-semibold text-gray-900">
            Connexions des plateformes
          </p>
          <p className="text-[12px] text-gray-500">
            Chaque plateforme affiche ses connexions enregistrees et ses
            derniers runs d&apos;import.
          </p>
        </div>
        {(activeTab === "toutes" || activeTab === "leads") && (
          <div className="flex flex-wrap items-center gap-2">
            {quickAddShops.map((name) => (
              <button
                key={name}
                onClick={() => setConnectTarget(findByName(name))}
                className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-gray-300 bg-white px-3 py-2 text-[12.5px] font-medium text-gray-700 hover:bg-gray-50"
              >
                <Plus className="h-3.5 w-3.5" />
                Ajouter une boutique {name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mb-5 flex items-center gap-6 overflow-x-auto border-b border-gray-200">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const count = tab.category
            ? integrations.filter((i) => i.category === tab.category).length
            : totalCount;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 pb-2.5 text-[13.5px] transition-colors ${
                active
                  ? "border-gray-900 font-semibold text-gray-900"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
              <span
                className={`rounded-full px-1.5 py-0.5 font-mono text-[10.5px] ${
                  active ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {visible.map((integration) => (
          <PlatformCard
            key={integration.id}
            integration={integration}
            onConnect={setConnectTarget}
            liveConnected={
              integration.id === "forcelog" ? forcelogConnected : undefined
            }
          />
        ))}
      </div>

      {connectTarget && (
        <ConnectIntegrationModal
          integration={connectTarget}
          onClose={() => {
            setConnectTarget(null);
            refreshHealth();
          }}
        />
      )}
    </div>
  );
}
