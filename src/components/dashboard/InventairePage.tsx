"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  AlertCircle,
  Boxes,
  Check,
  Loader2,
  RefreshCw,
  Send,
  Truck,
  Warehouse,
} from "lucide-react";
import type {
  ProductStock,
  InventoryTotals,
  ReturnedParcel,
} from "@/lib/supabase/inventory";

/**
 * Inventaire du stock confie au transporteur.
 *
 * Quatre chiffres, et c'est l'ecart entre les deux derniers qui compte :
 * ce qu'il devrait detenir, et ce qu'il declare detenir.
 */

const nf = new Intl.NumberFormat("fr-FR");

type Data = {
  products: ProductStock[];
  totals: InventoryTotals;
  returns: ReturnedParcel[];
  unmatched: number;
  carrierLive: boolean;
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

  /** Enregistre le stock recu, puis relit : le reel en depend. */
  /**
   * Enregistre une quantite saisie sur la ligne.
   *
   * Les deux colonnes saisissables passent par ici : elles ne
   * different que par le champ envoye, et deux fonctions jumelles
   * auraient diverge a la premiere correction.
   */
  async function saveQuantite(
    product: ProductStock,
    champ: "stockSent" | "stockPurchased",
    value: number
  ) {
    setSavingId(product.id);
    setError(null);
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [champ]: value }),
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

  async function saveReceived(product: ProductStock, value: number) {
    await saveQuantite(product, "stockSent", value);
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
            Ce que le transporteur devrait detenir, et ce qu&apos;il declare.
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
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card
              tone="gray"
              icon={<Send className="h-4 w-4" />}
              title="STOCK RECU"
              value={t.received}
              note="Remis au transporteur depuis le debut, saisi."
            />
            <Card
              tone="blue"
              icon={<Truck className="h-4 w-4" />}
              title="STOCK LIVRE"
              value={t.delivered}
              note="Unites remises aux clients."
            />
            <Card
              tone="emerald"
              icon={<Warehouse className="h-4 w-4" />}
              title="STOCK REEL"
              value={t.real}
              note="Recu moins livre : ce qui devrait rester."
            />
            <Card
              tone="violet"
              icon={<Boxes className="h-4 w-4" />}
              title="STOCK FORCELOG"
              value={t.carrier}
              note={
                data?.carrierLive
                  ? "Lu chez le transporteur a l'instant."
                  : "Transporteur injoignable : dernier chiffre connu."
              }
            />
          </div>

          {/* La comparaison, dite en toutes lettres. */}
          {t.received > 0 && (
            <p
              className={`mb-5 rounded-lg border-2 px-3.5 py-3 text-[12.5px] ${
                t.gap === 0
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                  : t.gap > 0
                    ? "border-red-300 bg-red-50 text-red-800"
                    : "border-amber-300 bg-amber-50 text-amber-800"
              }`}
            >
              {t.gap === 0 ? (
                <>
                  <span className="font-semibold">Les comptes tombent juste.</span>{" "}
                  Le transporteur declare exactement ce qu&apos;il devrait detenir.
                </>
              ) : t.gap > 0 ? (
                <>
                  <span className="font-semibold">
                    {nf.format(t.gap)} article{t.gap > 1 ? "s" : ""} manquant
                    {t.gap > 1 ? "s" : ""} chez le transporteur.
                  </span>{" "}
                  Recu {nf.format(t.received)}, livre {nf.format(t.delivered)} : il
                  devrait en detenir {nf.format(t.real)}, il en declare{" "}
                  {nf.format(t.carrier)}. Sur cet ecart,{" "}
                  {nf.format(t.inTransit)} roulent encore et{" "}
                  {nf.format(t.returned)} sont revenus — le reste a disparu.
                </>
              ) : (
                <>
                  <span className="font-semibold">
                    Le transporteur declare {nf.format(-t.gap)} article
                    {-t.gap > 1 ? "s" : ""} de plus que prevu.
                  </span>{" "}
                  Un envoi manque sans doute dans la colonne &laquo; recu &raquo;.
                </>
              )}
            </p>
          )}

          {data.unmatched > 0 && (
            <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-[12.5px] text-amber-800">
              {nf.format(data.unmatched)} unite{data.unmatched > 1 ? "s" : ""}{" "}
              expediee{data.unmatched > 1 ? "s" : ""} portent une reference absente
              du catalogue : elles ne sont comptees dans aucune ligne.
            </p>
          )}

          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[840px] text-[12.5px]">
              <thead className="border-b border-gray-200 text-left text-gray-500">
                <tr>
                  <th className="px-3 py-3 font-medium">Produit</th>
                  <th className="px-3 py-3 font-medium">Qte achetee</th>
                  <th className="px-3 py-3 font-medium">Stock recu</th>
                  <th className="px-3 py-3 font-medium">Stock livre</th>
                  <th className="px-3 py-3 font-medium">Stock reel</th>
                  <th className="px-3 py-3 font-medium">Stock ForceLog</th>
                  <th className="px-3 py-3 font-medium">Ecart</th>
                  <th className="px-3 py-3 font-medium">En route</th>
                  <th className="px-3 py-3 font-medium">Retours</th>
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
                        value={p.purchased}
                        onCommit={(v) =>
                          void saveQuantite(p, "stockPurchased", v)
                        }
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <QuantityInput
                        value={p.received}
                        onCommit={(v) => void saveReceived(p, v)}
                      />
                    </td>
                    <td className="px-3 py-2.5 font-mono text-blue-700">
                      {nf.format(p.delivered)}
                    </td>
                    <td className="px-3 py-2.5 font-mono font-semibold text-emerald-700">
                      {nf.format(p.real)}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-violet-700">
                      {nf.format(p.carrier)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`rounded-md px-1.5 py-0.5 font-mono ${
                          p.received === 0
                            ? "text-gray-300"
                            : p.gap === 0
                              ? "bg-emerald-50 text-emerald-700"
                              : p.gap > 0
                                ? "bg-red-50 text-red-700"
                                : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {p.received === 0 ? "—" : nf.format(p.gap)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-gray-700">
                      {nf.format(p.inTransit)}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-gray-500">
                      {nf.format(p.returned)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-[11.5px] text-gray-400">
            <span className="text-gray-500">Qte achetee</span> se saisit aussi :
            aucune facture fournisseur ne passe par l&apos;application.{" "}
            <span className="text-gray-500">Stock recu</span> se saisit : personne
            d&apos;autre ne sait ce que vous avez remis au transporteur.{" "}
            <span className="text-gray-500">Stock livre</span> compte les unites
            de chaque colis, references multiples comprises.{" "}
            <span className="text-gray-500">Stock ForceLog</span> vient de la
            synchronisation du stock.
          </p>
        </>
      )}
    </main>
  );
}

const TONES = {
  gray: { border: "border-gray-300", text: "text-gray-500" },
  emerald: { border: "border-emerald-400", text: "text-emerald-700" },
  blue: { border: "border-blue-400", text: "text-blue-700" },
  violet: { border: "border-violet-400", text: "text-violet-700" },
} as const;

function Card({
  tone,
  icon,
  title,
  value,
  note,
}: {
  tone: keyof typeof TONES;
  icon: React.ReactNode;
  title: string;
  value: number;
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
      <p className="font-mono text-[28px] font-semibold text-gray-900">
        {nf.format(value)}
      </p>
      <p className="text-[12px] text-gray-500">{note}</p>
    </section>
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
