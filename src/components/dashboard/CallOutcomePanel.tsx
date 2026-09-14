"use client";

import { useState } from "react";
import { Check, ChevronDown, Loader2, Phone } from "lucide-react";
import { LEAD_STATUSES, type Lead, type LeadStatus } from "./leads-data";
import ConfirmDialog from "./ConfirmDialog";

/**
 * Resultat d'un appel de confirmation.
 *
 * Les six statuts mis en avant sont ceux qu'un agent pose apres un
 * appel. Les dix-sept autres restent accessibles derriere "Autre
 * statut" : les afficher tous ferait un mur de boutons ou l'on ne
 * trouverait plus les trois qui servent vraiment.
 */

const QUICK_STATUSES: { label: LeadStatus; className: string }[] = [
  { label: "Confirme", className: "bg-emerald-700 hover:bg-emerald-800" },
  { label: "Rappel", className: "bg-blue-600 hover:bg-blue-700" },
  { label: "Pas de rep 1", className: "bg-slate-500 hover:bg-slate-600" },
  { label: "Injoignable 1", className: "bg-orange-500 hover:bg-orange-600" },
  { label: "Annulee", className: "bg-red-600 hover:bg-red-700" },
  { label: "En attente", className: "bg-purple-600 hover:bg-purple-700" },
];

export default function CallOutcomePanel({
  lead,
  onStatusChange,
}: {
  lead: Lead;
  onStatusChange: (status: LeadStatus) => Promise<void> | void;
}) {
  const [allOpen, setAllOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<LeadStatus | null>(null);

  async function apply(status: LeadStatus) {
    setConfirming(null);
    setPending(status);
    try {
      await onStatusChange(status);
    } finally {
      setPending(null);
    }
  }

  /** Reposer le statut deja en place ne change rien : autant l'ignorer. */
  function ask(status: LeadStatus) {
    if (status === lead.status) return;
    setConfirming(status);
  }

  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-gray-500">
        <Phone className="h-3 w-3" />
        APPEL ET STATUT
      </p>

      <a
        href={`tel:${lead.phone.replace(/\s/g, "")}`}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-[13.5px] font-medium text-white hover:bg-blue-700"
      >
        <Phone className="h-4 w-4" />
        Appeler {lead.client.split(" ")[0] || "le client"}
      </a>
      <p className="mt-1.5 text-center text-[11.5px] text-gray-400">
        Si votre navigateur n&apos;ouvre pas le composeur, copiez le numero :{" "}
        <span className="font-mono text-gray-500">{lead.phone}</span>
      </p>

      <p className="mb-2 mt-3 text-[12.5px] text-gray-600">
        Resultat de l&apos;appel
      </p>
      <div className="grid grid-cols-2 gap-2">
        {QUICK_STATUSES.map((option) => {
          const active = lead.status === option.label;
          return (
            <button
              key={option.label}
              onClick={() => ask(option.label)}
              disabled={pending !== null}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-[12.5px] font-medium text-white transition-colors disabled:opacity-60 ${option.className} ${
                active ? "ring-2 ring-gray-900 ring-offset-1" : ""
              }`}
            >
              {pending === option.label ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : active ? (
                <Check className="h-3.5 w-3.5" />
              ) : null}
              {option.label}
            </button>
          );
        })}
      </div>

      <button
        onClick={() => setAllOpen((v) => !v)}
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white py-2 text-[12.5px] font-medium text-gray-700 hover:bg-gray-50"
      >
        Autre statut
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${allOpen ? "rotate-180" : ""}`}
        />
      </button>

      {allOpen && (
        <div className="mt-2 max-h-52 overflow-y-auto rounded-lg border border-gray-200 p-1.5">
          <div className="grid grid-cols-2 gap-1.5">
            {LEAD_STATUSES.filter(
              (s) => !QUICK_STATUSES.some((q) => q.label === s.label)
            ).map((status) => {
              const active = lead.status === status.label;
              return (
                <button
                  key={status.label}
                  onClick={() => ask(status.label)}
                  disabled={pending !== null}
                  className={`flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[12px] font-medium disabled:opacity-60 ${status.badge} ${
                    active ? "ring-2 ring-gray-900 ring-offset-1" : ""
                  }`}
                >
                  {pending === status.label ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : active ? (
                    <Check className="h-3 w-3" />
                  ) : null}
                  {status.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {confirming && (
        <ConfirmDialog
          title="Confirmer le changement de statut"
          message={
            <>
              Passer <span className="font-medium text-gray-700">{lead.client}</span>{" "}
              en <span className="font-medium text-gray-700">{confirming}</span> ?
              {confirming === "Confirme" && !lead.trackingNumber && (
                <span className="mt-1.5 block text-amber-600">
                  Le colis partira aussitot chez le transporteur.
                </span>
              )}
            </>
          }
          confirmLabel="Appliquer le statut"
          pending={pending !== null}
          onConfirm={() => apply(confirming)}
          onCancel={() => setConfirming(null)}
        />
      )}

      <p className="mt-2 text-[11.5px] text-gray-400">
        Statut actuel :{" "}
        <span className="font-medium text-gray-600">{lead.status}</span>
        {lead.status === "Confirme" && !lead.trackingNumber && (
          <span className="text-amber-600">
            {" "}
            &middot; en cours d&apos;envoi chez le transporteur
          </span>
        )}
      </p>
    </div>
  );
}
