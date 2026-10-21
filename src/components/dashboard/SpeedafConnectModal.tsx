"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Info, Loader2, Truck, X } from "lucide-react";

/**
 * Brancher Speedaf.
 *
 * Leur API ne connait ni adresse e-mail ni mot de passe : elle
 * s'authentifie avec un code application et un code client, que
 * Speedaf fournit. Les identifiants du portail ne servent qu'a les y
 * lire, et n'ont rien a faire dans l'application — c'est pour cela que
 * ce formulaire ne les demande pas.
 *
 * L'adresse d'expedition figure ici parce que Speedaf l'exige sur
 * chaque colis, contrairement a ForceLog qui connait son client
 * d'avance.
 *
 * La connexion est verifiee a l'enregistrement, en lisant leur liste
 * de regions : un code faux se voit tout de suite, pas a la premiere
 * commande confirmee.
 */

type Reglages = {
  environment: "production" | "uat";
  appCode: string;
  customerCode: string;
  platformSource: string;
  secretHint?: string;
  senderName: string;
  senderMobile: string;
  senderAddress: string;
  senderCity: string;
  senderProvince: string;
  senderDistrict: string;
  weight: number;
};

const VIDE: Reglages = {
  environment: "uat",
  appCode: "",
  customerCode: "",
  platformSource: "Orderly",
  senderName: "",
  senderMobile: "",
  senderAddress: "",
  senderCity: "",
  senderProvince: "",
  senderDistrict: "",
  weight: 0.5,
};

export default function SpeedafConnectModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState<Reglages>(VIDE);
  const [secretKey, setSecretKey] = useState("");
  const [chargement, setChargement] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultat, setResultat] = useState<{ ok: boolean; message: string } | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/api/speedaf/settings")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.error) setError(d.error);
        else if (d.settings) setForm({ ...VIDE, ...d.settings });
      })
      .catch(() => {
        if (!cancelled) setError("Reglages indisponibles.");
      })
      .finally(() => {
        if (!cancelled) setChargement(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const maj = (champ: keyof Reglages, valeur: string | number) =>
    setForm((f) => ({ ...f, [champ]: valeur }));

  async function enregistrer() {
    setSaving(true);
    setError(null);
    setResultat(null);
    try {
      const res = await fetch("/api/speedaf/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, secretKey: secretKey.trim() || undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Enregistrement refuse.");
      setSecretKey("");
      setResultat({ ok: Boolean(body.connected), message: body.message ?? "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 sm:px-4 sm:py-10">
      <div className="flex h-full w-full flex-col bg-white shadow-2xl sm:h-auto sm:max-w-lg sm:rounded-xl">
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-start gap-2.5">
            <Truck className="mt-0.5 h-4 w-4 text-gray-700" />
            <div>
              <h2 className="text-h2 font-semibold text-gray-900">
                Connecter Speedaf
              </h2>
              <p className="mt-0.5 max-w-sm text-[12.5px] text-gray-500">
                Les codes fournis par Speedaf, et l&apos;adresse d&apos;ou
                partent vos colis.
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

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:max-h-[70vh] sm:flex-none">
          <div className="flex items-start gap-2.5 rounded-lg bg-blue-50 p-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
            <p className="text-[12px] text-blue-800">
              Speedaf n&apos;utilise ni e-mail ni mot de passe pour son API :
              demandez-leur le <b>code application</b> et le <b>code client</b>
              {" "}de production, ou lisez-les dans votre portail. Le compte du
              portail reste chez vous.
            </p>
          </div>

          {chargement ? (
            <p className="flex items-center justify-center gap-2 py-8 text-[12.5px] text-gray-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Lecture des reglages...
            </p>
          ) : (
            <>
              <div>
                <label className="mb-1 block text-[12.5px] text-gray-600">
                  Environnement
                </label>
                <div className="flex gap-1.5">
                  {(["uat", "production"] as const).map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => maj("environment", e)}
                      className={`flex-1 rounded-lg border px-3 py-2 text-[12.5px] font-medium ${
                        form.environment === e
                          ? "border-blue-500 bg-blue-50 text-blue-800"
                          : "border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {e === "uat" ? "Test (UAT)" : "Production"}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-gray-400">
                  Commencez par l&apos;environnement de test : un colis cree en
                  UAT n&apos;est jamais ramasse.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Champ label="Code application (appCode) *">
                  <input
                    value={form.appCode}
                    onChange={(e) => maj("appCode", e.target.value)}
                    placeholder="MA000025"
                    className={`${champ} font-mono`}
                  />
                </Champ>
                <Champ label="Code client (customerCode) *">
                  <input
                    value={form.customerCode}
                    onChange={(e) => maj("customerCode", e.target.value)}
                    placeholder="MA000025"
                    className={`${champ} font-mono`}
                  />
                </Champ>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Champ label="Nom de plateforme">
                  <input
                    value={form.platformSource}
                    onChange={(e) => maj("platformSource", e.target.value)}
                    className={champ}
                  />
                </Champ>
                <Champ
                  label={
                    form.secretHint
                      ? `Cle de signature (${form.secretHint})`
                      : "Cle de signature"
                  }
                >
                  <input
                    type="password"
                    value={secretKey}
                    onChange={(e) => setSecretKey(e.target.value)}
                    placeholder={form.secretHint ? "Inchangee" : "secretKey"}
                    autoComplete="new-password"
                    className={`${champ} font-mono`}
                  />
                </Champ>
              </div>

              <p className="border-t border-gray-100 pt-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Expediteur &mdash; exige sur chaque colis
              </p>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Champ label="Nom *">
                  <input
                    value={form.senderName}
                    onChange={(e) => maj("senderName", e.target.value)}
                    className={champ}
                  />
                </Champ>
                <Champ label="Telephone *">
                  <input
                    value={form.senderMobile}
                    onChange={(e) => maj("senderMobile", e.target.value)}
                    placeholder="06 12 34 56 78"
                    className={champ}
                  />
                </Champ>
              </div>

              <Champ label="Adresse *">
                <input
                  value={form.senderAddress}
                  onChange={(e) => maj("senderAddress", e.target.value)}
                  className={champ}
                />
              </Champ>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Champ label="Ville *">
                  <input
                    value={form.senderCity}
                    onChange={(e) => maj("senderCity", e.target.value)}
                    className={champ}
                  />
                </Champ>
                <Champ label="Region">
                  <input
                    value={form.senderProvince}
                    onChange={(e) => maj("senderProvince", e.target.value)}
                    placeholder="Comme la ville"
                    className={champ}
                  />
                </Champ>
                <Champ label="District">
                  <input
                    value={form.senderDistrict}
                    onChange={(e) => maj("senderDistrict", e.target.value)}
                    placeholder="Comme la ville"
                    className={champ}
                  />
                </Champ>
              </div>

              <Champ label="Poids par defaut d'un colis (kg)">
                <input
                  type="number"
                  step="0.1"
                  min={0.1}
                  value={form.weight}
                  onChange={(e) => maj("weight", Number(e.target.value) || 0.5)}
                  className={`${champ} w-28`}
                />
              </Champ>

              {error && (
                <p className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {error}
                </p>
              )}

              {resultat && (
                <p
                  className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-[12.5px] ${
                    resultat.ok
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-amber-200 bg-amber-50 text-amber-800"
                  }`}
                >
                  {resultat.ok ? (
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  )}
                  {resultat.message}
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2.5 border-t border-gray-100 px-5 py-4 sm:flex-row sm:justify-end">
          <button
            onClick={onClose}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-50 sm:w-auto"
          >
            Fermer
          </button>
          <button
            onClick={() => void enregistrer()}
            disabled={saving || chargement}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-gray-800 disabled:opacity-40 sm:w-auto"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Enregistrer et tester
          </button>
        </div>
      </div>
    </div>
  );
}

const champ =
  "w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none";

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
