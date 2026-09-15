"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  Check,
  Loader2,
  MessageCircle,
  RotateCcw,
  Save,
} from "lucide-react";
import { LEAD_STATUSES } from "./leads-data";
import {
  PLACEHOLDERS,
  defaultTemplate,
  fillTemplate,
  type MessageOrder,
} from "@/lib/whatsapp";

/**
 * Reglage des messages WhatsApp, un par statut.
 *
 * Un apercu accompagne chaque modele : sans lui, on ecrit des champs
 * entre accolades sans jamais voir ce que le client recevra, et les
 * fautes ne se decouvrent qu'apres l'envoi.
 */

/** Commande fictive de l'apercu, aux valeurs reconnaissables. */
const SAMPLE: MessageOrder = {
  reference: "WC-452",
  client: "Youssef Alaoui",
  phone: "0617553854",
  ville: "Casablanca",
  adresse: "12 rue des Orangers",
  quartier: "Maarif",
  productName: "Coffret bijoux",
  itemCount: 2,
  amount: "199 MAD",
  trackingNumber: "F-CSA1VZ00B5V",
  deliveryDate: "2026-09-16 14:20",
};

export default function WhatsappMessagesPanel({
  isAdmin,
}: {
  isAdmin: boolean;
}) {
  const [templates, setTemplates] = useState<Record<string, string> | null>(null);
  const [openStatus, setOpenStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/whatsapp")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) setError(data.error);
        else setTemplates(data.templates ?? {});
      })
      .catch(() => {
        if (!cancelled) setError("Messages indisponibles.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Le texte en cours d'edition, ou celui propose par defaut. */
  function textOf(status: string): string {
    const own = templates?.[status];
    return own !== undefined ? own : defaultTemplate(status);
  }

  /** Un modele identique au texte propose n'a pas ete personnalise. */
  function isCustom(status: string): boolean {
    const own = templates?.[status];
    return own !== undefined && own.trim() !== defaultTemplate(status).trim();
  }

  function setText(status: string, value: string) {
    setTemplates((prev) => ({ ...(prev ?? {}), [status]: value }));
    setSaved(false);
  }

  function reset(status: string) {
    setTemplates((prev) => {
      const next = { ...(prev ?? {}) };
      delete next[status];
      return next;
    });
    setSaved(false);
  }

  async function save() {
    if (!templates) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/whatsapp", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templates }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Enregistrement refuse.");
      else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } catch {
      setError("Impossible de joindre le serveur.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="mb-1 flex items-center gap-2 text-h3 font-semibold text-gray-900">
        <MessageCircle className="h-4 w-4 text-gray-400" />
        Messages WhatsApp par statut
      </p>
      <p className="mb-4 text-[12.5px] text-gray-500">
        Le message propose dans la fiche d&apos;une commande depend de son
        statut. Les champs entre accolades sont remplaces par les
        informations de la commande.
      </p>

      <div className="mb-4 flex flex-wrap gap-1.5 rounded-lg border border-gray-100 bg-gray-50 p-2.5">
        {PLACEHOLDERS.map((field) => (
          <span
            key={field.key}
            title={field.label}
            className="rounded-md border border-gray-200 bg-white px-1.5 py-0.5 font-mono text-[11px] text-gray-600"
          >
            {`{${field.key}}`}
          </span>
        ))}
      </div>

      {error && (
        <p className="mb-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}

      {templates === null ? (
        <p className="flex items-center gap-2 py-4 text-[13px] text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Lecture des messages...
        </p>
      ) : (
        <div className="divide-y divide-gray-100 rounded-lg border border-gray-100">
          {LEAD_STATUSES.map((status) => {
            const label = status.label as string;
            const open = openStatus === label;
            return (
              <div key={label}>
                <button
                  onClick={() => setOpenStatus(open ? null : label)}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-50"
                >
                  <span
                    className={`shrink-0 rounded-md px-2 py-1 text-[11.5px] font-medium ${status.badge}`}
                  >
                    {label}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12px] text-gray-400">
                    {textOf(label).split("\n")[0]}
                  </span>
                  {isCustom(label) && (
                    <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[10.5px] font-medium text-blue-600">
                      Personnalise
                    </span>
                  )}
                </button>

                {open && (
                  <div className="space-y-2 border-t border-gray-100 bg-gray-50/60 px-3 py-3">
                    <textarea
                      value={textOf(label)}
                      onChange={(e) => setText(label, e.target.value)}
                      disabled={!isAdmin}
                      rows={7}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-[12.5px] text-gray-700 focus:border-blue-400 focus:outline-none disabled:bg-gray-100 disabled:text-gray-500"
                    />

                    <div>
                      <p className="mb-1 text-[11px] font-semibold tracking-wide text-gray-500">
                        APERCU
                      </p>
                      <p className="whitespace-pre-wrap rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-[12.5px] text-gray-700">
                        {fillTemplate(textOf(label), SAMPLE)}
                      </p>
                    </div>

                    {isAdmin && isCustom(label) && (
                      <button
                        onClick={() => reset(label)}
                        className="flex items-center gap-1.5 text-[12px] font-medium text-gray-500 hover:text-gray-700"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Revenir au texte propose
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {isAdmin ? (
        <button
          onClick={save}
          disabled={saving || templates === null}
          className={`mt-4 flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-medium text-white disabled:opacity-60 ${
            saved ? "bg-emerald-600" : "bg-gray-900 hover:bg-gray-800"
          }`}
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : saved ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          {saved ? "Enregistre" : "Enregistrer les messages"}
        </button>
      ) : (
        <p className="mt-4 text-[12px] text-gray-400">
          Seul un administrateur peut modifier ces messages.
        </p>
      )}
    </div>
  );
}
