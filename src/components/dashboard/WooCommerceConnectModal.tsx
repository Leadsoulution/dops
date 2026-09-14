"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, Store, X } from "lucide-react";
import type { Integration } from "./integrations-data";

/**
 * Connexion d'une boutique WooCommerce depuis l'application.
 *
 * Les identifiants partent au serveur et n'en reviennent que masques :
 * le navigateur n'a aucune raison de detenir une cle secrete.
 */
export default function WooCommerceConnectModal({
  integration,
  onClose,
  onConnected,
}: {
  integration: Integration;
  onClose: () => void;
  onConnected?: () => void;
}) {
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [secret, setSecret] = useState("");
  const [current, setCurrent] = useState<{
    url: string;
    key: string;
    secret: string;
    configured: boolean;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/woocommerce/settings")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || data.error) return;
        setCurrent(data);
        setUrl(data.url ?? "");
      })
      .catch(() => {
        /* Le formulaire s'ouvre vide, c'est utilisable. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit() {
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      const res = await fetch("/api/woocommerce/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, key, secret }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (data.connected) {
        setSuccess("Boutique connectee. Les produits peuvent etre importes.");
        setKey("");
        setSecret("");
        onConnected?.();
      } else {
        setError(data.error ?? "Connexion impossible.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-10">
      <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-start gap-2.5">
            <Store className="mt-0.5 h-4 w-4 text-violet-600" />
            <div>
              <h2 className="text-h2 font-semibold text-gray-900">
                Connecter {integration.name}
              </h2>
              <p className="mt-0.5 text-[12.5px] text-gray-500">
                Vos commandes et vos produits, importes automatiquement.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          {current?.configured && (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2.5">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
              <div className="min-w-0 text-[12.5px] text-emerald-700">
                <p className="font-medium">Une boutique est deja connectee</p>
                <p className="truncate font-mono text-[11.5px]">{current.url}</p>
                <p className="font-mono text-[11.5px]">
                  cle {current.key} &middot; secret {current.secret}
                </p>
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-[12.5px] text-gray-600">
              Adresse de la boutique
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://maboutique.ma"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none"
            />
            <p className="mt-1 text-[11.5px] text-gray-400">
              Sans /wp-admin ni /wp-json a la fin.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-[12.5px] text-gray-600">
              Cle client (Consumer key)
            </label>
            <input
              type="text"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="ck_..."
              className="w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-[13px] text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-[12.5px] text-gray-600">
              Cle secrete (Consumer secret)
            </label>
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="cs_..."
              className="w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-[13px] text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none"
            />
          </div>

          <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
            <p className="text-[12px] font-medium text-gray-700">
              Ou trouver ces cles
            </p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-gray-500">
              Dans WordPress : WooCommerce &rsaquo; Reglages &rsaquo; Avance
              &rsaquo; REST API &rsaquo; Creer une cle, avec les droits
              <span className="font-medium"> Lecture/Ecriture</span>.
            </p>
            {url && (
              <a
                href={`${url.replace(/\/+$/, "")}/wp-admin/admin.php?page=wc-settings&tab=advanced&section=keys`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 inline-flex items-center gap-1 text-[11.5px] font-medium text-blue-600 hover:underline"
              >
                Ouvrir cette page sur ma boutique
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          {error && (
            <p className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}

          {success && (
            <p className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12.5px] text-emerald-700">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {success}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2.5 border-t border-gray-100 px-5 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-50"
          >
            Fermer
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-gray-800 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Connecter et tester
          </button>
        </div>
      </div>
    </div>
  );
}
