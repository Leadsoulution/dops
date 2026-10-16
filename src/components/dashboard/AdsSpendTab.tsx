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
const mad = (v: number) => `${nf.format(v)} DH`;

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
          Aucune campagne enregistree. Ajoutez un budget avec ses dates de
          debut et de fin pour mesurer ce qu&apos;il rapporte.
        </p>
      ) : (
        <div className="space-y-3">
          {ads.map((a) => {
            const expense = expenses.find((e) => e.id === a.id) ?? null;
            return (
              <div
                key={a.id}
                className="overflow-hidden rounded-xl border border-gray-200"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 bg-gray-50 px-3 py-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <p className="truncate text-[13px] font-semibold text-gray-900">
                      {a.label}
                    </p>
                    {a.platform && (
                      <span className="rounded-full bg-pink-50 px-2 py-0.5 text-[11px] font-medium text-pink-700">
                        {a.platform}
                      </span>
                    )}
                    <span className="font-mono text-[11.5px] text-gray-500">
                      {jourCourt(a.startDate)}
                      {" - "}
                      {a.endDate ? jourCourt(a.endDate) : "en cours"}
                      <span className="ml-1.5 text-gray-400">
                        {a.days} jour{a.days > 1 ? "s" : ""}
                      </span>
                    </span>
                  </div>
                  {expense && (
                    <button
                      onClick={() => setModal({ expense })}
                      title="Modifier cette campagne"
                      className="flex shrink-0 items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11.5px] text-gray-600 hover:bg-gray-50"
                    >
                      <Pencil className="h-3 w-3" />
                      Modifier
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 divide-gray-100 sm:grid-cols-5 sm:divide-x">
                  <Chiffre label="Budget" value={mad(a.spend)} />
                  <Chiffre
                    label="Commandes recues"
                    value={String(a.received)}
                    detail={`${mad(a.costPerOrder)} l'une`}
                  />
                  <Chiffre
                    label="Livrees"
                    value={`${a.delivered}`}
                    detail={`${a.deliveryRate}% · ${mad(a.costPerDelivered)} l'une`}
                  />
                  <Chiffre
                    label="Revenu livre"
                    value={mad(a.revenue)}
                    detail={
                      a.pending > 0 ? `${a.pending} encore en route` : undefined
                    }
                  />
                  <Chiffre
                    label="Profit"
                    value={mad(a.profit)}
                    detail={`dont ${mad(a.orderCharges)} de charges`}
                    tone={a.profit < 0 ? "negatif" : "positif"}
                  />
                </div>
              </div>
            );
          })}
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

function Chiffre({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "positif" | "negatif";
}) {
  return (
    <div className="px-3 py-2.5">
      <p className="truncate text-[10.5px] font-semibold uppercase tracking-wide text-gray-400">
        {label}
      </p>
      <p
        className={`truncate font-mono text-[15px] font-semibold ${
          tone === "negatif"
            ? "text-red-600"
            : tone === "positif"
              ? "text-emerald-600"
              : "text-gray-900"
        }`}
      >
        {value}
      </p>
      {detail && (
        <p className="truncate text-[11px] text-gray-400">{detail}</p>
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
