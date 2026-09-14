"use client";

import { useEffect } from "react";
import { Loader2, X } from "lucide-react";

/**
 * Demande de confirmation avant une action qui engage.
 *
 * Un changement de statut part chez le transporteur, une suppression ne
 * se defait pas : ces deux gestes meritent une seconde d'arret. Le
 * message nomme ce qui va se passer plutot que de demander "etes-vous
 * sur ?", qui n'apprend rien a personne.
 */
export default function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger = false,
  pending = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) onCancel();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onCancel, pending]);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-xl bg-white shadow-2xl">
        <div className="flex items-start justify-between px-5 pb-2 pt-4">
          <h2 className="text-h2 font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onCancel}
            disabled={pending}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="px-5 pb-4 text-[13px] leading-relaxed text-gray-500">
          {message}
        </p>

        <div className="flex justify-end gap-2.5 px-5 pb-4">
          <button
            onClick={onCancel}
            disabled={pending}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            disabled={pending}
            autoFocus
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-medium text-white disabled:opacity-60 ${
              danger
                ? "bg-red-600 hover:bg-red-700"
                : "bg-gray-900 hover:bg-gray-800"
            }`}
          >
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
