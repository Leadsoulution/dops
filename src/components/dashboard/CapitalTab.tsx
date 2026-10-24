"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Landmark,
  Loader2,
  Megaphone,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import ConfirmDialog from "./ConfirmDialog";
import CapitalMovementModal from "./CapitalMovementModal";
import {
  capitalLines,
  capitalSummary,
  type CapitalMovement,
} from "@/lib/finance/capital";
import type { Expense } from "@/lib/finance/expense-types";

/**
 * Le capital : ce qui reste en banque.
 *
 * Volontairement separe du profit. Une societe peut etre rentable et
 * sans tresorerie — c'est meme la facon la plus courante de faire
 * faillite : la marchandise est payee aujourd'hui, le transporteur
 * verse dans trois semaines. Cet ecran repond a une seule question,
 * combien reste-t-il, et ne touche a aucun calcul de profit.
 *
 * Les budgets publicitaires y descendent automatiquement : ils sont
 * deja saisis ailleurs, et les ressaisir ici donnerait deux verites a
 * tenir a jour.
 */

const nf = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default function CapitalTab() {
  const [movements, setMovements] = useState<CapitalMovement[] | null>(null);
  const [publicites, setPublicites] = useState<Expense[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ movement?: CapitalMovement | null } | null>(
    null
  );
  const [aSupprimer, setASupprimer] = useState<CapitalMovement | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      const [banque, charges] = await Promise.all([
        fetch("/api/capital").then((r) => r.json()),
        fetch("/api/expenses").then((r) => r.json()),
      ]);
      if (banque.error) {
        setError(banque.error);
        return;
      }
      setMovements(banque.movements as CapitalMovement[]);
      setPublicites(
        ((charges.expenses ?? []) as Expense[]).filter(
          (e) => e.type === "publicite"
        )
      );
      setError(null);
    } catch {
      setError("Lecture impossible.");
    }
  }


  const lignes = useMemo(
    () =>
      capitalLines(
        movements ?? [],
        publicites.map((p) => ({
          id: p.id,
          label: p.label,
          platform: p.platform,
          amountMad: p.amountMad,
          startDate: p.startDate,
        }))
      ),
    [movements, publicites]
  );
  const total = useMemo(() => capitalSummary(lignes), [lignes]);

  async function supprimer(movement: CapitalMovement) {
    setBusy(true);
    try {
      const res = await fetch(`/api/capital/${movement.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setASupprimer(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Suppression impossible.");
    } finally {
      setBusy(false);
    }
  }

  const cartes = [
    {
      titre: "Solde en banque",
      valeur: total.solde,
      aide: "Entrees moins sorties, depuis le premier mouvement",
      couleur: total.solde < 0 ? "text-red-600" : "text-gray-900",
      icone: Landmark,
    },
    {
      titre: "Entrees",
      valeur: total.entrees,
      aide: "Apports et versements encaisses",
      couleur: "text-emerald-600",
      icone: ArrowUpRight,
    },
    {
      titre: "Sorties",
      valeur: total.sorties,
      aide: `dont ${nf.format(total.sortiesPublicite)} DH de publicite`,
      couleur: "text-red-600",
      icone: ArrowDownRight,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {cartes.map((c) => {
          const Icone = c.icone;
          return (
            <div
              key={c.titre}
              className="rounded-xl border border-gray-200 bg-white p-4"
            >
              <p className="flex items-center gap-1.5 text-[12.5px] text-gray-500">
                <Icone className="h-3.5 w-3.5 text-gray-400" />
                {c.titre}
              </p>
              <p
                className={`mt-1 font-mono text-[22px] font-semibold ${c.couleur}`}
              >
                {nf.format(c.valeur)}{" "}
                <span className="text-[13px] font-medium text-gray-400">DH</span>
              </p>
              <p className="text-[11.5px] text-gray-400">{c.aide}</p>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div>
            <p className="text-h3 font-semibold text-gray-900">
              Mouvements du compte
            </p>
            <p className="text-[12.5px] text-gray-500">
              {lignes.length} mouvement{lignes.length > 1 ? "s" : ""} &middot;
              hors calcul du profit
            </p>
          </div>
          <button
            onClick={() => setModal({})}
            className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-3.5 py-2 text-[12.5px] font-medium text-white hover:bg-gray-800"
          >
            <Plus className="h-3.5 w-3.5" />
            Ajouter un mouvement
          </button>
        </div>

        {/*
          Dit une fois ce que l'ecran ne fera pas : ces montants ne
          touchent pas au profit, et les publicites ne se saisissent
          pas ici. Sans cela, elles seraient comptees deux fois.
        */}
        <p className="flex items-start gap-2 border-b border-gray-100 bg-blue-50/50 px-5 py-2.5 text-[12px] leading-relaxed text-blue-800">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Ces mouvements n&apos;entrent dans aucun calcul de profit. Les
            budgets publicitaires descendent automatiquement de la section
            Publicite : ne les ressaisissez pas ici.
          </span>
        </p>

        {error && (
          <p className="mx-5 mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        )}

        {!movements && !error && (
          <p className="flex items-center justify-center gap-2 py-16 text-[13px] text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Lecture du compte...
          </p>
        )}

        {movements && lignes.length === 0 && (
          <p className="py-16 text-center text-[13px] text-gray-500">
            Aucun mouvement. Commencez par saisir le capital present sur le
            compte, en entree.
          </p>
        )}

        {movements && lignes.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left">
              <thead>
                <tr className="border-b border-gray-100 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  <th className="px-5 py-3">Date</th>
                  <th className="px-3 py-3">Libelle</th>
                  <th className="px-3 py-3">Origine</th>
                  <th className="px-3 py-3 text-right">Montant</th>
                  <th className="px-3 py-3 w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((l) => {
                  const movement =
                    l.source === "manuel"
                      ? (movements ?? []).find((m) => m.id === l.id)
                      : undefined;
                  return (
                    <tr
                      key={l.id}
                      className="border-b border-gray-50 text-[13px] text-gray-700 last:border-0"
                    >
                      <td className="whitespace-nowrap px-5 py-3 font-mono text-[12px] text-gray-500">
                        {l.date}
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-medium text-gray-800">{l.label}</p>
                        {l.detail && (
                          <p className="text-[11.5px] text-gray-400">
                            {l.detail}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {l.source === "publicite" ? (
                          <span className="flex w-fit items-center gap-1 rounded-md bg-pink-50 px-2 py-0.5 text-[11.5px] font-medium text-pink-700">
                            <Megaphone className="h-3 w-3" />
                            Publicite
                          </span>
                        ) : (
                          <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[11.5px] font-medium text-gray-500">
                            Saisi
                          </span>
                        )}
                      </td>
                      <td
                        className={`whitespace-nowrap px-3 py-3 text-right font-mono font-medium ${
                          l.direction === "entree"
                            ? "text-emerald-600"
                            : "text-red-600"
                        }`}
                      >
                        {l.direction === "entree" ? "+" : "−"}
                        {nf.format(l.amount)}
                      </td>
                      <td className="px-3 py-3">
                        {/*
                          Une ligne de publicite se corrige dans sa
                          section : la modifier ici laisserait croire
                          que le budget a change, alors que le profit
                          continuerait de compter l'ancien.
                        */}
                        {movement ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setModal({ movement })}
                              title="Corriger"
                              className="rounded-md border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setASupprimer(movement)}
                              title="Supprimer"
                              className="rounded-md border border-gray-200 p-1.5 text-red-500 hover:bg-red-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11.5px] text-gray-300">
                            Section Publicite
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <CapitalMovementModal
          movement={modal.movement}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            void load();
          }}
        />
      )}

      {aSupprimer && (
        <ConfirmDialog
          title="Supprimer le mouvement"
          message={
            <>
              Supprimer{" "}
              <span className="font-medium text-gray-700">
                {aSupprimer.label}
              </span>{" "}
              ? Le solde sera recalcule sans lui.
            </>
          }
          confirmLabel="Supprimer"
          danger
          pending={busy}
          onConfirm={() => supprimer(aSupprimer)}
          onCancel={() => setASupprimer(null)}
        />
      )}
    </div>
  );
}
