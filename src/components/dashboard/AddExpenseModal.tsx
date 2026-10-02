"use client";

import { useState } from "react";
import { AlertCircle, Loader2, Receipt, X } from "lucide-react";
import SelectDropdown from "./SelectDropdown";
import {
  APPLIES_TO,
  EXPENSE_CATEGORIES,
  EXPENSE_TYPES,
  PLATFORMS,
  toMad,
  type AppliesTo,
  type Expense,
  type ExpenseInput,
  type ExpenseType,
  type Periodicity,
} from "@/lib/finance/expense-types";

/**
 * Saisie d'une charge.
 *
 * Le type commande le formulaire : un loyer n'a pas de plateforme, une
 * campagne n'a pas de statut declencheur. Afficher tous les champs
 * ensemble laisserait saisir des combinaisons que le calcul ne saurait
 * pas lire, et le serveur les effacerait en silence.
 */

const aujourdhui = () => new Date().toISOString().slice(0, 10);

export default function AddExpenseModal({
  onClose,
  onSaved,
  expense,
  products,
}: {
  onClose: () => void;
  onSaved: () => void;
  /** Charge existante : le formulaire passe en modification. */
  expense?: Expense | null;
  products: { id: string; name: string }[];
}) {
  const [type, setType] = useState<ExpenseType>(expense?.type ?? "ponctuelle");
  const [label, setLabel] = useState(expense?.label ?? "");
  const [amount, setAmount] = useState(String(expense?.amount ?? ""));
  const [category, setCategory] = useState<string | null>(
    expense?.category ?? null
  );
  const [note, setNote] = useState(expense?.note ?? "");
  const [startDate, setStartDate] = useState(expense?.startDate ?? aujourdhui());
  const [endDate, setEndDate] = useState(expense?.endDate ?? "");
  const [appliesTo, setAppliesTo] = useState<AppliesTo>(
    expense?.appliesToStatus ?? "livree"
  );
  const [periodicity, setPeriodicity] = useState<Periodicity>(
    expense?.periodicity ?? "mensuelle"
  );
  const [platform, setPlatform] = useState<string | null>(
    expense?.platform ?? null
  );
  const [productId, setProductId] = useState<string | null>(
    expense?.productId ?? null
  );
  const [currency, setCurrency] = useState(expense?.currency ?? "MAD");
  const [rate, setRate] = useState(String(expense?.exchangeRate ?? 10));

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const montant = Number(amount) || 0;
  const taux = currency === "MAD" ? 1 : Number(rate) || 0;
  const parCommande = type === "par_commande";
  const recurrente = type === "fixe" || type === "variable";
  const pub = type === "publicite";

  const nomProduit = products.find((p) => p.id === productId)?.name;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const corps: ExpenseInput = {
        type,
        label,
        category: category ?? undefined,
        note,
        amount: montant,
        currency: pub ? currency : "MAD",
        exchangeRate: pub ? taux : 1,
        appliesToStatus: parCommande ? appliesTo : undefined,
        periodicity: recurrente ? periodicity : undefined,
        platform: pub ? (platform ?? undefined) : undefined,
        productId: parCommande || pub ? productId : null,
        startDate,
        endDate: endDate || null,
      };
      const res = await fetch(
        expense ? `/api/expenses/${expense.id}` : "/api/expenses",
        {
          method: expense ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(corps),
        }
      );
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
      <div className="flex h-full w-full flex-col bg-white shadow-2xl sm:h-auto sm:max-w-md sm:rounded-xl">
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-start gap-2.5">
            <Receipt className="mt-0.5 h-4 w-4 text-gray-700" />
            <h2 className="text-h2 font-semibold text-gray-900">
              {expense ? "Modifier la depense" : "Ajouter une depense"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto px-5 py-4">
          {/* Le type d'abord : c'est lui qui decide du reste. */}
          <div>
            <label className="mb-1 block text-[12.5px] text-gray-600">
              Type de charge *
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {EXPENSE_TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setType(t.value)}
                  title={t.hint}
                  className={`rounded-lg border px-2.5 py-2 text-left text-[12px] transition-colors ${
                    type === t.value
                      ? "border-blue-500 bg-blue-50 text-blue-800"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <span className="block font-medium">{t.label}</span>
                  <span className="block text-[11px] text-gray-400">
                    {t.hint}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <Champ label="Libelle *">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={
                parCommande ? "Ex: Emballage" : "Ex: Loyer du depot"
              }
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none"
            />
          </Champ>

          <Champ
            label={
              parCommande
                ? "Montant par commande *"
                : recurrente
                  ? `Montant par ${periodicity === "annuelle" ? "an" : "mois"} *`
                  : "Montant *"
            }
          >
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-800 focus:border-blue-400 focus:outline-none"
              />
              {pub ? (
                <SelectDropdown
                  variant="field"
                  pinnedLabel="MAD"
                  options={["MAD", "USD"]}
                  value={currency}
                  onSelect={(v) => setCurrency(v ?? "MAD")}
                />
              ) : (
                <span className="shrink-0 text-[12.5px] text-gray-500">MAD</span>
              )}
            </div>
          </Champ>

          {pub && currency !== "MAD" && (
            <Champ label={`Taux de change 1 ${currency} = ? MAD *`}>
              <input
                type="number"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-800 focus:border-blue-400 focus:outline-none"
              />
              <p className="mt-1 text-[11.5px] text-gray-500">
                Enregistre {toMad(montant, taux).toFixed(2)} MAD. Le taux est
                fige avec la depense : un mois clos ne doit pas changer de
                valeur quand le cours bouge.
              </p>
            </Champ>
          )}

          {parCommande && (
            <Champ label="S'applique a *">
              <div className="space-y-1">
                {APPLIES_TO.map((a) => (
                  <button
                    key={a.value}
                    onClick={() => setAppliesTo(a.value)}
                    className={`flex w-full items-baseline gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[12.5px] ${
                      appliesTo === a.value
                        ? "border-blue-500 bg-blue-50 text-blue-800"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <span className="font-medium">{a.label}</span>
                    <span className="text-[11px] text-gray-400">{a.hint}</span>
                  </button>
                ))}
              </div>
            </Champ>
          )}

          {recurrente && (
            <Champ label="Periodicite *">
              <div className="flex gap-1.5">
                {(["mensuelle", "annuelle"] as Periodicity[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriodicity(p)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-[12.5px] font-medium capitalize ${
                      periodicity === p
                        ? "border-blue-500 bg-blue-50 text-blue-800"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              {periodicity === "annuelle" && montant > 0 && (
                <p className="mt-1 text-[11.5px] text-gray-500">
                  Comptee {(montant / 12).toFixed(2)} MAD par mois : une charge
                  annuelle sert toute l&apos;annee, l&apos;imputer au seul mois
                  du paiement le rendrait deficitaire pour rien.
                </p>
              )}
            </Champ>
          )}

          {pub && (
            <Champ label="Plateforme">
              <SelectDropdown
                variant="field"
                pinnedLabel="Selectionner"
                options={PLATFORMS}
                value={platform ?? undefined}
                onSelect={setPlatform}
              />
            </Champ>
          )}

          {(parCommande || pub) && (
            <Champ label="Produit concerne">
              <SelectDropdown
                variant="field"
                pinnedLabel="Tous les produits"
                options={["Tous les produits", ...products.map((p) => p.name)]}
                value={nomProduit ?? "Tous les produits"}
                searchable
                searchPlaceholder="Rechercher un produit..."
                onSelect={(v) =>
                  setProductId(products.find((p) => p.name === v)?.id ?? null)
                }
              />
            </Champ>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Champ
              label={
                type === "ponctuelle"
                  ? "Date *"
                  : type === "variable"
                    ? "Periode couverte *"
                    : "Date de debut *"
              }
            >
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-800 focus:border-blue-400 focus:outline-none"
              />
            </Champ>
            {type !== "ponctuelle" && (
              <Champ label="Date de fin">
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-800 focus:border-blue-400 focus:outline-none"
                />
              </Champ>
            )}
          </div>

          <Champ label="Categorie">
            <SelectDropdown
              variant="field"
              pinnedLabel="Selectionner"
              options={EXPENSE_CATEGORIES}
              value={category ?? undefined}
              onSelect={setCategory}
            />
          </Champ>

          <Champ label="Note">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none"
            />
          </Champ>

          {error && (
            <p className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-3.5 py-2 text-[12.5px] font-medium text-gray-700 hover:bg-gray-50"
          >
            Annuler
          </button>
          <button
            onClick={() => void save()}
            disabled={saving || !label.trim() || montant <= 0}
            className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-3.5 py-2 text-[12.5px] font-medium text-white hover:bg-gray-800 disabled:opacity-40"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {expense ? "Enregistrer" : "Ajouter"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Champ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-[12.5px] text-gray-600">{label}</label>
      {children}
    </div>
  );
}
