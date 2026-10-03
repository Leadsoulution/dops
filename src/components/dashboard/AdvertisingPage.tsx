"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Check,
  Eye,
  Loader2,
  ChevronDown,
  Columns3,
  ChevronRight,
  Megaphone,
  MousePointerClick,
  Plug,
  RefreshCw,
  Target,
  Unplug,
  Wallet,
} from "lucide-react";
import PeriodFilter from "./PeriodFilter";
import { periodBounds, type Range } from "./useTeamStats";
import type { AdsOverview, CampaignRow } from "@/lib/supabase/ads";
import {
  DEFAULT_COLUMNS,
  PRESETS,
  availableMetrics,
  formatMetric,
  metricValue,
  type Metric,
} from "@/lib/ads/metrics";
import type { AdAccountView } from "@/lib/supabase/ad-accounts";

/**
 * Les regies publicitaires, vues depuis l'application.
 *
 * Deux sections, une par plateforme, parce qu'un CPC Meta et un CPC
 * TikTok ne se moyennent pas : les encheres, les formats et les
 * audiences n'ont rien de commun, et un chiffre unique ne
 * correspondrait a aucune des deux regies.
 *
 * Tout est en lecture. Aucun bouton d'ici ne met une campagne en pause
 * ni ne change un budget — les jetons demandes ne portent que le droit
 * de lire, et les clients n'appellent que des GET.
 */

const PLATEFORMES = [
  { key: "meta" as const, label: "Meta" },
  { key: "tiktok" as const, label: "TikTok" },
];

type Platform = "meta" | "tiktok";

const nf = new Intl.NumberFormat("fr-FR");
const nf2 = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Un statut de campagne, dit comme la plateforme le dit. */
function statusStyle(status?: string): string {
  const s = (status ?? "").toUpperCase();
  if (s.includes("ACTIVE") || s.includes("ENABLE") || s.includes("DELIVER")) {
    return "bg-emerald-50 text-emerald-700";
  }
  if (s.includes("PAUSE") || s.includes("DISABLE")) {
    return "bg-amber-50 text-amber-700";
  }
  if (s.includes("DELETE") || s.includes("ARCHIVE")) {
    return "bg-gray-100 text-gray-500";
  }
  return "bg-gray-100 text-gray-600";
}

export default function AdvertisingPage() {
  const [platform, setPlatform] = useState<Platform>("meta");
  const [range, setRange] = useState<Range>({ label: "Maximum", custom: null });

  const [overview, setOverview] = useState<AdsOverview | null>(null);
  const [accounts, setAccounts] = useState<AdAccountView[] | null>(null);
  const [canConnect, setCanConnect] = useState(true);

  const [error, setError] = useState<string | null>(null);
  /**
   * La periode et la plateforme deja chargees. Comparer cette cle a
   * celle demandee dit s'il faut attendre, sans avoir a poser un
   * drapeau depuis l'effet — React 19 refuse d'y toucher a l'etat.
   */
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const bounds = periodBounds(range);
  const { from, to } = bounds;
  const key = `${platform}|${from ?? ""}|${to ?? ""}`;
  const loading = loadedKey !== key;

  const loadOverview = useCallback(async () => {
    const params = new URLSearchParams({ platform });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const res = await fetch(`/api/ads/overview?${params}`);
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? "Chiffres indisponibles.");
    return body as AdsOverview;
  }, [platform, from, to]);

  const loadAccounts = useCallback(async () => {
    const res = await fetch("/api/ads/accounts");
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? "Comptes indisponibles.");
    return body as { accounts: AdAccountView[]; canConnect: boolean };
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadOverview(), loadAccounts()])
      .then(([o, a]) => {
        if (cancelled) return;
        setOverview(o);
        setAccounts(a.accounts);
        setCanConnect(a.canConnect);
        setError(null);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        // La cle est posee meme en cas d'echec : sans cela l'ecran
        // resterait sur "lecture en cours" derriere le message d'erreur.
        if (!cancelled) setLoadedKey(key);
      });
    return () => {
      cancelled = true;
    };
  }, [loadOverview, loadAccounts, key]);

  async function refresh() {
    try {
      const [o, a] = await Promise.all([loadOverview(), loadAccounts()]);
      setOverview(o);
      setAccounts(a.accounts);
      setCanConnect(a.canConnect);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue.");
    }
  }

  /** Va rechercher les chiffres chez Meta et TikTok, puis relit. */
  async function sync() {
    setSyncing(true);
    setNote(null);
    setError(null);
    try {
      const res = await fetch("/api/ads/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Synchronisation refusee.");

      const echecs = (body.results ?? []).filter(
        (r: { error?: string }) => r.error
      );
      if (echecs.length > 0) {
        setError(
          echecs
            .map((r: { platform: string; error: string }) => `${r.platform} : ${r.error}`)
            .join(" - ")
        );
      } else if (body.synced === 0) {
        setNote("Aucun compte branche : connectez-en un ci-dessous.");
      } else {
        const lignes = (body.results ?? []).reduce(
          (s: number, r: { rows: number }) => s + r.rows,
          0
        );
        setNote(`${nf.format(lignes)} journees relevees.`);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue.");
    } finally {
      setSyncing(false);
    }
  }

  const comptes = (accounts ?? []).filter((a) => a.platform === platform);
  const o = overview;

  return (
    <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-h2 font-semibold text-gray-900">
            <Megaphone className="h-5 w-5 text-gray-400" />
            Advertising
          </h1>
          <p className="text-[12.5px] text-gray-500">
            Vos campagnes Meta et TikTok, en lecture seule.
          </p>
        </div>
        <button
          onClick={() => void sync()}
          disabled={syncing}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-[12.5px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          {syncing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {syncing ? "Relevee..." : "Actualiser"}
        </button>
      </div>

      {/* Les deux regies, cote a cote comme les onglets de commandes. */}
      <div className="mb-4 flex items-center gap-5 overflow-x-auto border-b border-gray-200 lg:gap-6 lg:overflow-visible">
        {PLATEFORMES.map((p) => (
          <button
            key={p.key}
            onClick={() => setPlatform(p.key)}
            className={`whitespace-nowrap border-b-2 pb-2.5 text-[13.5px] font-medium transition-colors ${
              platform === p.key
                ? "border-gray-900 text-gray-900"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {p.label}
            <span className="ml-1.5 text-[12px] text-gray-400">
              ({(accounts ?? []).filter((a) => a.platform === p.key).length})
            </span>
          </button>
        ))}
      </div>

      <div className="mb-4">
        <PeriodFilter range={range} onChange={setRange} />
      </div>

      {error && (
        <p className="mb-4 flex items-start gap-2 rounded-lg border-2 border-red-300 bg-red-50 px-3 py-2.5 text-[12.5px] font-medium text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      {note && (
        <p className="mb-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[12.5px] text-emerald-800">
          <Check className="mt-0.5 h-4 w-4 shrink-0" />
          {note}
        </p>
      )}

      {loading && !o ? (
        <p className="flex items-center gap-2 py-10 text-[13px] text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Lecture des campagnes...
        </p>
      ) : (
        o && (
          <>
            <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Kpi
                tone="blue"
                icon={<Wallet className="h-4 w-4" />}
                title="DEPENSE"
                value={`${nf2.format(o.spendMad)} DH`}
                note="Convertie en dirhams au taux enregistre."
              />
              <Kpi
                tone="gray"
                icon={<Eye className="h-4 w-4" />}
                title="IMPRESSIONS"
                value={nf.format(o.impressions)}
                note={`CPM ${nf2.format(o.cpm)} DH`}
              />
              <Kpi
                tone="violet"
                icon={<MousePointerClick className="h-4 w-4" />}
                title="CLICS"
                value={nf.format(o.clicks)}
                note={`CTR ${nf2.format(o.ctr)} % - CPC ${nf2.format(o.cpc)} DH`}
              />
              <Kpi
                tone="emerald"
                icon={<Target className="h-4 w-4" />}
                title="CONVERSIONS"
                value={nf.format(o.conversions)}
                note={
                  o.conversions > 0
                    ? `${nf2.format(o.spendMad / o.conversions)} DH par conversion`
                    : "Telles que la plateforme les compte."
                }
              />
            </div>

            <CampaignTable campaigns={o.campaigns} currency={o.currency} />
          </>
        )
      )}

      <Connections
        platform={platform}
        accounts={comptes}
        canConnect={canConnect}
        onChange={() => void refresh()}
      />
    </main>
  );
}

const TONES = {
  gray: { border: "border-gray-300", text: "text-gray-500" },
  emerald: { border: "border-emerald-400", text: "text-emerald-700" },
  blue: { border: "border-blue-400", text: "text-blue-700" },
  violet: { border: "border-violet-400", text: "text-violet-700" },
} as const;

function Kpi({
  tone,
  icon,
  title,
  value,
  note,
}: {
  tone: keyof typeof TONES;
  icon: React.ReactNode;
  title: string;
  value: string;
  note: React.ReactNode;
}) {
  const style = TONES[tone];
  return (
    <section className={`rounded-xl border-2 bg-white p-5 ${style.border}`}>
      <p
        className={`mb-1 flex items-center gap-2 text-[12px] font-semibold tracking-wide ${style.text}`}
      >
        {icon}
        {title}
      </p>
      <p className="font-mono text-[28px] font-semibold text-gray-900">{value}</p>
      <p className="text-[12px] text-gray-500">{note}</p>
    </section>
  );
}

/**
 * Les campagnes, leurs ensembles et leurs publicites.
 *
 * Emboites comme dans le gestionnaire de la plateforme, parce que
 * c'est ainsi qu'on repare une campagne : le total ne dit pas ou part
 * l'argent, l'ensemble le dit, et la publicite fautive est encore un
 * cran plus bas.
 *
 * Les etages sont replies par defaut. Quarante publicites deroulees
 * sous dix-huit campagnes feraient une liste que personne ne lit.
 */
function CampaignTable({
  campaigns,
  currency,
}: {
  campaigns: CampaignRow[];
  currency?: string;
}) {
  const [ouverts, setOuverts] = useState<Set<string>>(new Set());
  const [choisies, setChoisies] = useState<string[]>(DEFAULT_COLUMNS);
  const [picker, setPicker] = useState(false);

  /*
   * Les colonnes possibles dependent du compte : une action que ces
   * campagnes n'ont jamais produite n'a pas a encombrer la liste.
   */
  const disponibles = availableMetrics(
    campaigns.map((c) => c.metrics),
    currency
  );
  const colonnes = choisies
    .map((k) => disponibles.find((m) => m.key === k))
    .filter((m): m is Metric => Boolean(m));

  const basculer = (id: string) =>
    setOuverts((prev) => {
      const suite = new Set(prev);
      if (suite.has(id)) suite.delete(id);
      else suite.add(id);
      return suite;
    });

  // Les enfants par identifiant de plateforme du parent.
  const enfants = new Map<string, CampaignRow[]>();
  for (const c of campaigns) {
    if (!c.parentExternalId) continue;
    const liste = enfants.get(c.parentExternalId);
    if (liste) liste.push(c);
    else enfants.set(c.parentExternalId, [c]);
  }
  for (const liste of enfants.values()) liste.sort((a, b) => b.spendMad - a.spendMad);

  const racines = campaigns.filter((c) => c.level === "campaign");

  /** Une ligne, puis ses descendants si elle est ouverte. */
  function lignes(row: CampaignRow, profondeur: number): React.ReactNode[] {
    const sous = enfants.get(row.externalId) ?? [];
    const ouvert = ouverts.has(row.id);
    const sortie: React.ReactNode[] = [
      <tr key={row.id} className="border-b border-gray-50 last:border-0">
        <td className="px-4 py-3">
          <div
            className="flex min-w-0 items-center gap-1.5"
            style={{ paddingLeft: profondeur * 18 }}
          >
            {sous.length > 0 ? (
              <button
                onClick={() => basculer(row.id)}
                className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                title={ouvert ? "Replier" : "Deplier"}
              >
                {ouvert ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </button>
            ) : (
              <span className="w-[22px] shrink-0" />
            )}
            <span
              className={`max-w-[260px] truncate text-[12.5px] ${
                profondeur === 0
                  ? "font-semibold text-gray-900"
                  : profondeur === 1
                    ? "font-medium text-gray-700"
                    : "text-gray-600"
              }`}
              title={row.name}
            >
              {row.name}
            </span>
            {sous.length > 0 && (
              <span className="shrink-0 rounded-full bg-gray-100 px-1.5 text-[10.5px] text-gray-500">
                {sous.length}
              </span>
            )}
          </div>
        </td>
        <td className="px-4 py-3">
          <span
            className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${statusStyle(row.status)}`}
          >
            {row.status ?? "-"}
          </span>
        </td>
        {colonnes.map((m) => (
          <td
            key={m.key}
            className="whitespace-nowrap px-4 py-3 text-right font-mono text-[12.5px] text-gray-700"
          >
            {formatMetric(m, metricValue(m, row.metrics))}
          </td>
        ))}
      </tr>,
    ];
    if (ouvert) {
      for (const fils of sous) sortie.push(...lignes(fils, profondeur + 1));
    }
    return sortie;
  }

  const total = racines.length;

  return (
    <div className="mb-6 rounded-xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
        <p className="text-[13px] font-semibold text-gray-800">
          Campagnes
          <span className="ml-1.5 font-normal text-gray-400">
            {total} sur la periode
          </span>
        </p>
        <div className="flex items-center gap-3">
          {campaigns.length > total && (
            <button
              onClick={() =>
                setOuverts((prev) =>
                  prev.size > 0 ? new Set() : new Set(campaigns.map((c) => c.id))
                )
              }
              className="text-[12px] font-medium text-blue-600 hover:text-blue-700"
            >
              {ouverts.size > 0 ? "Tout replier" : "Tout deplier"}
            </button>
          )}
          <button
            onClick={() => setPicker((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-[12px] font-medium text-gray-700 hover:bg-gray-50"
          >
            <Columns3 className="h-3.5 w-3.5" />
            Colonnes
            <span className="rounded-full bg-gray-100 px-1.5 text-[10.5px] text-gray-500">
              {colonnes.length}
            </span>
          </button>
        </div>
      </div>

      {picker && (
        <div className="border-b border-gray-100 bg-gray-50/60 px-4 py-3">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold tracking-wide text-gray-400">
              PREREGLAGES
            </span>
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() =>
                  setChoisies(
                    p.columns.filter((k) =>
                      disponibles.some((m) => m.key === k)
                    )
                  )
                }
                className="rounded-full border border-gray-300 bg-white px-2.5 py-1 text-[11.5px] text-gray-600 hover:bg-gray-100"
              >
                {p.label}
              </button>
            ))}
          </div>

          {/*
            Toutes les colonnes que ce compte sait remplir. Celles
            qu'il n'a jamais produites ne figurent pas : proposer une
            colonne vide ferait croire a une mesure a zero.
          */}
          <div className="flex flex-wrap gap-1.5">
            {disponibles.map((m) => {
              const prise = choisies.includes(m.key);
              return (
                <button
                  key={m.key}
                  title={m.hint}
                  onClick={() =>
                    setChoisies((prev) =>
                      prise
                        ? prev.filter((k) => k !== m.key)
                        : [...prev, m.key]
                    )
                  }
                  className={`rounded-md border px-2 py-1 text-[11.5px] transition-colors ${
                    prise
                      ? "border-blue-500 bg-blue-50 font-medium text-blue-800"
                      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {total === 0 ? (
        <p className="px-4 py-10 text-center text-[12.5px] text-gray-400">
          Aucune depense relevee sur cette periode.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px]">
            <thead>
              <tr className="border-b border-gray-100 text-left text-[11px] font-semibold tracking-wide text-gray-400">
                <th className="px-4 py-2.5">CAMPAGNE / ENSEMBLE / PUBLICITE</th>
                <th className="px-4 py-2.5">STATUT</th>
                {colonnes.map((m) => (
                  <th
                    key={m.key}
                    title={m.hint}
                    className="whitespace-nowrap px-4 py-2.5 text-right"
                  >
                    {m.label.toUpperCase()}
                    {m.hint && <span className="ml-0.5 text-gray-300">*</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {racines
                .slice()
                .sort((a, b) => b.spendMad - a.spendMad)
                .flatMap((r) => lignes(r, 0))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Le branchement d'un compte, depuis l'application.
 *
 * Le jeton part au serveur et n'en revient pas : la liste n'affiche que
 * ses quatre derniers caracteres, de quoi reconnaitre celui qui est en
 * place sans permettre de s'en servir.
 */
function Connections({
  platform,
  accounts,
  canConnect,
  onChange,
}: {
  platform: Platform;
  accounts: AdAccountView[];
  canConnect: boolean;
  onChange: () => void;
}) {
  const [externalId, setExternalId] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = platform === "meta" ? "Meta" : "TikTok";
  const idLabel =
    platform === "meta"
      ? "Identifiant du compte publicitaire (act_123...)"
      : "Identifiant annonceur (advertiser_id)";

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ads/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, externalId, token }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Connexion refusee.");
      setExternalId("");
      setToken("");
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/ads/accounts?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Deconnexion refusee.");
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-4 py-3">
        <p className="flex items-center gap-2 text-[13px] font-semibold text-gray-800">
          <Plug className="h-4 w-4 text-gray-400" />
          Comptes {label}
        </p>
        <p className="text-[12px] text-gray-500">
          Acces en lecture seule. L&apos;application ne peut ni modifier, ni
          creer, ni mettre en pause une campagne.
        </p>
      </div>

      {error && (
        <p className="mx-4 mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}

      <div className="divide-y divide-gray-50">
        {accounts.map((a) => (
          <div
            key={a.id}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-gray-800">
                {a.name}
                <span className="ml-2 font-mono text-[11.5px] text-gray-400">
                  {a.externalId}
                </span>
              </p>
              <p className="text-[12px] text-gray-500">
                {a.currency}
                {a.tokenHint && ` - jeton ${a.tokenHint}`}
                {a.lastSyncAt &&
                  ` - relevee ${new Date(a.lastSyncAt).toLocaleString("fr-FR")}`}
              </p>
              {a.lastSyncError && (
                <p className="text-[12px] text-red-600">{a.lastSyncError}</p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span
                className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${
                  a.status === "Actif"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {a.status}
              </span>
              {a.status === "Actif" && (
                <button
                  onClick={() => void disconnect(a.id)}
                  disabled={busy}
                  className="flex items-center gap-1.5 rounded-md border border-gray-300 px-2.5 py-1.5 text-[12px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                  <Unplug className="h-3.5 w-3.5" />
                  Deconnecter
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {!canConnect ? (
        <p className="border-t border-gray-100 px-4 py-3 text-[12.5px] text-amber-700">
          La cle ADS_TOKEN_KEY n&apos;est pas posee sur le serveur : un jeton ne
          pourrait pas etre chiffre, donc pas enregistre.
        </p>
      ) : (
        <div className="flex flex-col gap-2 border-t border-gray-100 px-4 py-3 sm:flex-row">
          <input
            value={externalId}
            onChange={(e) => setExternalId(e.target.value)}
            placeholder={idLabel}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-[12.5px] text-gray-700 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none sm:flex-1"
          />
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            type="password"
            placeholder={`Jeton de lecture ${label}`}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-[12.5px] text-gray-700 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none sm:flex-1"
          />
          <button
            onClick={() => void connect()}
            disabled={busy || !externalId.trim() || !token.trim()}
            className="flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-gray-900 px-3.5 py-2 text-[12.5px] font-medium text-white hover:bg-gray-800 disabled:opacity-40"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plug className="h-3.5 w-3.5" />
            )}
            Connecter
          </button>
        </div>
      )}
    </section>
  );
}
