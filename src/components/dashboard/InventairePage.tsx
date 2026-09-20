"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  AlertCircle,
  Boxes,
  Check,
  Loader2,
  Package,
  RefreshCw,
  Truck,
  Warehouse,
} from "lucide-react";
import type { ProductStock, InventoryTotals } from "@/lib/supabase/inventory";

/**
 * Inventaire.
 *
 * Trois chiffres en tete, parce que la marchandise est a trois endroits
 * a la fois et qu'aucun ne suffit seul : ce qui a ete achete, ce qui
 * reste, et la part que le transporteur detient. Le detail par produit
 * suit, avec les deux seules quantites que personne ne peut deviner a
 * notre place — l'achat de depart et notre propre depot.
 */

const nf = new Intl.NumberFormat("fr-FR");

type Data = {
  products: ProductStock[];
  totals: InventoryTotals;
  unmatched: number;
};

async function fetchInventory(): Promise<Data> {
  const res = await fetch("/api/inventory");
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "Inventaire indisponible.");
  return body as Data;
}

export default function InventairePage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  async function load() {
    try {
      setData(await fetchInventory());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Inventaire indisponible.");
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetchInventory()
      .then((body) => {
        if (cancelled) return;
        setData(body);
        setError(null);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Enregistre une quantite saisie, puis relit tout.
   *
   * La relecture n'est pas du zele : changer l'achat de depart deplace
   * le total, et changer le depot deplace le restant. Recalculer a
   * l'ecran ce que le serveur sait calculer finirait par en differer.
   */
  async function saveField(
    product: ProductStock,
    field: "stockInitial" | "stockDepot",
    value: number
  ) {
    setSavingId(product.id);
    setError(null);
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Enregistrement refuse.");
      await load();
      setSavedId(product.id);
      setTimeout(() => setSavedId(null), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue.");
    } finally {
      setSavingId(null);
    }
  }

  const t = data?.totals;

  return (
    <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-h2 font-semibold text-gray-900">
            <Boxes className="h-5 w-5 text-gray-400" />
            Inventaire
          </h1>
          <p className="text-[12.5px] text-gray-500">
            Ou se trouve la marchandise achetee : chez nous, chez le
            transporteur, ou en route.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-[12.5px] font-medium text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Actualiser
        </button>
      </div>

      {error && (
        <p className="mb-4 flex items-start gap-2 rounded-lg border-2 border-red-300 bg-red-50 px-3 py-2.5 text-[12.5px] font-medium text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      {!data && !error && (
        <p className="flex items-center gap-2 py-10 text-[13px] text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Calcul de l&apos;inventaire...
        </p>
      )}

      {t && (
        <>
          <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Ce qui a ete achete : le point de depart, saisi plus bas. */}
            <section className="rounded-xl border-2 border-gray-300 bg-white p-5">
              <p className="mb-1 flex items-center gap-2 text-[12px] font-semibold tracking-wide text-gray-500">
                <Package className="h-4 w-4" />
                STOCK TOTAL
              </p>
              <p className="font-mono text-[30px] font-semibold text-gray-900">
                {nf.format(t.initial)}
              </p>
              <p className="text-[12px] text-gray-500">
                Quantite achetee au depart.
              </p>
              <div className="mt-4 border-t border-gray-200 pt-3 text-[12.5px]">
                <div className="flex justify-between">
                  <span className="text-gray-500">Livre au client</span>
                  <span className="font-mono text-gray-800">
                    {nf.format(t.delivered)}
                  </span>
                </div>
                {t.initial > 0 && (
                  <div className="mt-1 flex justify-between">
                    <span className="text-gray-500">Ecart avec le restant</span>
                    <span
                      className={`font-mono ${
                        t.initial - t.delivered === t.remaining
                          ? "text-emerald-600"
                          : "text-amber-600"
                      }`}
                    >
                      {nf.format(t.initial - t.delivered - t.remaining)}
                    </span>
                  </div>
                )}
              </div>
            </section>

            {/* Ce qui reste, tous lieux confondus. */}
            <section className="rounded-xl border-2 border-emerald-400 bg-white p-5">
              <p className="mb-1 flex items-center gap-2 text-[12px] font-semibold tracking-wide text-emerald-700">
                <Warehouse className="h-4 w-4" />
                STOCK TOTAL RESTANT
              </p>
              <p className="font-mono text-[30px] font-semibold text-gray-900">
                {nf.format(t.remaining)}
              </p>
              <p className="text-[12px] text-gray-500">
                Notre depot, le transporteur et ce qui roule.
              </p>
              <div className="mt-4 space-y-1 border-t border-emerald-200 pt-3 text-[12.5px]">
                <div className="flex justify-between">
                  <span className="text-gray-500">Notre depot</span>
                  <span className="font-mono text-gray-800">
                    {nf.format(t.depot)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Chez le transporteur</span>
                  <span className="font-mono text-gray-800">
                    {nf.format(t.carrier)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">En cours de livraison</span>
                  <span className="font-mono text-gray-800">
                    {nf.format(t.inTransit)}
                  </span>
                </div>
              </div>
            </section>

            {/* La part detenue par le transporteur. */}
            <section className="rounded-xl border-2 border-blue-400 bg-white p-5">
              <p className="mb-1 flex items-center gap-2 text-[12px] font-semibold tracking-wide text-blue-700">
                <Truck className="h-4 w-4" />
                STOCK CHEZ LE TRANSPORTEUR
              </p>
              <p className="font-mono text-[30px] font-semibold text-gray-900">
                {nf.format(t.carrier)}
              </p>
              <p className="text-[12px] text-gray-500">
                Depot ForceLog, releve a la synchronisation.
              </p>
              <div className="mt-4 space-y-1 border-t border-blue-200 pt-3 text-[12.5px]">
                <div className="flex justify-between">
                  <span className="text-gray-500">Retours a remettre</span>
                  <span className="font-mono text-gray-800">
                    {nf.format(t.returned)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Part du restant</span>
                  <span className="font-mono text-gray-800">
                    {t.remaining > 0
                      ? Math.round((t.carrier / t.remaining) * 100)
                      : 0}
                    %
                  </span>
                </div>
              </div>
            </section>
          </div>

          {data.unmatched > 0 && (
            <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-[12.5px] text-amber-800">
              {data.unmatched} commande{data.unmatched > 1 ? "s" : ""} expediee
              {data.unmatched > 1 ? "s" : ""} ne correspond
              {data.unmatched > 1 ? "ent" : ""} a aucun produit du catalogue :
              ses unites ne sont comptees nulle part. Reliez le produit dans la
              fiche pour les faire entrer dans l&apos;inventaire.
            </p>
          )}

          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[860px] text-[12.5px]">
              <thead className="border-b border-gray-200 text-left text-gray-500">
                <tr>
                  <th className="px-3 py-3 font-medium">Produit</th>
                  <th className="px-3 py-3 font-medium">Achete</th>
                  <th className="px-3 py-3 font-medium">Notre depot</th>
                  <th className="px-3 py-3 font-medium">Transporteur</th>
                  <th className="px-3 py-3 font-medium">En route</th>
                  <th className="px-3 py-3 font-medium">Livre</th>
                  <th className="px-3 py-3 font-medium">Retours</th>
                  <th className="px-3 py-3 text-right font-medium">Restant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.products.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50/60">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-md border border-gray-200 bg-gray-50">
                          {p.image && (
                            <Image
                              src={p.image}
                              alt={p.name}
                              fill
                              sizes="36px"
                              className="object-cover"
                              unoptimized
                            />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-gray-800">
                            {p.name}
                          </p>
                          <p className="truncate font-mono text-[11px] text-gray-400">
                            {p.forcelogRef || p.ref}
                          </p>
                        </div>
                        {savingId === p.id && (
                          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-gray-400" />
                        )}
                        {savedId === p.id && (
                          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <QuantityInput
                        value={p.initial}
                        onCommit={(v) => void saveField(p, "stockInitial", v)}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <QuantityInput
                        value={p.depot}
                        onCommit={(v) => void saveField(p, "stockDepot", v)}
                      />
                    </td>
                    <td className="px-3 py-2.5 font-mono text-blue-700">
                      {nf.format(p.carrier)}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-gray-700">
                      {nf.format(p.inTransit)}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-gray-700">
                      {nf.format(p.delivered)}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-gray-500">
                      {nf.format(p.returned)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold text-emerald-700">
                      {nf.format(p.remaining)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-[11.5px] text-gray-400">
            Les colonnes <span className="text-gray-500">Achete</span> et{" "}
            <span className="text-gray-500">Notre depot</span> se saisissent :
            personne d&apos;autre ne les connait. Le transporteur vient de la
            synchronisation du stock, le reste est deduit des commandes.
          </p>
        </>
      )}
    </main>
  );
}

/**
 * Une quantite modifiable, enregistree quand on quitte la case.
 *
 * Enregistrer a chaque touche enverrait une requete par chiffre tape, et
 * "12" passerait par "1" — une valeur fausse, brievement ecrite en base.
 */
function QuantityInput({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [seen, setSeen] = useState(value);

  // La valeur du serveur a change : la case suit, sauf si elle est en
  // cours de modification.
  if (seen !== value) {
    setSeen(value);
    setDraft(String(value));
  }

  function commit() {
    const parsed = Number.parseInt(draft, 10);
    const next = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    setDraft(String(next));
    if (next !== value) onCommit(next);
  }

  return (
    <input
      type="number"
      min={0}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      className="w-20 rounded-md border border-gray-300 px-2 py-1 text-right font-mono text-[12.5px] text-gray-800 focus:border-blue-500 focus:outline-none"
    />
  );
}
