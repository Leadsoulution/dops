"use client";

import { useEffect, useState } from "react";
import { Loader2, Megaphone, Pencil, Plus } from "lucide-react";
import AddExpenseModal from "./AddExpenseModal";
import InfoTip, { Formule } from "./InfoTip";
import type { Expense } from "@/lib/finance/expense-types";

/**
 * Les campagnes publicitaires, et ce qu'elles ont rapporte.
 *
 * Une campagne se saisit avec son budget et ses deux dates, puis se
 * juge sur les commandes arrivees pendant qu'elle tournait — pas sur
 * celles livrees a ce moment-la. Une commande recue le 30 septembre
 * est livree en octobre : la compter en octobre attribuerait au budget
 * d'octobre une vente payee par celui de septembre.
 *
 * Le revenu annonce est celui des commandes de la campagne deja
 * remises au client. Celles encore en route sont comptees a part :
 * elles peuvent encore echouer, et les ajouter au revenu ferait passer
 * une esperance pour un encaissement.
 */

export type AdResult = {
  id: string;
  label: string;
  entries: { id: string; label: string; amount: number }[];
  platform?: string;
  startDate: string;
  endDate?: string;
  days: number;
  spend: number;
  received: number;
  confirmed: number;
  delivered: number;
  pending: number;
  revenue: number;
  orderCharges: number;
  profit: number;
  costPerOrder: number;
  costPerDelivered: number;
  deliveryRate: number;
};

const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

function jourCourt(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function AdsSpendTab({
  ads,
  onChanged,
}: {
  ads: AdResult[];
  onChanged: () => void;
}) {
  const [modal, setModal] = useState<{ expense?: Expense | null } | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);

  // Les charges completes servent a rouvrir une campagne pour la
  // corriger : le resultat affiche n'en porte que le resume.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/expenses")
      .then((r) => r.json())
      .then((b) => {
        if (!cancelled && Array.isArray(b.expenses)) setExpenses(b.expenses);
      })
      .catch(() => {});
    fetch("/api/products")
      .then((r) => r.json())
      .then((b) => {
        const liste = (b.products ?? []) as { id: string; name: string }[];
        if (!cancelled && Array.isArray(liste)) setProducts(liste);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ads]);

  // Les fenetres des budgets ne se recouvrent pas : une commande n'est
  // comptee que par un seul d'entre eux, et les colonnes s'additionnent.
  const total = ads.reduce(
    (t, a) => ({
      spend: t.spend + a.spend,
      received: t.received + a.received,
      delivered: t.delivered + a.delivered,
      revenue: t.revenue + a.revenue,
      profit: t.profit + a.profit,
    }),
    { spend: 0, received: 0, delivered: 0, revenue: 0, profit: 0 }
  );

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="flex items-center gap-1.5 text-h3 font-semibold text-gray-900">
            <Megaphone className="h-4 w-4 text-gray-500" />
            Depenses publicitaires
            <InfoTip title="Resultat d'une campagne">
              <p>
                Une campagne se juge sur les commandes <b>recues</b> pendant
                sa diffusion, et non sur celles livrees a ce moment-la.
              </p>
              <Formule>commandes du {"{"}debut{"}"} au {"{"}fin{"}"}</Formule>
              <Formule>
                profit = revenu livre - budget - charges par commande
              </Formule>
              <p>
                Le revenu ne compte que celles deja remises au client. Les
                commandes encore en route sont annoncees a part : elles
                peuvent encore echouer.
              </p>
              <p>
                Toutes les commandes arrivees dans la fenetre sont comptees,
                quelle que soit leur source.
              </p>
            </InfoTip>
          </p>
          <p className="text-[12.5px] text-gray-500">
            Un budget, deux dates. Le montant est ensuite etale sur les jours
            de diffusion.
          </p>
        </div>
        <button
          onClick={() => setModal({ expense: null })}
          className="flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-gray-900 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-gray-800"
        >
          <Plus className="h-3.5 w-3.5" />
          Ajouter un budget pub
        </button>
      </div>

      {ads.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-200 py-10 text-center text-[12.5px] text-gray-400">
          Aucun budget enregistre. Ajoutez un montant avec sa date pour
          mesurer ce qu&apos;il rapporte.
        </p>
      ) : (
        /*
          Un tableau, et non une carte par budget : les budgets se
          saisissent au jour le jour, et vingt cartes empilees ne se
          comparent pas. En ligne, une mauvaise journee se repere d'un
          coup d'oeil.
        */
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[12.5px]">
            <thead>
              <tr className="border-b border-gray-100 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                <th className="py-2">Periode</th>
                <th className="py-2 text-right">Budget</th>
                <th className="py-2 text-right">Recues</th>
                <th className="py-2 text-right">Livrees</th>
                <th className="py-2 text-right">Revenu livre</th>
                <th className="py-2 text-right">Profit</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {ads.map((a) => {
                const saisies = a.entries
                  .map((e) => ({
                    ...e,
                    expense: expenses.find((x) => x.id === e.id) ?? null,
                  }))
                  .filter((e) => e.expense);
                return (
                  <tr key={a.id} className="border-b border-gray-50 last:border-0">
                    <td className="py-2 pr-3">
                      <p className="whitespace-nowrap font-mono text-gray-800">
                        {jourCourt(a.startDate)}
                        {a.days > 1 && ` - ${jourCourt(a.endDate ?? a.startDate)}`}
                        <span className="ml-1.5 font-sans text-[11px] text-gray-400">
                          {a.days} j
                        </span>
                      </p>
                      <p className="truncate text-[11px] text-gray-400">
                        {a.entries.length > 1
                          ? a.entries
                              .map((e) => nf.format(e.amount))
                              .join(" + ")
                          : a.label}
                        {a.platform && ` · ${a.platform}`}
                      </p>
                    </td>
                    <td className="py-2 text-right font-mono text-gray-800">
                      {nf.format(a.spend)}
                    </td>
                    <td className="py-2 text-right font-mono text-gray-700">
                      {a.received}
                      {a.received > 0 && (
                        <span className="block text-[11px] text-gray-400">
                          {nf.format(a.costPerOrder)} l&apos;une
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right font-mono text-gray-700">
                      {a.delivered}
                      <span className="block text-[11px] text-gray-400">
                        {a.deliveryRate}%
                        {a.pending > 0 && ` · ${a.pending} en route`}
                      </span>
                    </td>
                    <td className="py-2 text-right font-mono text-gray-800">
                      {nf.format(a.revenue)}
                    </td>
                    <td
                      className={`py-2 text-right font-mono font-semibold ${
                        a.profit < 0 ? "text-red-600" : "text-emerald-600"
                      }`}
                    >
                      {nf.format(a.profit)}
                      <span className="block font-sans text-[11px] font-normal text-gray-400">
                        {nf.format(a.orderCharges)} de charges
                      </span>
                    </td>
                    {/*
                      Un crayon par budget saisi : deux montants notes le
                      meme jour partagent une ligne, mais restent deux
                      saisies que l'on corrige separement.
                    */}
                    <td className="py-2 pl-2 text-right">
                      <span className="flex items-center justify-end gap-0.5">
                        {saisies.map((e) => (
                          <button
                            key={e.id}
                            onClick={() => setModal({ expense: e.expense })}
                            title={`Modifier ${e.label} (${nf.format(e.amount)} DH)`}
                            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        ))}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 text-[13px] font-semibold text-gray-900">
                <td className="py-2.5">
                  Total
                  <span className="ml-1.5 font-normal text-gray-400">
                    {ads.length} budget{ads.length > 1 ? "s" : ""}
                  </span>
                </td>
                <td className="py-2.5 text-right font-mono">
                  {nf.format(total.spend)}
                </td>
                <td className="py-2.5 text-right font-mono">{total.received}</td>
                <td className="py-2.5 text-right font-mono">{total.delivered}</td>
                <td className="py-2.5 text-right font-mono">
                  {nf.format(total.revenue)}
                </td>
                <td
                  className={`py-2.5 text-right font-mono ${
                    total.profit < 0 ? "text-red-600" : "text-emerald-600"
                  }`}
                >
                  {nf.format(total.profit)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {modal && (
        <AddExpenseModal
          expense={modal.expense}
          products={products}
          lockType="publicite"
          titre={
            modal.expense ? "Modifier la campagne" : "Nouveau budget publicitaire"
          }
          onClose={() => setModal(null)}
          onSaved={onChanged}
        />
      )}
    </div>
  );
}

/** Un ecran d'attente, le temps que les chiffres arrivent. */
export function AdsSpendLoading() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="flex items-center justify-center gap-2 py-10 text-[12.5px] text-gray-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Lecture des campagnes...
      </p>
    </div>
  );
}
