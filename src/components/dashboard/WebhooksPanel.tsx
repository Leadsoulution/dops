"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  Check,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  Plug,
  Send,
  Trash2,
} from "lucide-react";
import Switch from "./Switch";

/**
 * Abonnements sortants vers n8n.
 *
 * Un webhook se regle une fois puis s'oublie — c'est justement le
 * danger : s'il cesse de partir, personne ne s'en apercoit avant que
 * les clients cessent de recevoir leurs messages. L'ecran montre donc
 * en permanence la date du dernier envoi reussi et la derniere erreur.
 */

type Webhook = {
  id: string;
  name: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
  last_success_at: string | null;
  last_error: string | null;
  created_at: string;
};

const LIBELLES: Record<string, string> = {
  "lead.created": "Nouvelle commande",
  "lead.status_changed": "Statut de confirmation change",
  "lead.delivery_status_changed": "Statut de livraison change",
};

function quand(iso: string | null): string {
  if (!iso) return "jamais";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Casablanca",
  }).format(new Date(iso));
}

export default function WebhooksPanel({ isAdmin }: { isAdmin: boolean }) {
  const [hooks, setHooks] = useState<Webhook[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("n8n");
  const [busy, setBusy] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [essai, setEssai] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    fetch("/api/webhooks")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.error) setError(d.error);
        else setHooks(d.webhooks ?? []);
      })
      .catch(() => {
        if (!cancelled) setError("Abonnements indisponibles.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function recharge() {
    const d = await fetch("/api/webhooks").then((r) => r.json());
    if (!d.error) setHooks(d.webhooks ?? []);
  }

  async function ajoute() {
    setBusy("ajout");
    setError(null);
    try {
      const res = await fetch("/api/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, url, events: [] }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Ajout refuse.");
      setUrl("");
      // Le secret ne s'affiche nulle part ailleurs : on ouvre la
      // nouvelle ligne pour qu'il soit copie tout de suite.
      setRevealed(d.webhook.id);
      await recharge();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inattendue.");
    } finally {
      setBusy(null);
    }
  }

  async function bascule(hook: Webhook) {
    setBusy(hook.id);
    try {
      await fetch(`/api/webhooks/${hook.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !hook.active }),
      });
      await recharge();
    } finally {
      setBusy(null);
    }
  }

  async function supprime(hook: Webhook) {
    setBusy(hook.id);
    setError(null);
    try {
      const res = await fetch(`/api/webhooks/${hook.id}`, { method: "DELETE" });
      if (!res.ok) setError((await res.json()).error);
      await recharge();
    } finally {
      setBusy(null);
    }
  }

  async function teste(hook: Webhook) {
    setBusy(hook.id);
    setEssai((p) => ({ ...p, [hook.id]: "" }));
    try {
      const res = await fetch(`/api/webhooks/${hook.id}/test`, { method: "POST" });
      const d = await res.json();
      setEssai((p) => ({
        ...p,
        [hook.id]: d.ok
          ? `Recu par n8n (HTTP ${d.httpStatus}).`
          : `Echec : ${d.error ?? "HTTP " + d.httpStatus}`,
      }));
      await recharge();
    } catch {
      setEssai((p) => ({ ...p, [hook.id]: "Echec : serveur injoignable." }));
    } finally {
      setBusy(null);
    }
  }

  function copie(texte: string, cle: string) {
    void navigator.clipboard.writeText(texte).then(() => {
      setCopied(cle);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="mb-1 flex items-center gap-2 text-h3 font-semibold text-gray-900">
        <Plug className="h-4 w-4 text-gray-400" />
        Webhooks — n8n et autres outils
      </p>
      <p className="mb-4 text-[12.5px] text-gray-500">
        L&apos;application appelle votre adresse des qu&apos;une commande bouge,
        avec le nom, le telephone, l&apos;adresse et les statuts du client.
      </p>

      {error && (
        <p className="mb-3 flex items-start gap-2 rounded-lg border-2 border-red-300 bg-red-50 px-3 py-2.5 text-[12.5px] font-medium text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      {isAdmin && (
        <div className="mb-4 rounded-lg border border-gray-200 p-3">
          <p className="mb-2 text-[12px] font-semibold tracking-wide text-gray-500">
            AJOUTER UNE ADRESSE
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nom"
              className="w-full rounded-lg border border-gray-300 px-2.5 py-2 text-[12.5px] sm:w-32"
            />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://votre-n8n.com/webhook/..."
              className="min-w-0 flex-1 rounded-lg border border-gray-300 px-2.5 py-2 font-mono text-[12.5px]"
            />
            <button
              onClick={() => void ajoute()}
              disabled={busy !== null || !url.trim()}
              className="flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-gray-900 px-3.5 py-2 text-[12.5px] font-medium text-white hover:bg-gray-800 disabled:opacity-60"
            >
              {busy === "ajout" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Ajouter
            </button>
          </div>
          <p className="mt-1.5 text-[11.5px] text-gray-400">
            Adresse en <span className="font-mono">https</span> obligatoire : elle
            transporte les coordonnees de vos clients.
          </p>
        </div>
      )}

      {!hooks && !error && (
        <p className="flex items-center gap-2 py-6 text-[12.5px] text-gray-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Chargement...
        </p>
      )}

      {hooks?.length === 0 && (
        <p className="py-6 text-center text-[12.5px] text-gray-400">
          Aucun abonnement. Collez l&apos;adresse de votre webhook n8n ci-dessus.
        </p>
      )}

      <div className="space-y-2.5">
        {(hooks ?? []).map((h) => (
          <div key={h.id} className="rounded-lg border border-gray-200 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-gray-800">{h.name}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  h.active
                    ? "bg-emerald-50 text-emerald-600"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {h.active ? "Actif" : "Suspendu"}
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-gray-500">
                {h.url}
              </span>
              {isAdmin && (
                <Switch checked={h.active} onChange={() => void bascule(h)} />
              )}
            </div>

            <div className="mt-2 grid grid-cols-1 gap-1 text-[11.5px] sm:grid-cols-2">
              <p className="text-gray-500">
                Dernier envoi reussi :{" "}
                <span className={h.last_success_at ? "text-emerald-700" : "text-gray-400"}>
                  {quand(h.last_success_at)}
                </span>
              </p>
              <p className="text-gray-500">
                Evenements :{" "}
                <span className="text-gray-700">
                  {h.events.length === 0
                    ? "tous"
                    : h.events.map((e) => LIBELLES[e] ?? e).join(", ")}
                </span>
              </p>
            </div>

            {h.last_error && (
              <p className="mt-1.5 rounded-md bg-red-50 px-2 py-1 text-[11.5px] text-red-700">
                Derniere erreur : {h.last_error}
              </p>
            )}

            {essai[h.id] && (
              <p
                className={`mt-1.5 rounded-md px-2 py-1 text-[11.5px] ${
                  essai[h.id].startsWith("Recu")
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-red-50 text-red-700"
                }`}
              >
                {essai[h.id]}
              </p>
            )}

            {isAdmin && (
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => void teste(h)}
                  disabled={busy === h.id}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5 text-[12px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                  {busy === h.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  Envoyer un essai
                </button>

                <button
                  onClick={() => setRevealed(revealed === h.id ? null : h.id)}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5 text-[12px] font-medium text-gray-700 hover:bg-gray-50"
                >
                  {revealed === h.id ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                  Cle de signature
                </button>

                <button
                  onClick={() => void supprime(h)}
                  disabled={busy === h.id}
                  className="ml-auto flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Retirer
                </button>
              </div>
            )}

            {revealed === h.id && (
              <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-2.5">
                <p className="mb-1 text-[11.5px] text-gray-500">
                  A coller dans n8n pour verifier que l&apos;appel vient bien de
                  vous. Elle voyage dans l&apos;en-tete{" "}
                  <span className="font-mono">X-Dops-Signature</span>.
                </p>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-gray-700">
                    {h.secret}
                  </code>
                  <button
                    onClick={() => copie(h.secret, h.id)}
                    className="flex shrink-0 items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-[11.5px] text-gray-600 hover:bg-gray-50"
                  >
                    {copied === h.id ? (
                      <Check className="h-3 w-3 text-emerald-600" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                    Copier
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {!isAdmin && (
        <p className="mt-3 text-[12px] text-gray-400">
          Seul un administrateur peut gerer les abonnements.
        </p>
      )}
    </div>
  );
}
