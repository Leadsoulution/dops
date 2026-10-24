"use client";

import { useState } from "react";
import { AlertCircle, Landmark, Loader2, X } from "lucide-react";
import SelectDropdown from "./SelectDropdown";
import {
  CAPITAL_CATEGORIES,
  type CapitalMovement,
  type CapitalMovementInput,
  type Direction,
} from "@/lib/finance/capital";

/**
 * Saisie d'un mouvement de banque.
 *
 * Le sens vient en premier et se choisit en grand : tout le reste du
 * formulaire est identique pour une entree et une sortie, et se
 * tromper de sens deplace le solde de deux fois le montant.
 */

const aujourdhui = () => new Date().toISOString().slice(0, 10);

const SENS = [
  { id: "sortie", label: "Sortie", aide: "L'argent quitte le compte" },
  { id: "entree", label: "Entree", aide: "L'argent arrive sur le compte" },
] as const;

export default function CapitalMovementModal({
  onClose,
  onSaved,
  movement,
}: {
  onClose: () => void;
  onSaved: () => void;
  /** Mouvement existant : le formulaire passe en correction. */
  movement?: CapitalMovement | null;
}) {
  const [direction, setDirection] = useState<Direction>(
    movement?.direction ?? "sortie"
  );
  const [label, setLabel] = useState(movement?.label ?? "");
  const [amount, setAmount] = useState(String(movement?.amountMad ?? ""));
  const [category, setCategory] = useState<string | null>(
    movement?.category ?? null
  );
  const [happenedOn, setHappenedOn] = useState(
    movement?.happenedOn ?? aujourdhui()
  );
  const [note, setNote] = useState(movement?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const corps: CapitalMovementInput = {
        direction,
        label: label.trim(),
        category: category || null,
        note: note.trim() || null,
        amountMad: Number(amount.replace(",", ".")),
        happenedOn,
      };
      const res = await fetch(
        movement ? `/api/capital/${movement.id}` : "/api/capital",
        {
          method: movement ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(corps),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  const champ =
    "w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-800 focus:border-gray-400 focus:outline-none";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-0 sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white sm:max-w-md sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <p className="flex items-center gap-2 text-h3 font-semibold text-gray-900">
            <Landmark className="h-4 w-4 text-gray-400" />
            {movement ? "Corriger le mouvement" : "Nouveau mouvement"}
          </p>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3.5 px-5 py-4">
          <div className="grid grid-cols-2 gap-2">
            {SENS.map((choix) => {
              const actif = direction === choix.id;
              const couleur =
                choix.id === "sortie"
                  ? "border-red-300 bg-red-50"
                  : "border-emerald-300 bg-emerald-50";
              const texte =
                choix.id === "sortie" ? "text-red-700" : "text-emerald-700";
              return (
                <button
                  key={choix.id}
                  onClick={() => setDirection(choix.id)}
                  className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    actif ? couleur : "border-gray-200 bg-white hover:bg-gray-50"
                  }`}
                >
                  <span
                    className={`block text-[13px] font-semibold ${
                      actif ? texte : "text-gray-700"
                    }`}
                  >
                    {choix.label}
                  </span>
                  <span className="block text-[11.5px] text-gray-500">
                    {choix.aide}
                  </span>
                </button>
              );
            })}
          </div>

          <div>
            <label className="mb-1 block text-[12px] font-medium text-gray-600">
              Libelle
            </label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Achat cartons, apport, versement recu..."
              className={champ}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[12px] font-medium text-gray-600">
                Montant (MAD)
              </label>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                className={`${champ} font-mono`}
              />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-gray-600">
                Date
              </label>
              <input
                type="date"
                value={happenedOn}
                onChange={(e) => setHappenedOn(e.target.value)}
                className={`${champ} font-mono`}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[12px] font-medium text-gray-600">
              Categorie
            </label>
            <SelectDropdown
              pinnedLabel="Categorie"
              options={CAPITAL_CATEGORIES}
              value={category ?? undefined}
              onSelect={setCategory}
            />
          </div>

          <div>
            <label className="mb-1 block text-[12px] font-medium text-gray-600">
              Note
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className={champ}
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
            onClick={save}
            disabled={saving}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-gray-800 disabled:opacity-60 sm:w-auto"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
