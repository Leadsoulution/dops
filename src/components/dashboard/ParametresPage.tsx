"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Ban,
  CheckCircle2,
  Clock,
  Copy,
  Eye,
  Globe,
  GripVertical,
  HardDrive,
  Key,
  Loader,
  PackageCheck,
  PhoneMissed,
  PhoneOff,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  Settings,
  ShieldAlert,
  Sparkles,
  Store,
  Truck,
  UserPlus,
  Workflow,
  XCircle,
  Zap,
} from "lucide-react";
import type { ComponentType } from "react";
import SelectDropdown from "./SelectDropdown";
import Toggle from "./Toggle";
import DatabaseSizeCard from "./DatabaseSizeCard";
import {
  leadStatuses,
  shippingStatuses,
  notificationPrefs,
  currencyOptions,
  timezoneOptions,
  languageOptions,
  type StatusDef,
  type StatusColor,
} from "./settings-data";

type TabKey = "general" | "workflow" | "notifications" | "integrations";

const tabs: { key: TabKey; label: string; icon: typeof Settings }[] = [
  { key: "general", label: "General", icon: Settings },
  { key: "workflow", label: "Workflow", icon: Workflow },
  { key: "notifications", label: "Notifications", icon: RefreshCw },
  { key: "integrations", label: "Integrations", icon: Zap },
];

const statusIcons: Record<string, ComponentType<{ className?: string }>> = {
  sparkles: Sparkles,
  "user-plus": UserPlus,
  loader: Loader,
  "check-circle": CheckCircle2,
  clock: Clock,
  "phone-off": PhoneOff,
  "phone-missed": PhoneMissed,
  "x-circle": XCircle,
  copy: Copy,
  "shield-alert": ShieldAlert,
  eye: Eye,
  send: Send,
  truck: Truck,
  "package-check": PackageCheck,
  "rotate-ccw": RotateCcw,
  ban: Ban,
};

const colorClasses: Record<StatusColor, { icon: string; pill: string }> = {
  blue: { icon: "bg-blue-50 text-blue-500", pill: "bg-blue-50 text-blue-600" },
  violet: { icon: "bg-violet-50 text-violet-500", pill: "bg-violet-50 text-violet-600" },
  amber: { icon: "bg-amber-50 text-amber-500", pill: "bg-amber-50 text-amber-600" },
  emerald: { icon: "bg-emerald-50 text-emerald-500", pill: "bg-emerald-50 text-emerald-600" },
  orange: { icon: "bg-orange-50 text-orange-500", pill: "bg-orange-50 text-orange-600" },
  gray: { icon: "bg-gray-100 text-gray-500", pill: "bg-gray-100 text-gray-500" },
  rose: { icon: "bg-rose-50 text-rose-500", pill: "bg-rose-50 text-rose-600" },
  red: { icon: "bg-red-50 text-red-500", pill: "bg-red-50 text-red-600" },
  purple: { icon: "bg-purple-50 text-purple-500", pill: "bg-purple-50 text-purple-600" },
  cyan: { icon: "bg-cyan-50 text-cyan-500", pill: "bg-cyan-50 text-cyan-600" },
};

function StatusRow({
  status,
  active,
  onToggle,
}: {
  status: StatusDef;
  active: boolean;
  onToggle: () => void;
}) {
  const Icon = statusIcons[status.icon] ?? Sparkles;
  const colors = colorClasses[status.color];

  return (
    <div className="flex items-center gap-3 border-b border-gray-50 px-4 py-3 last:border-0">
      <span className="flex shrink-0 cursor-grab items-center gap-1 text-[10px] font-medium tracking-wide text-gray-300">
        <GripVertical className="h-3.5 w-3.5" />
        GLISSER
      </span>
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${colors.icon}`}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-[13px] font-medium text-gray-900">{status.label}</p>
          {status.default && (
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
              PAR DEFAUT
            </span>
          )}
        </div>
        <p className="font-mono text-[11px] text-gray-400">{status.code}</p>
      </div>
      <span
        className={`hidden shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11.5px] font-medium sm:flex ${colors.pill}`}
      >
        <Icon className="h-3 w-3" />
        {status.label}
      </span>
      <button
        onClick={onToggle}
        className={`flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${
          active ? "bg-gray-900" : "bg-gray-200"
        }`}
      >
        <span
          className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${
            active ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

export default function ParametresPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("general");

  const [leadActive, setLeadActive] = useState<Record<string, boolean>>(
    Object.fromEntries(leadStatuses.map((s) => [s.code, s.active]))
  );
  const [shippingActive, setShippingActive] = useState<Record<string, boolean>>(
    Object.fromEntries(shippingStatuses.map((s) => [s.code, s.active]))
  );
  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>(
    Object.fromEntries(notificationPrefs.map((p) => [p.key, true]))
  );

  const [currency, setCurrency] = useState(currencyOptions[0]);
  const [timezone, setTimezone] = useState(timezoneOptions[0]);
  const [language, setLanguage] = useState(languageOptions[0]);
  const [mediaStorage, setMediaStorage] = useState<"local" | "s3">("local");
  const [saveState, setSaveState] = useState<"idle" | "saved">("idle");
  const [leadSyncState, setLeadSyncState] = useState<"idle" | "syncing" | "done">("idle");
  const [shippingSyncState, setShippingSyncState] = useState<"idle" | "syncing" | "done">(
    "idle"
  );

  function handleSave() {
    setSaveState("saved");
    setTimeout(() => setSaveState("idle"), 2000);
  }

  function runStatusSync(setter: (s: "idle" | "syncing" | "done") => void) {
    setter("syncing");
    setTimeout(() => setter("done"), 800);
    setTimeout(() => setter("idle"), 2600);
  }

  const leadActiveCount = Object.values(leadActive).filter(Boolean).length;
  const shippingActiveCount = Object.values(shippingActive).filter(Boolean).length;

  return (
    <div className="scrollbar-hide flex-1 overflow-y-auto bg-gray-50 px-4 py-4 lg:px-6 lg:py-5">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100">
            <Settings className="h-4 w-4 text-gray-600" />
          </div>
          <div>
            <h1 className="text-h1 font-semibold text-gray-900">
              Parametres
            </h1>
            <p className="text-[13px] text-gray-500">
              Configuration de votre espace Lead2Door
            </p>
          </div>
        </div>

        <button
          onClick={handleSave}
          className={`flex w-full items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-medium text-white sm:w-auto ${
            saveState === "saved" ? "bg-emerald-600" : "bg-gray-900 hover:bg-gray-800"
          }`}
        >
          <Save className="h-3.5 w-3.5" />
          {saveState === "saved" ? "Enregistre" : "Enregistrer"}
        </button>
      </div>

      <div className="mb-5 flex items-center gap-6 overflow-x-auto border-b border-gray-200">
        {tabs.map((tab) => {
          const Icon = tab.icon;
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
            </button>
          );
        })}
      </div>

      {activeTab === "general" && (
        <div className="max-w-3xl space-y-4">
          <DatabaseSizeCard />
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="mb-4 flex items-center gap-2 text-h3 font-semibold text-gray-900">
              <Store className="h-4 w-4 text-gray-400" />
              Informations de la boutique
            </p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[12.5px] text-gray-600">
                  Nom de la boutique
                </label>
                <input
                  type="text"
                  defaultValue="Lead2Door Demo Maroc"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-800 focus:border-blue-400 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[12.5px] text-gray-600">
                    Email principal
                  </label>
                  <input
                    type="email"
                    defaultValue="support@lead2door.ma"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-800 focus:border-blue-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[12.5px] text-gray-600">
                    Telephone
                  </label>
                  <input
                    type="text"
                    defaultValue="+212522981010"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-800 focus:border-blue-400 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="mb-4 flex items-center gap-2 text-h3 font-semibold text-gray-900">
              <Globe className="h-4 w-4 text-gray-400" />
              Preferences
            </p>
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[12.5px] text-gray-600">
                    Devise
                  </label>
                  <SelectDropdown
                    variant="field"
                    pinnedLabel={currency}
                    options={currencyOptions}
                    value={currency}
                    onSelect={setCurrency}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[12.5px] text-gray-600">
                    Fuseau horaire
                  </label>
                  <SelectDropdown
                    variant="field"
                    pinnedLabel={timezone}
                    options={timezoneOptions}
                    value={timezone}
                    onSelect={setTimezone}
                  />
                </div>
              </div>
              <div className="sm:w-1/2 sm:pr-1.5">
                <label className="mb-1 block text-[12.5px] text-gray-600">
                  Langue
                </label>
                <SelectDropdown
                  variant="field"
                  pinnedLabel={language}
                  options={languageOptions}
                  value={language}
                  onSelect={setLanguage}
                />
                <p className="mt-1.5 text-[11.5px] text-gray-400">
                  Enregistree sur votre compte et utilisee comme langue
                  d&apos;interface par defaut.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "workflow" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <p className="mb-1 flex items-center gap-2 text-h3 font-semibold text-gray-900">
              <Workflow className="h-4 w-4 text-gray-400" />
              Configuration d&apos;usage des statuts
            </p>
            <p className="max-w-2xl text-[12.5px] text-gray-500">
              Configurez l&apos;usage operationnel des statuts canoniques
              lead et expedition. Les definitions restent gerees dans
              Donnees maitres. Ici vous configurez uniquement
              l&apos;usage (activation et ordre).
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white">
            <div className="flex flex-col gap-2 border-b border-gray-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[13px] font-semibold text-gray-900">
                  Statuts des leads
                </p>
                <p className="text-[12px] text-gray-500">
                  <span className="font-mono">{leadActiveCount}</span> actifs sur{" "}
                  <span className="font-mono">{leadStatuses.length}</span> statuts
                </p>
              </div>
              <button
                onClick={() => runStatusSync(setLeadSyncState)}
                disabled={leadSyncState === "syncing"}
                className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium text-white disabled:opacity-70 ${
                  leadSyncState === "done" ? "bg-emerald-600" : "bg-gray-900 hover:bg-gray-800"
                }`}
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${leadSyncState === "syncing" ? "animate-spin" : ""}`}
                />
                {leadSyncState === "syncing"
                  ? "Synchronisation..."
                  : leadSyncState === "done"
                  ? "Synchronise"
                  : "Synchroniser les statuts leads"}
              </button>
            </div>
            <div>
              {leadStatuses.map((status) => (
                <StatusRow
                  key={status.code}
                  status={status}
                  active={leadActive[status.code]}
                  onToggle={() =>
                    setLeadActive((prev) => ({
                      ...prev,
                      [status.code]: !prev[status.code],
                    }))
                  }
                />
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white">
            <div className="flex flex-col gap-2 border-b border-gray-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[13px] font-semibold text-gray-900">
                  Statuts d&apos;expedition
                </p>
                <p className="text-[12px] text-gray-500">
                  <span className="font-mono">{shippingActiveCount}</span> actifs sur{" "}
                  <span className="font-mono">{shippingStatuses.length}</span> statuts
                </p>
              </div>
              <button
                onClick={() => runStatusSync(setShippingSyncState)}
                disabled={shippingSyncState === "syncing"}
                className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-medium disabled:opacity-70 ${
                  shippingSyncState === "done"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${shippingSyncState === "syncing" ? "animate-spin" : ""}`}
                />
                {shippingSyncState === "syncing"
                  ? "Synchronisation..."
                  : shippingSyncState === "done"
                  ? "Synchronise"
                  : "Synchroniser les statuts expedition"}
              </button>
            </div>
            <div>
              {shippingStatuses.map((status) => (
                <StatusRow
                  key={status.code}
                  status={status}
                  active={shippingActive[status.code]}
                  onToggle={() =>
                    setShippingActive((prev) => ({
                      ...prev,
                      [status.code]: !prev[status.code],
                    }))
                  }
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "notifications" && (
        <div className="max-w-3xl rounded-xl border border-gray-200 bg-white p-4">
          <p className="mb-1 text-[13px] font-semibold text-gray-800">
            Preferences de notifications
          </p>
          <div className="divide-y divide-gray-100">
            {notificationPrefs.map((pref) => (
              <Toggle
                key={pref.key}
                checked={notifPrefs[pref.key]}
                onChange={() =>
                  setNotifPrefs((prev) => ({
                    ...prev,
                    [pref.key]: !prev[pref.key],
                  }))
                }
                label={pref.label}
                description={pref.description}
              />
            ))}
          </div>
        </div>
      )}

      {activeTab === "integrations" && (
        <div className="max-w-3xl space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="mb-1 flex items-center gap-2 text-h3 font-semibold text-gray-900">
              <Key className="h-4 w-4 text-gray-400" />
              Cles API &amp; integrations
            </p>
            <p className="text-[12.5px] text-gray-500">
              Utilisez cet onglet pour les identifiants et reglages
              d&apos;integration par defaut de l&apos;espace. La connexion
              et la sante sont gerees dans{" "}
              <Link href="/integrations" className="font-medium text-blue-600 hover:underline">
                Integrations
              </Link>
              .
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="mb-1 flex items-center gap-2 text-h3 font-semibold text-gray-900">
              <Zap className="h-4 w-4 text-gray-400" />
              Suivi &amp; analytics
            </p>
            <p className="mb-3 text-[12.5px] text-gray-500">
              Identifiants de pixels et d&apos;analytics appliques a tout
              l&apos;espace.
            </p>
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[12.5px] text-gray-600">
                    Facebook Pixel ID
                  </label>
                  <input
                    type="text"
                    placeholder="123456789..."
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[12.5px] text-gray-600">
                    TikTok Pixel ID
                  </label>
                  <input
                    type="text"
                    placeholder="..."
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[12.5px] text-gray-600">
                  Google Analytics
                </label>
                <input
                  type="text"
                  placeholder="G-..."
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="mb-1 flex items-center gap-2 text-h3 font-semibold text-gray-900">
              <HardDrive className="h-4 w-4 text-gray-400" />
              Stockage des medias
            </p>
            <p className="mb-3 text-[12.5px] text-gray-500">
              Par defaut, les fichiers sont sauvegardes dans le dossier
              local uploads. Activez S3 uniquement quand le bucket est
              pret.
            </p>
            <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                onClick={() => setMediaStorage("local")}
                className={`rounded-lg border p-3 text-left ${
                  mediaStorage === "local"
                    ? "border-gray-900 bg-gray-50"
                    : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                <p className="mb-1 text-[13px] font-medium text-gray-900">
                  Dossier local uploads
                </p>
                <p className="text-[11.5px] text-gray-500">
                  Mode robuste par defaut pour le dev, les petits
                  deploiements et les environnements sans bucket.
                </p>
              </button>
              <button
                onClick={() => setMediaStorage("s3")}
                className={`rounded-lg border p-3 text-left ${
                  mediaStorage === "s3"
                    ? "border-gray-900 bg-gray-50"
                    : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                <p className="mb-1 text-[13px] font-medium text-gray-900">
                  Bucket S3
                </p>
                <p className="text-[11.5px] text-gray-500">
                  Envoie les nouveaux medias vers un bucket compatible S3
                  avec chemins semantiques.
                </p>
              </button>
            </div>
            <p className="rounded-lg bg-blue-50 px-3 py-2 text-[11.5px] text-blue-700">
              Structure standardisee : avatars/users/user-id/AAAA/MM,
              products/catalog/product-id/AAAA/MM,
              landing-pages/dossier/AAAA/MM.
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="mb-1 flex items-center gap-2 text-h3 font-semibold text-gray-900">
              <Send className="h-4 w-4 text-gray-400" />
              Webhooks
            </p>
            <p className="mb-3 text-[12.5px] text-gray-500">
              Points de terminaison qui recoivent les evenements de leads
              entrants.
            </p>
            <div>
              <label className="mb-1 block text-[12.5px] text-gray-600">
                Webhook URL (leads entrants)
              </label>
              <input
                type="text"
                placeholder="https://..."
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
