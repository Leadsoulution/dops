"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Loader2,
  RefreshCw,
  Sheet,
  X,
} from "lucide-react";
import type { Integration } from "./integrations-data";

/**
 * Connexion de la feuille de sauvegarde.
 *
 * L'application ecrit tout dans la feuille ; seule la colonne "Statut de
 * confirmation" fait le chemin inverse. L'ecran le dit, parce que c'est
 * la question que se pose toute personne qui modifiera la feuille.
 */
export default function GoogleSheetsConnectModal({
  integration,
  onClose,
}: {
  integration: Integration;
  onClose: () => void;
}) {
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [sheetName, setSheetName] = useState("Orderly");
  const [serviceAccount, setServiceAccount] = useState("");
  const [current, setCurrent] = useState<{
    spreadsheetId: string;
    sheetName: string;
    serviceAccountEmail: string;
    configured: boolean;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/sheets/settings")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || data.error) return;
        setCurrent(data);
        setSpreadsheetId(data.spreadsheetId ?? "");
        setSheetName(data.sheetName || "Orderly");
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
      const res = await fetch("/api/sheets/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spreadsheetId, sheetName, serviceAccount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.connected) {
        setSuccess(`Feuille "${data.title}" connectee.`);
        setServiceAccount("");
      } else {
        setError(data.error ?? "Connexion impossible.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  async function sync() {
    setError(null);
    setSuccess(null);
    setSyncing(true);
    try {
      const res = await fetch("/api/sheets/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess(
        `${data.ecrites} commande(s) ecrite(s), ${data.statutsRepris} statut(s) repris de la feuille.` +
          (data.ignores?.length
            ? ` Ignore : ${data.ignores.join(", ")}`
            : "")
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Synchronisation impossible.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-10">
      <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-start gap-2.5">
            <Sheet className="mt-0.5 h-4 w-4 text-emerald-600" />
            <div>
              <h2 className="text-h2 font-semibold text-gray-900">
                Connecter {integration.name}
              </h2>
              <p className="mt-0.5 text-[12.5px] text-gray-500">
                Une copie de vos commandes, tenue a jour.
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
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5">
            <p className="text-[12px] font-medium text-blue-800">
              Dans quel sens ca circule
            </p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-blue-700">
              L&apos;application ecrit tout dans la feuille. Seule la colonne
              <span className="font-medium"> Statut de confirmation </span>
              revient vers l&apos;application : modifiez-la dans la feuille, la
              commande suivra. Le reste y serait ecrase a la prochaine
              synchronisation.
            </p>
          </div>

          {current?.serviceAccountEmail && (
            <div className="rounded-lg border border-gray-200 px-3 py-2.5">
              <p className="text-[12px] font-medium text-gray-700">
                Partagez la feuille avec ce compte, en droit Editeur
              </p>
              <div className="mt-1.5 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-gray-100 px-2 py-1 font-mono text-[11px] text-gray-700">
                  {current.serviceAccountEmail}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(current.serviceAccountEmail);
                    setCopied(true);
                  }}
                  className="flex shrink-0 items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-[11.5px] font-medium text-gray-600 hover:bg-gray-50"
                >
                  <Copy className="h-3 w-3" />
                  {copied ? "Copie" : "Copier"}
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-[12.5px] text-gray-600">
              Feuille Google
            </label>
            <input
              type="text"
              value={spreadsheetId}
              onChange={(e) => setSpreadsheetId(e.target.value)}
              placeholder="Collez l'adresse de la feuille"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none"
            />
            <p className="mt-1 text-[11.5px] text-gray-400">
              L&apos;adresse complete ou seulement l&apos;identifiant.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-[12.5px] text-gray-600">
              Onglet
            </label>
            <input
              type="text"
              value={sheetName}
              onChange={(e) => setSheetName(e.target.value)}
              placeholder="Orderly"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none"
            />
            <p className="mt-1 text-[11.5px] text-amber-600">
              Cet onglet est entierement reecrit a chaque synchronisation.
              Choisissez-en un qui n&apos;a pas d&apos;autres donnees.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-[12.5px] text-gray-600">
              Compte de service (JSON)
            </label>
            <textarea
              value={serviceAccount}
              onChange={(e) => setServiceAccount(e.target.value)}
              rows={3}
              placeholder={
                current?.configured
                  ? "Deja enregistre. Laissez vide pour le garder."
                  : "Collez le fichier JSON telecharge depuis Google Cloud"
              }
              className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 font-mono text-[11.5px] text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none"
            />
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

        <div className="flex flex-wrap justify-end gap-2.5 border-t border-gray-100 px-5 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-50"
          >
            Fermer
          </button>
          {current?.configured && (
            <button
              onClick={sync}
              disabled={syncing || saving}
              className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              {syncing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Synchroniser maintenant
            </button>
          )}
          <button
            onClick={submit}
            disabled={saving || syncing}
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
