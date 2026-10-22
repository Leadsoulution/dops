"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  Copy,
  Loader2,
  Pencil,
  Plus,
  Power,
  Receipt,
  Trash2,
} from "lucide-react";
import SelectDropdown from "./SelectDropdown";
import ConfirmDialog from "./ConfirmDialog";
import AddExpenseModal from "./AddExpenseModal";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_TYPES,
  PLATFORMS,
  monthlyAmount,
  type Expense,
} from "@/lib/finance/expense-types";

/**
 * Les charges, en liste.
 *
 * Une charge qui ne sert plus se desactive ; elle ne se supprime que
 * si elle n'aurait jamais du exister. La difference compte : une
 * charge desactivee continue d'expliquer les profits des mois ou elle
 * pesait, une charge supprimee les rend inexplicables.
 */

const nf = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const TYPE_LABELS = Object.fromEntries(
  EXPENSE_TYPES.map((t) => [t.value, t.label])
) as Record<Expense["type"], string>;

const TYPE_COULEURS: Record<Expense["type"], string> = {
  par_commande: "bg-blue-50 text-blue-700",
  fixe: "bg-violet-50 text-violet-700",
  variable: "bg-amber-50 text-amber-700",
  publicite: "bg-pink-50 text-pink-700",
  ponctuelle: "bg-gray-100 text-gray-600",
};

const TOUS = "Tous";

/** Ce qui distingue une charge des autres du meme type. */
function detail(e: Expense): string {
  const bouts: string[] = [];
  if (e.type === "par_commande" && e.appliesToStatus) {
    bouts.push(`sur commandes ${e.appliesToStatus}s`.replace("toutess", "toutes"));
  }
  // Le transporteur vise se lit dans la liste : deux charges du meme
  // nom, l'une a 33 et l'autre a 25, ne se distinguent que par lui.
  if (e.appliesToCarrier) {
    bouts.push(e.appliesToCarrier === "speedaf" ? "Speedaf" : "ForceLog");
  }
  if (e.periodicity) bouts.push(e.periodicity);
  if (e.platform) bouts.push(e.platform);
  if (e.productName) bouts.push(e.productName);
  if (e.currency !== "MAD") {
    bouts.push(`${nf.format(e.amount)} ${e.currency} x ${e.exchangeRate}`);
  }
  return bouts.join(" - ");
}

/** Ce que la charge coute par mois, pour comparer ce qui est comparable. */
function parMois(e: Expense): string {
  if (e.type === "fixe" || e.type === "variable") {
    return `${nf.format(monthlyAmount(e.amountMad, e.periodicity))} /mois`;
  }
  if (e.type === "par_commande") return "par commande";
  return "—";
}

export default function ExpensesTab({
  /** Previent la page que les charges ont bouge : le profit en depend. */
  onChanged,
}: {
  onChanged?: () => void;
} = {}) {
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [modal, setModal] = useState<{ expense?: Expense | null } | null>(null);
  const [aSupprimer, setASupprimer] = useState<Expense | null>(null);

  const [fType, setFType] = useState<string | null>(null);
  const [fCategorie, setFCategorie] = useState<string | null>(null);
  const [fPlateforme, setFPlateforme] = useState<string | null>(null);
  const [fMois, setFMois] = useState<string | null>(null);

  async function load() {
    try {
      const body = await fetch("/api/expenses").then((r) => r.json());
      if (body.error) setError(body.error);
      else {
        setExpenses(body.expenses as Expense[]);
        setError(null);
        onChanged?.();
      }
    } catch {
      setError("Charges indisponibles.");
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/expenses")
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        if (body.error) setError(body.error);
        else setExpenses(body.expenses as Expense[]);
      })
      .catch(() => {
        if (!cancelled) setError("Charges indisponibles.");
      });
    fetch("/api/products")
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        const liste = (body.products ?? body ?? []) as {
          id: string;
          name: string;
        }[];
        if (Array.isArray(liste)) setProducts(liste);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function basculer(e: Expense) {
    setBusy(e.id);
    try {
      await fetch(`/api/expenses/${e.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !e.isActive }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function supprimer(e: Expense) {
    setBusy(e.id);
    try {
      const res = await fetch(`/api/expenses/${e.id}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Suppression refusee.");
      setASupprimer(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue.");
    } finally {
      setBusy(null);
    }
  }

  /** Dupliquer ouvre le formulaire pre-rempli, sans identifiant. */
  function dupliquer(e: Expense) {
    setModal({
      expense: { ...e, id: "", label: `${e.label} (copie)` } as Expense,
    });
  }

  const liste = (expenses ?? []).filter((e) => {
    if (fType && fType !== TOUS && TYPE_LABELS[e.type] !== fType) return false;
    if (fCategorie && fCategorie !== TOUS && e.category !== fCategorie) return false;
    if (fPlateforme && fPlateforme !== TOUS && e.platform !== fPlateforme) return false;
    if (fMois && fMois !== TOUS && !e.startDate.startsWith(fMois)) return false;
    return true;
  });

  const mois = [
    ...new Set((expenses ?? []).map((e) => e.startDate.slice(0, 7))),
  ].sort((a, b) => b.localeCompare(a));

  const totalMensuel = liste
    .filter((e) => e.isActive && (e.type === "fixe" || e.type === "variable"))
    .reduce((s, e) => s + monthlyAmount(e.amountMad, e.periodicity), 0);

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
        <div>
          <p className="text-h3 font-semibold text-gray-900">Charges</p>
          <p className="text-[12.5px] text-gray-500">
            {liste.length} charge{liste.length > 1 ? "s" : ""}
            {totalMensuel > 0 &&
              ` — ${nf.format(totalMensuel)} MAD de recurrent par mois`}
          </p>
        </div>
        <button
          onClick={() => setModal({})}
          className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-3.5 py-2 text-[12.5px] font-medium text-white hover:bg-gray-800"
        >
          <Plus className="h-3.5 w-3.5" />
          Ajouter une charge
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-5 py-3">
        <SelectDropdown
          variant="chip"
          pinnedLabel="Type"
          options={[TOUS, ...EXPENSE_TYPES.map((t) => t.label)]}
          value={fType ?? undefined}
          onSelect={setFType}
        />
        <SelectDropdown
          variant="chip"
          pinnedLabel="Categorie"
          options={[TOUS, ...EXPENSE_CATEGORIES]}
          value={fCategorie ?? undefined}
          onSelect={setFCategorie}
        />
        <SelectDropdown
          variant="chip"
          pinnedLabel="Plateforme"
          options={[TOUS, ...PLATFORMS]}
          value={fPlateforme ?? undefined}
          onSelect={setFPlateforme}
        />
        <SelectDropdown
          variant="chip"
          pinnedLabel="Mois"
          options={[TOUS, ...mois]}
          value={fMois ?? undefined}
          onSelect={setFMois}
        />
      </div>

      {error && (
        <p className="mx-5 mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}

      {!expenses && !error && (
        <p className="flex items-center justify-center gap-2 py-16 text-[13px] text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Lecture des charges...
        </p>
      )}

      {expenses && liste.length === 0 && (
        <div className="px-5 py-16 text-center">
          <Receipt className="mx-auto mb-2 h-6 w-6 text-gray-300" />
          <p className="text-[13px] text-gray-500">
            {expenses.length === 0
              ? "Aucune charge enregistree."
              : "Aucune charge ne correspond a ces filtres."}
          </p>
          {expenses.length === 0 && (
            <p className="mt-1 text-[12px] text-gray-400">
              Emballage, loyer, publicite : sans elles le profit par commande
              reste une approximation.
            </p>
          )}
        </div>
      )}

      {/*
        Une colonne par nature de charge.
        Une liste unique melangeait un loyer, un budget publicitaire et
        trois dirhams d'emballage : trois choses qui ne se comparent
        pas, ne se decident pas au meme moment et ne se verifient pas
        de la meme facon. Chacune a desormais sa colonne et son total.
      */}
      {expenses && liste.length > 0 && (
        <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
          {EXPENSE_TYPES.filter(
            (t) => !fType || fType === TOUS || t.label === fType
          ).map((t) => {
            const colonne = liste.filter((e) => e.type === t.value);
            const total = colonne
              .filter((e) => e.isActive)
              .reduce(
                (somme, e) =>
                  somme +
                  (e.type === "fixe" || e.type === "variable"
                    ? monthlyAmount(e.amountMad, e.periodicity)
                    : e.amountMad),
                0
              );
            const parUnite = t.value === "par_commande";
            return (
              <div
                key={t.value}
                className="flex flex-col overflow-hidden rounded-xl border border-gray-200"
              >
                <div className="flex items-start justify-between gap-2 border-b border-gray-100 bg-gray-50 px-3 py-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-gray-800">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[11px] ${TYPE_COULEURS[t.value]}`}
                      >
                        {t.label}
                      </span>
                      <span className="font-normal text-gray-400">
                        {colonne.length}
                      </span>
                    </p>
                  </div>
                  {colonne.length > 0 && (
                    <p className="shrink-0 text-right font-mono text-[12.5px] font-semibold text-gray-900">
                      {nf.format(total)}
                      <span className="ml-1 font-sans text-[10.5px] font-normal text-gray-400">
                        {parUnite
                          ? "DH / commande"
                          : t.value === "fixe" || t.value === "variable"
                            ? "DH / mois"
                            : "DH"}
                      </span>
                    </p>
                  )}
                </div>

                {colonne.length === 0 ? (
                  <p className="px-3 py-6 text-center text-[11.5px] text-gray-400">
                    Aucune charge
                  </p>
                ) : (
                  <ul className="divide-y divide-gray-50">
                    {colonne.map((e) => (
                      <li
                        key={e.id}
                        className={`px-3 py-2 ${e.isActive ? "" : "bg-gray-50/60"}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p
                              className={`truncate text-[12.5px] font-medium ${
                                e.isActive ? "text-gray-800" : "text-gray-400"
                              }`}
                            >
                              {e.label}
                            </p>
                            <p className="truncate text-[11px] text-gray-400">
                              {detail(e) || e.category || "—"}
                            </p>
                          </div>
                          <p
                            className={`shrink-0 text-right font-mono text-[12.5px] ${
                              e.isActive ? "text-gray-900" : "text-gray-400"
                            }`}
                          >
                            {nf.format(e.amountMad)}
                            <span className="block font-sans text-[10.5px] text-gray-400">
                              {/* Une charge annuelle ne se compare pas a
                                  une mensuelle : on montre les deux. */}
                              {e.type === "fixe" || e.type === "variable"
                                ? parMois(e)
                                : e.startDate}
                            </span>
                          </p>
                        </div>
                        <div className="mt-1 flex items-center gap-0.5">
                          <Action
                            title="Modifier"
                            onClick={() => setModal({ expense: e })}
                            icon={<Pencil className="h-3.5 w-3.5" />}
                          />
                          <Action
                            title="Dupliquer"
                            onClick={() => dupliquer(e)}
                            icon={<Copy className="h-3.5 w-3.5" />}
                          />
                          <Action
                            title={e.isActive ? "Desactiver" : "Reactiver"}
                            onClick={() => void basculer(e)}
                            busy={busy === e.id}
                            icon={<Power className="h-3.5 w-3.5" />}
                            tone={e.isActive ? "" : "text-emerald-600"}
                          />
                          <Action
                            title="Supprimer"
                            onClick={() => setASupprimer(e)}
                            icon={<Trash2 className="h-3.5 w-3.5" />}
                            tone="text-red-600"
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <AddExpenseModal
          expense={modal.expense?.id ? modal.expense : (modal.expense ?? null)}
          products={products}
          onClose={() => setModal(null)}
          onSaved={() => void load()}
        />
      )}

      {aSupprimer && (
        <ConfirmDialog
          title="Supprimer cette charge ?"
          message={
            <>
              <span className="font-medium">{aSupprimer.label}</span> sera
              effacee definitivement, et les profits des mois ou elle pesait ne
              s&apos;expliqueront plus.
              <br />
              Pour qu&apos;elle cesse simplement de compter a l&apos;avenir,
              desactivez-la plutot.
            </>
          }
          confirmLabel="Supprimer"
          danger
          pending={busy === aSupprimer.id}
          onConfirm={() => void supprimer(aSupprimer)}
          onCancel={() => setASupprimer(null)}
        />
      )}
    </div>
  );
}

function Action({
  title,
  onClick,
  icon,
  busy,
  tone = "",
}: {
  title: string;
  onClick: () => void;
  icon: React.ReactNode;
  busy?: boolean;
  tone?: string;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={busy}
      className={`rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50 ${tone}`}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
    </button>
  );
}
