"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Check,
  Eye,
  Clock,
  Loader2,
  Megaphone,
  MousePointerClick,
  Plug,
  RefreshCw,
  Target,
  Unplug,
  Wallet,
} from "lucide-react";
import PeriodFilter from "./PeriodFilter";
import AdsTable from "./AdsTable";
import {
  RESULTS_KEY,
  SPEND_SOURCE_KEY,
  resultLabel,
  sumMetrics,
  withResultTotal,
} from "@/lib/ads/metrics";
import { periodBounds, type Range } from "./useTeamStats";
import type { AdsOverview } from "@/lib/supabase/ads";
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

/** Division qui rend 0 plutot que l'infini quand le diviseur manque. */
const parUnite = (total: number, n: number) => (n > 0 ? total / n : 0);
const parMille = (total: number, n: number) => (n > 0 ? (total / n) * 1000 : 0);
const nf2 = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

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

  /** Quand la derniere relevee a eu lieu, en toutes lettres. */
  const dernier = (accounts ?? [])
    .map((a) => a.lastSyncAt)
    .filter((d): d is string => Boolean(d))
    .sort()
    .at(-1);
  const releve = dernier
    ? new Date(dernier).toLocaleString("fr-FR", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  /*
   * Les resultats et la depense d'origine, additionnes sur les
   * campagnes seules.
   *
   * Les trois etages decrivent le meme argent et les memes resultats
   * vus de trois hauteurs : sommer les trois les compterait en triple.
   */
  const racines = (overview?.campaigns ?? []).filter(
    (c) => c.level === "campaign"
  );
  const totaux = withResultTotal(sumMetrics(racines.map((c) => c.metrics)));
  const resultats = totaux[RESULTS_KEY] ?? 0;
  const depenseSource = totaux[SPEND_SOURCE_KEY] ?? 0;
  const devise = overview?.currency ?? "MAD";
  const indicateur = resultLabel(totaux) || "Selon l'objectif de chaque campagne";

  /** La premiere et la derniere journee dont on detient les chiffres. */
  const jours = (overview?.daily ?? []).map((d) => d.day).sort();
  const enDate = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
    });
  const couverture =
    jours.length > 0
      ? { du: enDate(jours[0]), au: enDate(jours.at(-1)!) }
      : null;

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
          {/*
            L'heure du dernier relevee, parce que les chiffres sont une
            photographie. Les journees closes correspondent au centime a
            ce qu'annonce la plateforme ; celle d'aujourd'hui continue
            de monter chez elle sans monter ici.
          */}
          {releve && (
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11.5px] text-gray-400">
              <Clock className="h-3 w-3" />
              <span>Releve {releve}.</span>
              {/*
                La periode reellement couverte, dite en clair.
                Comparer ces chiffres a ceux du gestionnaire de
                publicites n'a de sens que sur la meme periode, et
                "Maximum" ici veut dire "tout ce qui a ete releve",
                pas "toute la vie du compte".
              */}
              {couverture && (
                <span className="text-gray-500">
                  Donnees du {couverture.du} au {couverture.au}.
                </span>
              )}
              <span>
                Aujourd&apos;hui et hier bougent encore chez la plateforme :
                actualisez pour les mettre a jour.
              </span>
            </p>
          )}
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
                value={`${nf2.format(depenseSource)} ${devise}`}
                equivalent={`${nf2.format(o.spendMad)} DH`}
                note="Telle que la plateforme la facture."
              />
              <Kpi
                tone="gray"
                icon={<Eye className="h-4 w-4" />}
                title="IMPRESSIONS"
                value={nf.format(o.impressions)}
                note={
                  <>
                    CPM {nf2.format(parMille(depenseSource, o.impressions))}{" "}
                    {devise}
                    <span className="text-gray-400">
                      {" "}
                      = {nf2.format(o.cpm)} DH
                    </span>
                  </>
                }
              />
              <Kpi
                tone="violet"
                icon={<MousePointerClick className="h-4 w-4" />}
                title="COUT PAR RESULTAT"
                value={
                  resultats > 0
                    ? `${nf2.format(depenseSource / resultats)} ${devise}`
                    : "—"
                }
                equivalent={
                  resultats > 0
                    ? `${nf2.format(o.spendMad / resultats)} DH`
                    : undefined
                }
                note={
                  <>
                    CTR {nf2.format(o.ctr)} % - CPC{" "}
                    {nf2.format(parUnite(depenseSource, o.clicks))} {devise}
                  </>
                }
              />
              <Kpi
                tone="emerald"
                icon={<Target className="h-4 w-4" />}
                title="RESULTATS"
                value={nf.format(resultats)}
                note={
                  resultats > 0
                    ? indicateur
                    : "Ce que les campagnes optimisent : achat, interaction, visite."
                }
              />
            </div>

            <AdsTable campaigns={o.campaigns} currency={o.currency} />
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
  equivalent,
  note,
}: {
  tone: keyof typeof TONES;
  icon: React.ReactNode;
  title: string;
  value: string;
  /**
   * Le meme montant en dirhams, sous celui de la devise du compte.
   *
   * Le grand chiffre se compare au gestionnaire de publicites, le
   * petit se compare au reste de l'application. Les deux servent, et
   * n'afficher que l'un obligeait a convertir de tete.
   */
  equivalent?: string;
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
      {equivalent && (
        <p className="-mt-0.5 font-mono text-[12px] text-gray-400">
          = {equivalent}
        </p>
      )}
      <p className="text-[12px] text-gray-500">{note}</p>
    </section>
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
