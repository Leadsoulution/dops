"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  BadgeDollarSign,
  Check,
  Loader2,
  PackageCheck,
  Pencil,
  Truck,
  Wallet,
} from "lucide-react";
import AreaTrendChart from "./AreaTrendChart";
import PeriodFilter from "./PeriodFilter";
import ConfirmDialog from "./ConfirmDialog";
import { periodBounds, type Range } from "./useTeamStats";

/**
 * Paiement des agents de confirmation.
 *
 * L'equipe est payee a la commande livree. L'ecran liste donc les
 * livraisons, dit a qui chacune revient, et ce qui reste du. Une
 * commande retournee ou encore en route n'y figure pas : on ne paie pas
 * une livraison qui n'a pas eu lieu.
 */

type PayableOrder = {
  id: string;
  reference: string;
  client: string;
  trackingNumber: string;
  deliveryStatus: string;
  deliveryDate: string;
  amount: string;
  ville?: string;
  agent: string;
  paid: boolean;
  paidAmount?: number;
  paidAt?: string;
  paidBy?: string;
};

type AgentTotal = {
  agent: string;
  delivered: number;
  paid: number;
  unpaid: number;
  paidAmount: number;
  dueAmount: number;
};

type Report = {
  rate: number;
  orders: PayableOrder[];
  totals: AgentTotal[];
  daily: { date: string; delivered: number; amount: number }[];
  canEdit: boolean;
  error?: string;
};

const dh = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} DH`;

export default function ConfirmationPayPage() {
  const [range, setRange] = useState<Range>({ label: "Maximum", custom: null });
  // Le resultat porte la periode pour laquelle il a ete lu : c'est la
  // comparaison avec la periode affichee qui dit si l'on attend, plutot
  // qu'un drapeau pose depuis l'effet.
  const [loaded, setLoaded] = useState<{
    key: string;
    data: Report | null;
    error: string | null;
  } | null>(null);
  /** Incremente apres un paiement, pour relire la liste. */
  const [reloads, setReloads] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState<"pay" | "unpay" | null>(null);
  const [editingRate, setEditingRate] = useState(false);
  const [rateDraft, setRateDraft] = useState("");
  const [filter, setFilter] = useState<"tous" | "impayees" | "payees">("tous");

  // La periode du selecteur, calculee comme ailleurs : la meme question
  // doit couvrir le meme intervalle sur toutes les pages.
  const bounds = periodBounds(range);

  const key = `${bounds.from ?? ""}|${bounds.to ?? ""}|${reloads}`;

  useEffect(() => {
    let cancelled = false;
    const [from, to] = key.split("|");
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);

    fetch(`/api/confirmation-payments?${params}`)
      .then((res) => res.json())
      .then((data: Report) => {
        if (cancelled) return;
        if (data.error) setLoaded({ key, data: null, error: data.error });
        else {
          setLoaded({ key, data, error: null });
          setSelected(new Set());
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoaded({ key, data: null, error: "Paiements indisponibles." });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [key]);

  const report = loaded?.data ?? null;
  const error = loaded?.error ?? null;
  const loading = loaded?.key !== key;

  const orders = (report?.orders ?? []).filter((o) =>
    filter === "impayees" ? !o.paid : filter === "payees" ? o.paid : true
  );
  const rate = report?.rate ?? 11;
  const canEdit = report?.canEdit ?? false;

  const delivered = report?.orders.length ?? 0;
  const paidCount = report?.orders.filter((o) => o.paid).length ?? 0;
  const dueAmount = (report?.totals ?? []).reduce((s, t) => s + t.dueAmount, 0);
  const paidAmount = (report?.totals ?? []).reduce((s, t) => s + t.paidAmount, 0);

  async function apply(paid: boolean) {
    setConfirming(null);
    setPending(true);
    try {
      await fetch("/api/confirmation-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected], paid }),
      });
    } finally {
      setPending(false);
      setReloads((n) => n + 1);
    }
  }

  async function saveRate() {
    const value = Number(rateDraft.replace(",", "."));
    if (!Number.isFinite(value) || value < 0) return;
    setEditingRate(false);
    setPending(true);
    try {
      await fetch("/api/confirmation-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rate: value }),
      });
    } finally {
      setPending(false);
      setReloads((n) => n + 1);
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allSelected = orders.length > 0 && orders.every((o) => selected.has(o.id));

  return (
    <div className="scrollbar-hide flex-1 overflow-y-auto bg-gray-50 px-4 py-4 lg:px-6 lg:py-5">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50">
            <Wallet className="h-4 w-4 text-amber-600" />
          </div>
          <div>
            <h1 className="text-h1 font-semibold text-gray-900">
              Paiement de confirmatrice
            </h1>
            <p className="text-[13px] text-gray-500">
              Une commande livree, une commission. Suivi de ce qui reste du.
            </p>
          </div>
        </div>

        <Link
          href="/confirmation"
          className="flex items-center gap-1.5 self-start rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-50"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Retour
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <PeriodFilter range={range} onChange={setRange} />

        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5">
          <BadgeDollarSign className="h-4 w-4 text-amber-500" />
          {editingRate ? (
            <>
              <input
                autoFocus
                value={rateDraft}
                onChange={(e) => setRateDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveRate();
                  if (e.key === "Escape") setEditingRate(false);
                }}
                className="w-16 rounded-md border border-gray-200 px-2 py-0.5 text-right font-mono text-[13px] focus:border-blue-400 focus:outline-none"
              />
              <span className="text-[12px] text-gray-500">DH</span>
              <button
                onClick={saveRate}
                className="rounded-md bg-blue-600 px-2 py-1 text-[11.5px] font-medium text-white hover:bg-blue-700"
              >
                Valider
              </button>
            </>
          ) : (
            <>
              <span className="font-mono text-[14px] font-semibold text-gray-900">
                {rate} DH
              </span>
              <span className="text-[12px] text-gray-500">par commande livree</span>
              {canEdit && (
                <button
                  onClick={() => {
                    setRateDraft(String(rate));
                    setEditingRate(true);
                  }}
                  title="Modifier le tarif"
                  className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {error ? (
        <p className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[12.5px] text-red-700">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      ) : loading && !report ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white py-20 text-[13px] text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Lecture des livraisons...
        </div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile
              icon={PackageCheck}
              tone="blue"
              value={delivered.toLocaleString("fr-FR")}
              label="Commandes livrees"
            />
            <Tile
              icon={Check}
              tone="emerald"
              value={paidCount.toLocaleString("fr-FR")}
              label="Deja payees"
            />
            <Tile
              icon={Wallet}
              tone="amber"
              value={dh(dueAmount)}
              label="Reste a payer"
            />
            <Tile
              icon={BadgeDollarSign}
              tone="violet"
              value={dh(paidAmount)}
              label="Deja verse"
            />
          </div>

          <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-xl border border-gray-200 bg-white p-4 lg:col-span-2">
              <p className="mb-3 text-[12.5px] font-semibold text-gray-700">
                Livraisons par jour
              </p>
              {report && report.daily.length > 1 ? (
                <AreaTrendChart
                  labels={report.daily.map((d) => d.date.slice(5))}
                  series={[
                    {
                      name: "Livrees",
                      data: report.daily.map((d) => d.delivered),
                      color: "#2563eb",
                    },
                  ]}
                  height={180}
                />
              ) : (
                <p className="py-10 text-center text-[12.5px] text-gray-400">
                  Pas encore assez de livraisons pour tracer une courbe.
                </p>
              )}
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="mb-3 text-[12.5px] font-semibold text-gray-700">
                Par agent
              </p>
              {report && report.totals.length > 0 ? (
                <div className="space-y-3">
                  {report.totals.map((t) => {
                    const share =
                      t.delivered > 0 ? (t.paid / t.delivered) * 100 : 0;
                    return (
                      <div key={t.agent}>
                        <div className="mb-1 flex items-baseline justify-between gap-2">
                          <span className="truncate text-[12.5px] font-medium text-gray-700">
                            {t.agent}
                          </span>
                          <span className="shrink-0 font-mono text-[12.5px] text-gray-500">
                            {t.delivered}
                          </span>
                        </div>
                        {/* Part deja payee, le reste en attente. */}
                        <div className="flex h-2 overflow-hidden rounded-full bg-amber-100">
                          <div
                            className="bg-emerald-500"
                            style={{ width: `${share}%` }}
                          />
                        </div>
                        <p className="mt-1 text-[11.5px] text-gray-400">
                          <span className="text-emerald-600">
                            {dh(t.paidAmount)} verses
                          </span>
                          {t.dueAmount > 0 && (
                            <>
                              {" · "}
                              <span className="font-medium text-amber-600">
                                {dh(t.dueAmount)} dus
                              </span>
                            </>
                          )}
                        </p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="py-10 text-center text-[12.5px] text-gray-400">
                  Aucune livraison sur la periode.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
              <div className="flex items-center gap-1.5">
                {(["tous", "impayees", "payees"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${
                      filter === f
                        ? "bg-gray-900 text-white"
                        : "border border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {f === "tous" ? "Toutes" : f === "impayees" ? "Non payees" : "Payees"}
                    {report && (
                      <span className="ml-1 font-mono opacity-70">
                        {f === "tous"
                          ? report.orders.length
                          : f === "impayees"
                            ? report.orders.length - paidCount
                            : paidCount}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {canEdit && selected.size > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-gray-500">
                    {selected.size} selectionnee{selected.size > 1 ? "s" : ""}
                  </span>
                  <button
                    onClick={() => setConfirming("pay")}
                    disabled={pending}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Marquer payees
                  </button>
                  <button
                    onClick={() => setConfirming("unpay")}
                    disabled={pending}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-[12.5px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                  >
                    Annuler le paiement
                  </button>
                </div>
              )}
            </div>

            {orders.length === 0 ? (
              <p className="py-14 text-center text-[13px] text-gray-400">
                Aucune commande livree sur cette periode.
              </p>
            ) : (
              <>
                {/* Ordinateur : un tableau, la comparaison ligne a ligne. */}
                <div className="hidden overflow-x-auto lg:block">
                  <table className="w-full min-w-[900px] text-left">
                    <thead className="border-b border-gray-100 text-[11px] font-semibold tracking-wide text-gray-500">
                      <tr>
                        {canEdit && (
                          <th className="w-10 px-4 py-3">
                            <input
                              type="checkbox"
                              checked={allSelected}
                              onChange={() =>
                                setSelected(
                                  allSelected
                                    ? new Set()
                                    : new Set(orders.map((o) => o.id))
                                )
                              }
                              className="h-3.5 w-3.5 rounded border-gray-300"
                            />
                          </th>
                        )}
                        <th className="px-3 py-3">REFERENCE</th>
                        <th className="px-3 py-3">CLIENT</th>
                        <th className="px-3 py-3">CODE SUIVI</th>
                        <th className="px-3 py-3">DATE DE LIVRAISON</th>
                        <th className="px-3 py-3">STATUT LIVRAISON</th>
                        <th className="px-3 py-3">ASSIGNE</th>
                        <th className="px-3 py-3">PAIEMENT</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {orders.map((o) => (
                        <tr key={o.id} className="hover:bg-gray-50/60">
                          {canEdit && (
                            <td className="px-4 py-3">
                              <input
                                type="checkbox"
                                checked={selected.has(o.id)}
                                onChange={() => toggle(o.id)}
                                className="h-3.5 w-3.5 rounded border-gray-300"
                              />
                            </td>
                          )}
                          <td className="whitespace-nowrap px-3 py-3 font-mono text-[12.5px] font-medium text-gray-800">
                            {o.reference}
                          </td>
                          <td className="px-3 py-3 text-[13px] text-gray-800">
                            {o.client}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 font-mono text-[12px] text-gray-600">
                            {o.trackingNumber || "—"}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 font-mono text-[12px] text-gray-600">
                            {o.deliveryDate || "—"}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3">
                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-[12px] font-medium text-white">
                              <Truck className="h-3 w-3" />
                              {o.deliveryStatus}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-[12.5px] text-gray-600">
                            {o.agent || (
                              <span className="text-gray-300">Non attribuee</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3">
                            <PayBadge order={o} rate={rate} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Telephone : une carte par commande. */}
                <div className="divide-y divide-gray-100 lg:hidden">
                  {orders.map((o) => (
                    <div key={o.id} className="px-4 py-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 font-mono text-[12.5px] font-medium text-gray-800">
                          {canEdit && (
                            <input
                              type="checkbox"
                              checked={selected.has(o.id)}
                              onChange={() => toggle(o.id)}
                              className="h-3.5 w-3.5 rounded border-gray-300"
                            />
                          )}
                          {o.reference}
                        </span>
                        <PayBadge order={o} rate={rate} />
                      </div>
                      <p className="text-[13px] font-medium text-gray-800">
                        {o.client}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-gray-500">
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-1.5 py-0.5 font-medium text-white">
                          <Truck className="h-3 w-3" />
                          {o.deliveryStatus}
                        </span>
                        <span className="font-mono">{o.trackingNumber || "—"}</span>
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11.5px] text-gray-400">
                        <span className="font-mono">{o.deliveryDate || "—"}</span>
                        <span>&middot;</span>
                        <span>{o.agent || "Non attribuee"}</span>
                      </p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {confirming && (
        <ConfirmDialog
          title={
            confirming === "pay" ? "Marquer comme payees" : "Annuler le paiement"
          }
          message={
            confirming === "pay" ? (
              <>
                Enregistrer le paiement de{" "}
                <span className="font-medium text-gray-700">
                  {selected.size} commande{selected.size > 1 ? "s" : ""}
                </span>{" "}
                a <span className="font-medium text-gray-700">{rate} DH</span>{" "}
                chacune, soit{" "}
                <span className="font-medium text-gray-700">
                  {dh(selected.size * rate)}
                </span>{" "}
                ?
                <span className="mt-1.5 block text-[12px] text-gray-400">
                  Le tarif est fige maintenant : le changer plus tard ne
                  modifiera pas ces lignes.
                </span>
              </>
            ) : (
              <>
                Retirer la marque de paiement sur{" "}
                <span className="font-medium text-gray-700">
                  {selected.size} commande{selected.size > 1 ? "s" : ""}
                </span>{" "}
                ? Elles repasseront en attente de paiement.
              </>
            )
          }
          confirmLabel={confirming === "pay" ? "Enregistrer" : "Annuler le paiement"}
          pending={pending}
          onConfirm={() => apply(confirming === "pay")}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  );
}

function PayBadge({ order, rate }: { order: PayableOrder; rate: number }) {
  if (order.paid) {
    return (
      <span
        title={
          order.paidAt
            ? `Paye le ${new Date(order.paidAt).toLocaleDateString("fr-FR")}${
                order.paidBy ? ` par ${order.paidBy}` : ""
              }`
            : undefined
        }
        className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-[12px] font-medium text-emerald-700"
      >
        <Check className="h-3 w-3" />
        Paye {order.paidAmount ?? rate} DH
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-[12px] font-medium text-amber-700">
      Non paye {rate} DH
    </span>
  );
}

function Tile({
  icon: Icon,
  tone,
  value,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: "blue" | "emerald" | "amber" | "violet";
  value: string;
  label: string;
}) {
  const bg = {
    blue: "bg-blue-50",
    emerald: "bg-emerald-50",
    amber: "bg-amber-50",
    violet: "bg-violet-50",
  }[tone];
  const color = {
    blue: "text-blue-600",
    emerald: "text-emerald-600",
    amber: "text-amber-600",
    violet: "text-violet-600",
  }[tone];

  return (
    <div className={`flex items-center gap-2.5 rounded-xl p-3.5 ${bg}`}>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white">
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <div className="min-w-0">
        <p className="font-mono text-[17px] font-semibold text-gray-900">{value}</p>
        <p className="truncate text-[11.5px] text-gray-500">{label}</p>
      </div>
    </div>
  );
}
