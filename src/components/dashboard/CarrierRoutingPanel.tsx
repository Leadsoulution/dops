"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Check, Loader2, Star, Truck } from "lucide-react";
import { CARRIERS, type CarrierId } from "@/lib/carriers/registry";
import { actualShares, normalizeShares } from "@/lib/carriers/routing";

/**
 * La repartition des envois entre transporteurs.
 *
 * Deux reglages, et ils ne font pas la meme chose :
 *
 * - le **defaut** designe qui prend une commande quand la repartition
 *   ne tranche pas — la toute premiere, ou une egalite parfaite ;
 * - les **parts** repartissent le flux. Soixante-dix / trente envoie
 *   sept colis sur dix chez le premier.
 *
 * La part reellement obtenue s'affiche a cote de la part voulue :
 * une consigne qu'on ne peut pas verifier ne vaut rien, et c'est le
 * seul moyen de voir qu'un transporteur a pris du retard parce que ses
 * envois echouaient.
 */

type Routing = { default: CarrierId; shares: Record<CarrierId, number> };

const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

export default function CarrierRoutingPanel() {
  const [routing, setRouting] = useState<Routing | null>(null);
  const [counts, setCounts] = useState<Record<CarrierId, number>>({
    forcelog: 0,
    speedaf: 0,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/carriers")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.error) setError(d.error);
        else {
          setRouting(d.routing as Routing);
          setCounts(d.counts as Record<CarrierId, number>);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Repartition indisponible.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(t);
  }, [saved]);

  async function enregistrer(suivant: Routing) {
    setRouting(suivant);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/carriers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(suivant),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Enregistrement refuse.");
      setRouting(body.routing as Routing);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue.");
    } finally {
      setSaving(false);
    }
  }

  const voulues = routing ? normalizeShares(routing.shares) : {};
  const obtenues = actualShares(counts);
  const totalSaisi = routing
    ? CARRIERS.reduce((s, c) => s + (routing.shares[c.id] ?? 0), 0)
    : 0;

  return (
    <div className="mb-5 rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-[13.5px] font-semibold text-gray-900">
            <Truck className="h-4 w-4 text-gray-500" />
            Repartition des envois
          </p>
          <p className="text-[12px] text-gray-500">
            Qui prend la commande a la confirmation. Le transporteur par
            defaut ouvre ; les parts repartissent le flux ensuite.
          </p>
        </div>
        {saving && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
        {saved && !saving && (
          <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
            <Check className="h-3 w-3" />
            Enregistre
          </span>
        )}
      </div>

      {error && (
        <p className="mb-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}

      {!routing ? (
        <p className="flex items-center justify-center gap-2 py-6 text-[12.5px] text-gray-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Lecture de la repartition...
        </p>
      ) : (
        <>
          <div className="space-y-2">
            {CARRIERS.map((c) => {
              const part = routing.shares[c.id] ?? 0;
              const estDefaut = routing.default === c.id;
              return (
                <div
                  key={c.id}
                  className={`flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5 ${
                    estDefaut ? "border-gray-900 bg-gray-50" : "border-gray-200"
                  }`}
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[11.5px] font-semibold ${c.logo.bg} ${c.logo.fg}`}
                  >
                    {c.logo.letter}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-gray-900">
                      {c.name}
                      {!c.holdsStock && (
                        <span className="ml-1.5 text-[11px] font-normal text-gray-400">
                          sans stock chez le transporteur
                        </span>
                      )}
                    </p>
                    <p className="text-[11.5px] text-gray-500">
                      {counts[c.id] ?? 0} colis envoyes
                      {obtenues[c.id] !== undefined && (
                        <span className="ml-1 text-gray-400">
                          &middot; {nf.format(obtenues[c.id])}% reels
                        </span>
                      )}
                    </p>
                  </div>

                  {/* Le defaut : un seul a la fois, d'ou le bouton plutot
                      qu'une case a cocher. */}
                  <button
                    type="button"
                    onClick={() =>
                      void enregistrer({ ...routing, default: c.id })
                    }
                    disabled={estDefaut}
                    className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-medium ${
                      estDefaut
                        ? "bg-gray-900 text-white"
                        : "border border-gray-300 text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    <Star className={`h-3 w-3 ${estDefaut ? "fill-white" : ""}`} />
                    {estDefaut ? "Par defaut" : "Definir par defaut"}
                  </button>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={part}
                      onChange={(e) =>
                        setRouting({
                          ...routing,
                          shares: {
                            ...routing.shares,
                            [c.id]: Math.max(
                              0,
                              Math.min(100, Number(e.target.value) || 0)
                            ),
                          },
                        })
                      }
                      onBlur={() => void enregistrer(routing)}
                      className="w-16 rounded-md border border-gray-200 px-2 py-1 text-center font-mono text-[12.5px] text-gray-800 focus:border-blue-400 focus:outline-none"
                    />
                    <span className="text-[12.5px] text-gray-500">%</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* La barre dit ce que les chiffres saisis veulent vraiment
              dire : 50 et 30 ne font pas 50/30 mais 62/38. */}
          <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-gray-100">
            {CARRIERS.map((c) =>
              voulues[c.id] ? (
                <span
                  key={c.id}
                  title={`${c.name} ${nf.format(voulues[c.id])}%`}
                  style={{ width: `${voulues[c.id]}%` }}
                  className={c.id === "forcelog" ? "bg-orange-400" : "bg-sky-400"}
                />
              ) : null
            )}
          </div>
          <p className="mt-1.5 text-[11.5px] text-gray-400">
            {CARRIERS.filter((c) => voulues[c.id])
              .map((c) => `${c.name} ${nf.format(voulues[c.id])}%`)
              .join(" · ") || "Aucune part definie"}
            {totalSaisi !== 100 && totalSaisi > 0 && (
              <span className="ml-1 text-gray-400">
                (saisi : {totalSaisi}%, ramene a 100)
              </span>
            )}
          </p>
        </>
      )}
    </div>
  );
}
