"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Info, Loader2, PackagePlus, X } from "lucide-react";

/**
 * Saisie d'un arrivage.
 *
 * Une date, puis les produits recus ce jour-la : on coche ce qui est
 * arrive, on dit combien et a quel prix. Le total de chaque ligne et
 * celui de l'arrivage s'affichent a mesure, et ne se saisissent pas —
 * un total ecrit a la main qui ne correspond pas a ses lignes est un
 * total faux qu'on decouvre six mois plus tard.
 *
 * L'arrivage ne touche pas au stock affiche dans Produits. Il
 * renseigne le cout de la marchandise et le solde du fournisseur ;
 * l'inventaire se tient ailleurs, et c'est ce qui a ete demande.
 */

type Produit = { id: string; name: string; ref?: string; costSupplier?: number };

type Ligne = { quantity: string; unitCost: string };

const nf2 = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default function ArrivalModal({
  supplierId,
  supplierName,
  onClose,
  onSaved,
}: {
  supplierId: string;
  supplierName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [produits, setProduits] = useState<Produit[]>([]);
  const [lignes, setLignes] = useState<Record<string, Ligne>>({});
  const [arrivedAt, setArrivedAt] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/products")
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        const liste = (body.products ?? body ?? []) as Produit[];
        if (Array.isArray(liste)) setProduits(liste);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const coche = (id: string) => lignes[id] !== undefined;

  function basculer(p: Produit) {
    setLignes((prev) => {
      const suite = { ...prev };
      if (suite[p.id]) delete suite[p.id];
      else {
        // Le dernier cout connu est propose : neuf fois sur dix c'est
        // le bon, et il reste modifiable.
        suite[p.id] = {
          quantity: "",
          unitCost: p.costSupplier ? String(p.costSupplier) : "",
        };
      }
      return suite;
    });
  }

  const majLigne = (id: string, champ: keyof Ligne, valeur: string) =>
    setLignes((prev) => ({ ...prev, [id]: { ...prev[id], [champ]: valeur } }));

  const totalLigne = (l?: Ligne) =>
    (Number(l?.quantity) || 0) * (Number(l?.unitCost) || 0);

  const total = Object.values(lignes).reduce((s, l) => s + totalLigne(l), 0);
  const unites = Object.values(lignes).reduce(
    (s, l) => s + (Number(l.quantity) || 0),
    0
  );
  const pretes = Object.entries(lignes).filter(
    ([, l]) => Number(l.quantity) > 0
  );

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "arrival",
          supplierId,
          arrivedAt,
          reference,
          note,
          lines: pretes.map(([productId, l]) => ({
            productId,
            quantity: Number(l.quantity),
            unitCost: Number(l.unitCost) || 0,
          })),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Enregistrement refuse.");
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 sm:px-4 sm:py-10">
      <div className="flex h-full w-full flex-col bg-white shadow-2xl sm:h-auto sm:max-w-2xl sm:rounded-xl">
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-start gap-2.5">
            <PackagePlus className="mt-0.5 h-4 w-4 text-gray-700" />
            <div>
              <h2 className="text-h2 font-semibold text-gray-900">
                Nouvel arrivage
              </h2>
              <p className="text-[12.5px] text-gray-500">{supplierName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:max-h-[64vh] sm:flex-none">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-[12.5px] text-gray-600">
                Date d&apos;arrivee *
              </label>
              <input
                type="date"
                value={arrivedAt}
                onChange={(e) => setArrivedAt(e.target.value)}
                className={champ}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-[12.5px] text-gray-600">
                Reference / facture
              </label>
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="FA-2026-014"
                className={champ}
              />
            </div>
          </div>

          <div className="flex items-start gap-2.5 rounded-lg bg-blue-50 p-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
            <p className="text-[12px] text-blue-800">
              Cochez les produits recus et indiquez la quantite arrivee. Le
              stock affiche dans Produits n&apos;est pas modifie : cet arrivage
              sert au cout de la marchandise et au solde du fournisseur.
            </p>
          </div>

          <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-[11px] font-semibold tracking-wide text-gray-400">
                  <th className="px-3 py-2">PRODUIT</th>
                  <th className="w-24 px-3 py-2 text-right">QUANTITE</th>
                  <th className="w-28 px-3 py-2 text-right">PRIX UNITE</th>
                  <th className="w-28 px-3 py-2 text-right">TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {produits.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-[12.5px] text-gray-400">
                      Lecture des produits...
                    </td>
                  </tr>
                )}
                {produits.map((p) => {
                  const pris = coche(p.id);
                  return (
                    <tr
                      key={p.id}
                      className={`border-b border-gray-50 last:border-0 ${pris ? "bg-blue-50/40" : ""}`}
                    >
                      <td className="px-3 py-2">
                        <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-gray-700">
                          <input
                            type="checkbox"
                            checked={pris}
                            onChange={() => basculer(p)}
                            className="h-3.5 w-3.5 shrink-0 rounded border-gray-300"
                          />
                          <span className="truncate" title={p.name}>
                            {p.name}
                          </span>
                        </label>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          disabled={!pris}
                          value={lignes[p.id]?.quantity ?? ""}
                          onChange={(e) =>
                            majLigne(p.id, "quantity", e.target.value)
                          }
                          className={`${champ} text-right disabled:bg-gray-50 disabled:text-gray-300`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          disabled={!pris}
                          value={lignes[p.id]?.unitCost ?? ""}
                          onChange={(e) =>
                            majLigne(p.id, "unitCost", e.target.value)
                          }
                          className={`${champ} text-right disabled:bg-gray-50 disabled:text-gray-300`}
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-[12.5px] text-gray-800">
                        {pris ? nf2.format(totalLigne(lignes[p.id])) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50 text-[13px] font-semibold text-gray-900">
                  <td className="px-3 py-2.5">
                    Total
                    <span className="ml-1.5 font-normal text-gray-400">
                      {pretes.length} produit{pretes.length > 1 ? "s" : ""},{" "}
                      {unites} unite{unites > 1 ? "s" : ""}
                    </span>
                  </td>
                  <td />
                  <td />
                  <td className="px-3 py-2.5 text-right font-mono">
                    {nf2.format(total)} DH
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div>
            <label className="mb-1 block text-[12.5px] text-gray-600">Note</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className={`${champ} resize-none`}
            />
          </div>

          {error && (
            <p className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2.5 border-t border-gray-100 px-5 py-4 sm:flex-row sm:justify-end">
          <button
            onClick={onClose}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-50 sm:w-auto"
          >
            Annuler
          </button>
          <button
            onClick={() => void save()}
            disabled={saving || pretes.length === 0 || !arrivedAt}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-gray-800 disabled:opacity-40 sm:w-auto"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <PackagePlus className="h-3.5 w-3.5" />
            )}
            Enregistrer l&apos;arrivage
          </button>
        </div>
      </div>
    </div>
  );
}

const champ =
  "w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-[12.5px] text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none";
