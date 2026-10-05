"use client";

import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Columns3,
  Loader2,
  Save,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import type { CampaignRow } from "@/lib/supabase/ads";
import {
  DEFAULT_COLUMNS,
  PRESETS,
  SPEND_SOURCE_KEY,
  RESULTS_KEY,
  availableMetrics,
  formatMetric,
  metricValue,
  resultLabel,
  sumMetrics,
  withResultTotal,
  type Metric,
} from "@/lib/ads/metrics";

/**
 * Le tableau du gestionnaire de publicites, dans l'application.
 *
 * Trois onglets comme chez eux — campagnes, ensembles, publicites —
 * parce qu'on ne cherche pas la meme chose a chaque etage : le budget
 * se decide en haut, le ciblage au milieu, la creation en bas.
 *
 * L'onglet des campagnes garde en plus l'emboitement : deplier une
 * campagne montre ou part son argent sans changer d'ecran. C'est la
 * seule chose que nous faisons et qu'ils ne font pas.
 *
 * Rien ici ne modifie quoi que ce soit chez la plateforme. Les boutons
 * Creer, Dupliquer et les interrupteurs de leur barre d'outils n'ont
 * pas d'equivalent, et c'est voulu : le jeton demande ne porte que le
 * droit de lire.
 */

const NIVEAUX = [
  { key: "campaign" as const, label: "Campagnes" },
  { key: "adset" as const, label: "Ensembles" },
  { key: "ad" as const, label: "Publicites" },
];

const STATUTS = ["Tous", "Actifs", "En pause", "Archives"];

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

function matchStatut(filtre: string, status?: string): boolean {
  if (filtre === "Tous") return true;
  const s = (status ?? "").toUpperCase();
  if (filtre === "Actifs") return s.includes("ACTIVE") || s.includes("ENABLE");
  if (filtre === "En pause") return s.includes("PAUSE") || s.includes("DISABLE");
  return s.includes("ARCHIVE") || s.includes("DELETE");
}

export default function AdsTable({
  campaigns,
  currency,
}: {
  campaigns: CampaignRow[];
  currency?: string;
}) {
  const [niveau, setNiveau] = useState<"campaign" | "adset" | "ad">("campaign");
  const [ouverts, setOuverts] = useState<Set<string>>(new Set());
  const [choisies, setChoisies] = useState<string[]>(DEFAULT_COLUMNS);
  const [picker, setPicker] = useState(false);
  const [recherche, setRecherche] = useState("");
  const [statut, setStatut] = useState("Tous");
  const [tri, setTri] = useState<{ cle: string; desc: boolean }>({
    cle: SPEND_SOURCE_KEY,
    desc: true,
  });

  /*
   * Les vues enregistrees, partagees par les administrateurs.
   *
   * Elles vivent sur le serveur : une vue posee par defaut doit
   * s'ouvrir pareil sur le poste de chacun, sinon ce n'est pas une
   * vue par defaut mais une preference locale.
   */
  const [vues, setVues] = useState<{ name: string; columns: string[] }[]>([]);
  const [defaut, setDefaut] = useState<string | null>(null);
  const [nomVue, setNomVue] = useState("");
  const [enregistre, setEnregistre] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/ads/views")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (cancelled || !body) return;
        setVues(body.views ?? []);
        setDefaut(body.defaut ?? null);
        // La vue par defaut s'applique a l'ouverture, une seule fois.
        const choisie = (body.views ?? []).find(
          (v: { name: string }) => v.name === body.defaut
        );
        if (choisie) setChoisies(choisie.columns);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function majVues(corps: Record<string, unknown>) {
    setEnregistre(true);
    try {
      const res = await fetch("/api/ads/views", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corps),
      });
      const body = await res.json();
      if (res.ok) {
        setVues(body.views ?? []);
        setDefaut(body.defaut ?? null);
      }
    } finally {
      setEnregistre(false);
    }
  }

  /*
   * Le total des resultats est pose dans chaque sac avant tout
   * calcul : le cout par resultat en a besoin comme denominateur.
   */
  const lignesPretes = campaigns.map((c) => ({
    ...c,
    metrics: withResultTotal(c.metrics),
  }));
  const parId = new Map(lignesPretes.map((c) => [c.id, c]));
  const disponibles = availableMetrics(
    lignesPretes.map((c) => c.metrics),
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
  for (const c of lignesPretes) {
    if (!c.parentExternalId) continue;
    const liste = enfants.get(c.parentExternalId);
    if (liste) liste.push(c);
    else enfants.set(c.parentExternalId, [c]);
  }

  const garde = (c: CampaignRow) =>
    matchStatut(statut, c.status) &&
    (!recherche.trim() ||
      c.name.toLowerCase().includes(recherche.trim().toLowerCase()));

  const comparer = (a: CampaignRow, b: CampaignRow) => {
    const col = disponibles.find((m) => m.key === tri.cle);
    const va = col ? metricValue(col, a.metrics) : 0;
    const vb = col ? metricValue(col, b.metrics) : 0;
    if (tri.cle === "name") {
      return tri.desc
        ? b.name.localeCompare(a.name)
        : a.name.localeCompare(b.name);
    }
    return tri.desc ? vb - va : va - vb;
  };

  const visibles = lignesPretes.filter((c) => c.level === niveau && garde(c));
  const triees = visibles.slice().sort(comparer);

  /** Les totaux, sommes des lignes affichees puis taux recalcules. */
  const totaux = withResultTotal(sumMetrics(triees.map((c) => c.metrics)));

  const trierPar = (cle: string) =>
    setTri((prev) =>
      prev.cle === cle ? { cle, desc: !prev.desc } : { cle, desc: true }
    );

  /** Une ligne, puis ses descendants si elle est ouverte. */
  function lignes(row: CampaignRow, profondeur: number): React.ReactNode[] {
    // L'emboitement n'a de sens que depuis l'onglet des campagnes :
    // ailleurs la liste est deja a plat, comme chez la plateforme.
    const sous =
      niveau === "campaign"
        ? (enfants.get(row.externalId) ?? [])
            .map((c) => parId.get(c.id) ?? c)
            .sort(comparer)
        : [];
    const ouvert = ouverts.has(row.id);
    const sortie: React.ReactNode[] = [
      <tr key={row.id} className="border-b border-gray-50 hover:bg-gray-50/60">
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
              className={`max-w-[280px] truncate text-[12.5px] ${
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
            className={`whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium ${statusStyle(row.status)}`}
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
            {m.key === RESULTS_KEY && resultLabel(row.metrics) && (
              <span className="block font-sans text-[10.5px] text-gray-400">
                {resultLabel(row.metrics)}
              </span>
            )}
          </td>
        ))}
      </tr>,
    ];
    if (ouvert) {
      for (const fils of sous) sortie.push(...lignes(fils, profondeur + 1));
    }
    return sortie;
  }

  const compte = (k: string) =>
    lignesPretes.filter((c) => c.level === k && garde(c)).length;

  return (
    <div className="mb-6 rounded-xl border border-gray-200 bg-white">
      {/* Les trois etages, comme les onglets du gestionnaire. */}
      <div className="flex items-center gap-5 overflow-x-auto border-b border-gray-200 px-4 lg:gap-6">
        {NIVEAUX.map((n) => (
          <button
            key={n.key}
            onClick={() => setNiveau(n.key)}
            className={`whitespace-nowrap border-b-2 py-3 text-[13px] font-medium transition-colors ${
              niveau === n.key
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {n.label}
            <span className="ml-1.5 text-[12px] text-gray-400">
              ({compte(n.key)})
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-4 py-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher par nom..."
            className="w-full rounded-lg border border-gray-200 py-1.5 pl-8 pr-3 text-[12.5px] text-gray-700 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none"
          />
        </div>

        {STATUTS.map((s) => (
          <button
            key={s}
            onClick={() => setStatut(s)}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-medium ${
              statut === s
                ? "bg-gray-900 text-white"
                : "border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            {s}
          </button>
        ))}

        {niveau === "campaign" && (
          <button
            onClick={() =>
              setOuverts((prev) =>
                prev.size > 0 ? new Set() : new Set(lignesPretes.map((c) => c.id))
              )
            }
            className="whitespace-nowrap text-[12px] font-medium text-blue-600 hover:text-blue-700"
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
                    p.columns.filter((k) => disponibles.some((m) => m.key === k))
                  )
                }
                className="rounded-full border border-gray-300 bg-white px-2.5 py-1 text-[11.5px] text-gray-600 hover:bg-gray-100"
              >
                {p.label}
              </button>
            ))}
          </div>

          {vues.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold tracking-wide text-gray-400">
                MES VUES
              </span>
              {vues.map((v) => (
                <span
                  key={v.name}
                  className={`flex items-center gap-1 rounded-full border px-2 py-1 text-[11.5px] ${
                    defaut === v.name
                      ? "border-blue-500 bg-blue-50 text-blue-800"
                      : "border-gray-300 bg-white text-gray-600"
                  }`}
                >
                  <button
                    onClick={() => setChoisies(v.columns)}
                    className="font-medium hover:underline"
                  >
                    {v.name}
                  </button>
                  <button
                    title={
                      defaut === v.name
                        ? "Vue par defaut pour tous les administrateurs"
                        : "Definir par defaut pour tous les administrateurs"
                    }
                    onClick={() =>
                      void majVues({
                        defaut: defaut === v.name ? null : v.name,
                      })
                    }
                    className="text-gray-400 hover:text-amber-500"
                  >
                    <Star
                      className={`h-3 w-3 ${defaut === v.name ? "fill-amber-400 text-amber-500" : ""}`}
                    />
                  </button>
                  <button
                    title="Supprimer cette vue"
                    onClick={() => void majVues({ remove: v.name })}
                    className="text-gray-400 hover:text-red-600"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <input
              value={nomVue}
              onChange={(e) => setNomVue(e.target.value)}
              placeholder="Nom de la vue a enregistrer..."
              className="min-w-[180px] rounded-lg border border-gray-200 px-2.5 py-1 text-[11.5px] text-gray-700 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none"
            />
            <button
              disabled={!nomVue.trim() || colonnes.length === 0 || enregistre}
              onClick={() => {
                void majVues({
                  save: { name: nomVue.trim(), columns: choisies },
                });
                setNomVue("");
              }}
              className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-[11.5px] font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-40"
            >
              {enregistre ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Save className="h-3 w-3" />
              )}
              Enregistrer ces {colonnes.length} colonnes
            </button>
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
                      prise ? prev.filter((k) => k !== m.key) : [...prev, m.key]
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

      {triees.length === 0 ? (
        <p className="px-4 py-10 text-center text-[12.5px] text-gray-400">
          {campaigns.length === 0
            ? "Aucune depense relevee sur cette periode."
            : "Rien ne correspond a cette recherche."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px]">
            <thead>
              <tr className="border-b border-gray-100 text-left text-[11px] font-semibold tracking-wide text-gray-400">
                <Entete
                  label={NIVEAUX.find((n) => n.key === niveau)!.label.toUpperCase()}
                  cle="name"
                  tri={tri}
                  onClick={trierPar}
                  gauche
                />
                <th className="px-4 py-2.5">STATUT</th>
                {colonnes.map((m) => (
                  <Entete
                    key={m.key}
                    label={m.label.toUpperCase()}
                    cle={m.key}
                    hint={m.hint}
                    tri={tri}
                    onClick={trierPar}
                  />
                ))}
              </tr>
            </thead>
            <tbody>{triees.flatMap((r) => lignes(r, 0))}</tbody>
            <tfoot>
              {/*
                Les totaux des lignes affichees. Les taux y sont
                recalcules depuis les sommes, jamais additionnes : la
                somme de douze CTR ne veut rien dire.
              */}
              <tr className="border-t-2 border-gray-200 bg-gray-50 text-[12.5px] font-semibold text-gray-900">
                <td className="px-4 py-3">
                  Total
                  <span className="ml-1.5 font-normal text-gray-400">
                    {triees.length} ligne{triees.length > 1 ? "s" : ""}
                  </span>
                </td>
                <td className="px-4 py-3" />
                {colonnes.map((m) => (
                  <td
                    key={m.key}
                    className="whitespace-nowrap px-4 py-3 text-right font-mono"
                  >
                    {formatMetric(m, metricValue(m, totaux))}
                    {m.key === RESULTS_KEY && resultLabel(totaux) && (
                      <span className="block font-sans text-[10.5px] font-normal text-gray-400">
                        {resultLabel(totaux)}
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function Entete({
  label,
  cle,
  hint,
  tri,
  onClick,
  gauche = false,
}: {
  label: string;
  cle: string;
  hint?: string;
  tri: { cle: string; desc: boolean };
  onClick: (cle: string) => void;
  gauche?: boolean;
}) {
  const actif = tri.cle === cle;
  return (
    <th className={`whitespace-nowrap px-4 py-2.5 ${gauche ? "" : "text-right"}`}>
      <button
        onClick={() => onClick(cle)}
        title={hint}
        className={`inline-flex items-center gap-1 hover:text-gray-700 ${
          actif ? "text-gray-800" : ""
        }`}
      >
        {label}
        {hint && <span className="text-gray-300">*</span>}
        {actif &&
          (tri.desc ? (
            <ArrowDown className="h-3 w-3" />
          ) : (
            <ArrowUp className="h-3 w-3" />
          ))}
      </button>
    </th>
  );
}
