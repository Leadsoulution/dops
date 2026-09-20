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
  Send,
  Truck,
  Warehouse,
} from "lucide-react";
import type { ProductStock, InventoryTotals } from "@/lib/supabase/inventory";

/**
 * Inventaire.
 *
 * Quatre chiffres en tete, et les deux derniers forment une paire :
 * ce que le transporteur devrait detenir, et ce qu'il declare detenir.
 * Leur ecart est la seule facon de savoir si les retours sont revenus
 * en rayon — le transporteur ne publie que son stock du moment, jamais
 * l'histoire de ce qu'il a recu.
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
   * La relecture n'est pas du zele : changer l'achat deplace le stock
   * reel, changer le confie deplace l'ecart. Recalculer a l'ecran ce
   * que le serveur sait calculer finirait par en differer.
   */
  async function saveField(
    product: ProductStock,
    field: "stockInitial" | "stockSent",
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
            Ce qui reste, et ce que le transporteur devrait detenir.
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
              icon={<Package className="h-4 w-4" />}
              title="STOCK ACHETE"
              value={t.purchased}
              note="Quantite achetee au depart, saisie."
              lines={[["Livre au client", t.delivered]]}
            />

            <Card
              tone="emerald"
              icon={<Warehouse className="h-4 w-4" />}
              title="STOCK REEL"
              value={t.real}
              note="Achete moins livre : ce qui vous appartient encore."
              lines={[
                ["En cours de livraison", t.inTransit],
                ["Retours", t.returned],
              ]}
            />

            {/* Les deux cadres a comparer. */}
            <Card
              tone="blue"
              icon={<Send className="h-4 w-4" />}
              title="ENVOYE AU TRANSPORTEUR"
              value={t.expectedAtCarrier}
              note="Ce qu'il devrait encore detenir."
              lines={[
                ["Confie depuis le debut", t.sent],
                ["Moins le livre", -t.delivered],
              ]}
            />

            <Card
              tone="violet"
              icon={<Truck className="h-4 w-4" />}
              title="RESTANT CHEZ LE TRANSPORTEUR"
              value={t.carrier}
              note="Ce qu'il declare dans sa plateforme."
              lines={[["Ecart avec l'attendu", -t.gap]]}
            />
          </div>

          {/* Le resultat de la comparaison, dit en toutes lettres. */}
          {t.sent > 0 && (
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
                  Le transporteur declare exactement ce qu&apos;il devrait
                  detenir : tous les retours sont revenus en rayon.
                </>
              ) : t.gap > 0 ? (
                <>
                  <span className="font-semibold">
                    Il manque {nf.format(t.gap)} article
                    {t.gap > 1 ? "s" : ""} chez le transporteur.
                  </span>{" "}
                  Vous lui avez confie {nf.format(t.sent)} et il n&apos;en a
                  livre que {nf.format(t.delivered)} : il devrait donc en
                  detenir {nf.format(t.expectedAtCarrier)}, mais il en declare{" "}
                  {nf.format(t.carrier)}. Des retours ne sont pas revenus en
                  stock — ou des colis roulent encore ({nf.format(t.inTransit)}{" "}
                  en cours).
                </>
              ) : (
                <>
                  <span className="font-semibold">
                    Le transporteur declare {nf.format(-t.gap)} article
                    {-t.gap > 1 ? "s" : ""} de plus que prevu.
                  </span>{" "}
                  Soit un envoi n&apos;a pas ete saisi dans la colonne
                  &laquo; Confie &raquo;, soit il a recu de la marchandise
                  autrement.
                </>
              )}
            </p>
          )}

          {data.unmatched > 0 && (
            <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-[12.5px] text-amber-800">
              {data.unmatched} commande{data.unmatched > 1 ? "s" : ""} expediee
              {data.unmatched > 1 ? "s" : ""} ne correspond
              {data.unmatched > 1 ? "ent" : ""} a aucun produit du catalogue :
              ses unites ne sont comptees nulle part.
            </p>
          )}

          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[980px] text-[12.5px]">
              <thead className="border-b border-gray-200 text-left text-gray-500">
                <tr>
                  <th className="px-3 py-3 font-medium">Produit</th>
                  <th className="px-3 py-3 font-medium">Achete</th>
                  <th className="px-3 py-3 font-medium">Stock reel</th>
                  <th className="px-3 py-3 font-medium">Confie</th>
                  <th className="px-3 py-3 font-medium">Attendu chez lui</th>
                  <th className="px-3 py-3 font-medium">Declare par lui</th>
                  <th className="px-3 py-3 font-medium">Ecart</th>
                  <th className="px-3 py-3 font-medium">En route</th>
                  <th className="px-3 py-3 font-medium">Livre</th>
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
                        onCommit={(v) => void saveField(p, "stockInitial", v)}
                      />
                    </td>
                    <td className="px-3 py-2.5 font-mono font-semibold text-emerald-700">
                      {nf.format(p.real)}
                    </td>
                    <td className="px-3 py-2.5">
                      <QuantityInput
                        value={p.sent}
                        onCommit={(v) => void saveField(p, "stockSent", v)}
                      />
                    </td>
                    <td className="px-3 py-2.5 font-mono text-blue-700">
                      {nf.format(p.expectedAtCarrier)}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-violet-700">
                      {nf.format(p.carrier)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`rounded-md px-1.5 py-0.5 font-mono ${
                          p.sent === 0
                            ? "text-gray-300"
                            : p.gap === 0
                              ? "bg-emerald-50 text-emerald-700"
                              : p.gap > 0
                                ? "bg-red-50 text-red-700"
                                : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {p.sent === 0 ? "—" : nf.format(p.gap)}
                      </span>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-[11.5px] text-gray-400">
            <span className="text-gray-500">Achete</span> et{" "}
            <span className="text-gray-500">Confie</span> se saisissent :
            personne d&apos;autre ne les connait.{" "}
            <span className="text-gray-500">Declare par lui</span> vient de la
            synchronisation du stock transporteur. Tout le reste est deduit des
            commandes.
          </p>
        </>
      )}
    </main>
  );
}

const TONES = {
  gray: { border: "border-gray-300", line: "border-gray-200", text: "text-gray-500" },
  emerald: {
    border: "border-emerald-400",
    line: "border-emerald-200",
    text: "text-emerald-700",
  },
  blue: { border: "border-blue-400", line: "border-blue-200", text: "text-blue-700" },
  violet: {
    border: "border-violet-400",
    line: "border-violet-200",
    text: "text-violet-700",
  },
} as const;

function Card({
  tone,
  icon,
  title,
  value,
  note,
  lines,
}: {
  tone: keyof typeof TONES;
  icon: React.ReactNode;
  title: string;
  value: number;
  note: string;
  lines: [string, number][];
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
      <div className={`mt-3 space-y-1 border-t pt-2.5 text-[12.5px] ${style.line}`}>
        {lines.map(([label, n]) => (
          <div key={label} className="flex justify-between gap-2">
            <span className="text-gray-500">{label}</span>
            <span className="shrink-0 font-mono text-gray-800">
              {nf.format(n)}
            </span>
          </div>
        ))}
      </div>
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

  // La valeur du serveur a change : la case suit.
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
