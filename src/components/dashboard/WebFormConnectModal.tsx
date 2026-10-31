"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  Code2,
  Copy,
  Loader2,
  RotateCcw,
  X,
} from "lucide-react";

/**
 * Brancher un site fait a la main.
 *
 * Celui qui arrive ici a une page HTML et un formulaire, pas une
 * boutique. On ne lui demande donc rien a installer : une adresse,
 * une cle, et un bout de code pret a coller. Le code est donne en
 * entier plutot qu'explique — un exemple qui marche vaut mieux
 * qu'une documentation a interpreter.
 */

type Reglages = { token: string; origin: string };

function Ligne({
  label,
  valeur,
  aide,
}: {
  label: string;
  valeur: string;
  aide?: string;
}) {
  const [copie, setCopie] = useState(false);
  return (
    <div>
      <label className="mb-1 block text-[12.5px] text-gray-600">{label}</label>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-[11.5px] text-gray-700">
          {valeur || "—"}
        </code>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(valeur);
            setCopie(true);
            setTimeout(() => setCopie(false), 1500);
          }}
          disabled={!valeur}
          className="flex shrink-0 items-center gap-1 rounded-md border border-gray-300 px-2.5 py-2 text-[11.5px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
        >
          <Copy className="h-3 w-3" />
          {copie ? "Copie" : "Copier"}
        </button>
      </div>
      {aide && <p className="mt-1 text-[11px] text-gray-400">{aide}</p>}
    </div>
  );
}

function extrait(url: string, token: string): string {
  return `<form id="commande">
  <input name="nom" placeholder="Nom complet" required>
  <input name="telephone" placeholder="Telephone" required>
  <input name="ville" placeholder="Ville">
  <input name="adresse" placeholder="Adresse">
  <input name="produit" value="Nom du produit" type="hidden">
  <input name="prix" value="299" type="hidden">
  <button type="submit">Commander</button>
</form>

<script>
document.getElementById("commande").addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));
  const r = await fetch("${url}", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Orderly-Key": "${token || "VOTRE_CLE"}" },
    body: JSON.stringify(data),
  });
  const res = await r.json();
  if (res.ok) {
    window.location.href = "/merci.html";
  } else {
    alert("Erreur : " + res.error);
  }
});
</script>`;
}

export default function WebFormConnectModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const [reglages, setReglages] = useState<Reglages | null>(null);
  const [origin, setOrigin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copieCode, setCopieCode] = useState(false);

  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/forms/order`
      : "/api/forms/order";

  useEffect(() => {
    let annule = false;
    fetch("/api/forms/settings")
      .then((r) => r.json())
      .then((d) => {
        if (annule) return;
        if (d.error) setError(d.error);
        else {
          setReglages(d.settings);
          setOrigin(d.settings.origin ?? "");
        }
      })
      .catch(() => setError("Lecture impossible."));
    return () => {
      annule = true;
    };
  }, []);

  async function envoyer(corps: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/forms/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corps),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setReglages(d.settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Echec.");
    } finally {
      setBusy(false);
    }
  }

  const code = extrait(url, reglages?.token ?? "");

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 sm:px-4 sm:py-10">
      <div className="flex h-full w-full flex-col bg-white shadow-2xl sm:h-auto sm:max-w-2xl sm:rounded-xl">
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-h2 font-semibold text-gray-900">
              Connecter un site web
            </h2>
            <p className="mt-0.5 max-w-lg text-[12.5px] text-gray-500">
              Pour une page HTML ecrite a la main : chaque formulaire envoye
              cree une commande dans Orderly, avec le nom, le telephone, la
              ville, l&apos;adresse et le montant.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {error && (
            <p className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}

          {!reglages ? (
            <p className="flex items-center justify-center gap-2 py-10 text-[13px] text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Lecture...
            </p>
          ) : (
            <>
              <Ligne
                label="1. Adresse ou envoyer les commandes"
                valeur={url}
                aide="Votre site poste ici, en JSON ou en formulaire."
              />

              <div>
                <Ligne
                  label="2. Cle du site"
                  valeur={reglages.token}
                  aide="Elle sera visible dans le code de votre page : c'est normal, elle empeche seulement une adresse publique de recevoir les commandes de tout internet."
                />
                <button
                  onClick={() => void envoyer({ action: "rotate" })}
                  disabled={busy}
                  className="mt-1.5 flex items-center gap-1.5 text-[12px] text-gray-500 hover:text-gray-700 disabled:opacity-50"
                >
                  <RotateCcw className="h-3 w-3" />
                  {reglages.token
                    ? "Creer une nouvelle cle"
                    : "Generer la cle"}
                </button>
                {reglages.token && (
                  <p className="mt-1 text-[11px] text-amber-700">
                    Une nouvelle cle arrete l&apos;ancienne : le site cesse
                    d&apos;envoyer tant que vous ne l&apos;avez pas recollee.
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-[12.5px] text-gray-600">
                  3. Adresse de votre site (recommande)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    value={origin}
                    onChange={(e) => setOrigin(e.target.value)}
                    placeholder="https://loora.ma"
                    className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-800 focus:border-blue-400 focus:outline-none"
                  />
                  <button
                    onClick={() => void envoyer({ origin })}
                    disabled={busy}
                    className="shrink-0 rounded-lg bg-gray-900 px-3 py-2 text-[12.5px] font-medium text-white hover:bg-gray-800 disabled:opacity-60"
                  >
                    Enregistrer
                  </button>
                </div>
                {/*
                  C'est le vrai verrou : le navigateur pose lui-meme
                  l'origine et ne laisse pas une page la falsifier,
                  alors que la cle se lit dans le code source.
                */}
                <p className="mt-1 text-[11px] text-gray-400">
                  Renseignee, seules les commandes venues de ce site sont
                  acceptees. C&apos;est la protection la plus solide : un
                  navigateur ne laisse pas une autre page se faire passer
                  pour la votre. Laissez vide si vous envoyez depuis un
                  serveur.
                </p>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-[12.5px] text-gray-600">
                    <Code2 className="h-3.5 w-3.5 text-gray-400" />
                    4. Le code a coller dans votre page
                  </label>
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(code);
                      setCopieCode(true);
                      setTimeout(() => setCopieCode(false), 1500);
                    }}
                    className="flex items-center gap-1 rounded-md border border-gray-300 px-2.5 py-1 text-[11.5px] font-medium text-gray-600 hover:bg-gray-50"
                  >
                    <Copy className="h-3 w-3" />
                    {copieCode ? "Copie" : "Copier le code"}
                  </button>
                </div>
                <pre className="max-h-64 overflow-auto rounded-lg border border-gray-200 bg-gray-900 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-gray-100">
                  {code}
                </pre>
                <p className="mt-1 text-[11px] text-gray-400">
                  Les noms de champs sont libres : nom ou name, telephone ou
                  phone, ville ou city, prix ou total. Seuls le nom et le
                  telephone sont obligatoires.
                </p>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end border-t border-gray-100 px-5 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-50"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
