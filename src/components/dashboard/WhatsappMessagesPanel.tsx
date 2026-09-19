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
import { LEAD_STATUSES, deliveryStatusStyles } from "./leads-data";
import {
  DELIVERY_PREFIX,
  DELIVERY_STATUSES,
  PLACEHOLDERS,
  fillTemplate,
  templateFor,
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
  productImage: "https://exemple.ma/photo-produit.jpg",
};

/**
 * Brouillon local des messages.
 *
 * Il ne remplace pas l'enregistrement : il evite seulement qu'un texte
 * ecrit disparaisse quand l'enregistrement echoue. Range par navigateur,
 * il ne concerne que la personne qui a ecrit.
 */
const DRAFT_KEY = "whatsapp-messages-brouillon";

function readDraft(): Record<string, string> | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : null;
  } catch {
    return null;
  }
}

function writeDraft(templates: Record<string, string>) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(templates));
  } catch {
    // Stockage plein ou refuse : le brouillon est un filet, pas un du.
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Rien a faire : le prochain enregistrement le remplacera.
  }
}

export default function WhatsappMessagesPanel({
  isAdmin,
}: {
  isAdmin: boolean;
}) {
  const [templates, setTemplates] = useState<Record<string, string> | null>(null);
  /** Modifications non enregistrees, retrouvees au chargement. */
  const [restored, setRestored] = useState(false);
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
        if (data.error) {
          setError(data.error);
          return;
        }
        const serveur: Record<string, string> = data.templates ?? {};

        // Un texte ecrit puis perdu ne se retrouve nulle part : le
        // brouillon local le rend quand l'enregistrement n'a pas about
        // — session expiree, reseau coupe, onglet ferme trop vite.
        const brouillon = readDraft();
        const differe =
          brouillon &&
          Object.keys(brouillon).some((k) => brouillon[k] !== serveur[k]);
        setTemplates(differe ? { ...serveur, ...brouillon } : serveur);
        setRestored(Boolean(differe));
      })
      .catch(() => {
        if (!cancelled) setError("Messages indisponibles.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Le texte en cours d'edition, ou celui propose par defaut. */
  function textOf(key: string): string {
    const own = templates?.[key];
    return own !== undefined ? own : templateFor(key, undefined);
  }

  /** Un modele identique au texte propose n'a pas ete personnalise. */
  function isCustom(key: string): boolean {
    const own = templates?.[key];
    return (
      own !== undefined &&
      own.trim() !== templateFor(key, undefined).trim()
    );
  }

  /**
   * Les deux familles de messages.
   *
   * Avant l'expedition, on parle de la commande : c'est le statut de
   * confirmation qui commande. Une fois le colis parti, le client n'a
   * plus rien a confirmer et veut savoir ou il en est : c'est le statut
   * du transporteur qui prend le relais.
   */
  const groupes = [
    {
      titre: "Avant l'expedition — statut de confirmation",
      aide: "Utilise tant que la commande n'est pas partie chez le transporteur.",
      entrees: LEAD_STATUSES.map((s) => ({
        key: s.label as string,
        label: s.label as string,
        badge: s.badge as string,
      })),
    },
    {
      titre: "Apres l'expedition — statut de livraison",
      aide: "Prend le relais des que le colis est chez le transporteur.",
      entrees: DELIVERY_STATUSES.map((s) => ({
        key: DELIVERY_PREFIX + s.code,
        label: s.label,
        badge: deliveryStatusStyles[s.code] ?? "bg-gray-100 text-gray-600",
      })),
    },
  ];

  function setText(status: string, value: string) {
    setTemplates((prev) => {
      const next = { ...(prev ?? {}), [status]: value };
      writeDraft(next);
      return next;
    });
    setSaved(false);
  }

  function reset(status: string) {
    setTemplates((prev) => {
      const next = { ...(prev ?? {}) };
      delete next[status];
      writeDraft(next);
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

      // Une reponse qui n'est pas du JSON est une panne d'hebergement,
      // pas un refus applicatif : la lire comme du JSON masquait tout
      // derriere un "Impossible de joindre le serveur".
      let data: { error?: string } = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }

      if (!res.ok) {
        // Le cas le plus frequent, et le plus trompeur : la lecture a
        // reussi au chargement de la page, l'ecriture arrive longtemps
        // apres et la session n'est plus valable. Le texte semblait
        // enregistre, et revenait a l'ancien au rechargement.
        if (res.status === 401) {
          setError(
            "Votre session a expire : rien n'a ete enregistre. Reconnectez-vous dans un autre onglet, puis revenez cliquer sur Enregistrer — votre texte est conserve ici."
          );
        } else if (res.status === 403) {
          setError(
            "Seul un administrateur peut modifier ces messages. Rien n'a ete enregistre."
          );
        } else {
          setError(
            `Enregistrement refuse (erreur ${res.status}). ${data.error ?? ""}`.trim()
          );
        }
        return;
      }

      // Verification : on relit ce que le serveur a reellement garde.
      // Sans elle, un filtrage silencieux cote serveur laissait croire
      // a un enregistrement reussi.
      const relu = await fetch("/api/settings/whatsapp")
        .then((r) => r.json())
        .then((d) => (d.templates ?? {}) as Record<string, string>)
        .catch(() => null);

      const manquants = relu
        ? Object.keys(templates).filter(
            (k) => templates[k].trim() && relu[k] !== templates[k]
          )
        : [];

      if (manquants.length > 0) {
        setError(
          `Le serveur n'a pas garde ${manquants.length} message(s) : ${manquants.join(", ")}.`
        );
        return;
      }

      clearDraft();
      setRestored(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError(
        "Impossible de joindre le serveur : rien n'a ete enregistre. Votre texte est conserve ici."
      );
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

      {/*
        L'echec doit se voir. Auparavant une ligne fine tout en haut
        annoncait le refus, loin du bouton et du texte : on croyait avoir
        enregistre, et le rechargement ramenait l'ancien message.
      */}
      {error && (
        <p className="mb-3 flex items-start gap-2 rounded-lg border-2 border-red-300 bg-red-50 px-3 py-2.5 text-[12.5px] font-medium text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      {restored && !error && (
        <p className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-[12.5px] text-amber-800">
          Des modifications n&apos;avaient pas ete enregistrees : elles sont
          retablies ci-dessous. Cliquez sur Enregistrer pour les garder.
        </p>
      )}

      {templates === null ? (
        <p className="flex items-center gap-2 py-4 text-[13px] text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Lecture des messages...
        </p>
      ) : (
        <div className="space-y-4">
          {groupes.map((groupe) => (
            <div key={groupe.titre}>
              <p className="text-[12px] font-semibold text-gray-700">
                {groupe.titre}
              </p>
              <p className="mb-1.5 text-[11.5px] text-gray-400">{groupe.aide}</p>

              <div className="divide-y divide-gray-100 rounded-lg border border-gray-100">
                {groupe.entrees.map((entree) => {
                  const open = openStatus === entree.key;
                  return (
                    <div key={entree.key}>
                      <button
                        onClick={() => setOpenStatus(open ? null : entree.key)}
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-50"
                      >
                        <span
                          className={`shrink-0 rounded-md px-2 py-1 text-[11.5px] font-medium ${entree.badge}`}
                        >
                          {entree.label}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[12px] text-gray-400">
                          {textOf(entree.key).split("\n")[0]}
                        </span>
                        {isCustom(entree.key) && (
                          <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[10.5px] font-medium text-blue-600">
                            Personnalise
                          </span>
                        )}
                      </button>

                      {open && (
                        <div className="space-y-2 border-t border-gray-100 bg-gray-50/60 px-3 py-3">
                          <textarea
                            value={textOf(entree.key)}
                            onChange={(e) => setText(entree.key, e.target.value)}
                            disabled={!isAdmin}
                            rows={7}
                            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-[12.5px] text-gray-700 focus:border-blue-400 focus:outline-none disabled:bg-gray-100 disabled:text-gray-500"
                          />

                          <div>
                            <p className="mb-1 text-[11px] font-semibold tracking-wide text-gray-500">
                              APERCU
                            </p>
                            <p className="whitespace-pre-wrap rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-[12.5px] text-gray-700">
                              {fillTemplate(textOf(entree.key), SAMPLE)}
                            </p>
                          </div>

                          {isAdmin && isCustom(entree.key) && (
                            <button
                              onClick={() => reset(entree.key)}
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
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="mt-4 flex items-start gap-2 rounded-lg border-2 border-red-300 bg-red-50 px-3 py-2.5 text-[12.5px] font-medium text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
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
