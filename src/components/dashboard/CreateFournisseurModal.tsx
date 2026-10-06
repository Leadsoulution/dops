"use client";

import { useState } from "react";
import { AlertCircle, Building2, Info, Loader2, X } from "lucide-react";

/**
 * Creation d'un fournisseur.
 *
 * Le formulaire ne demande que ce qui s'enregistre. Il portait
 * auparavant un delai de paiement et une liste de produits a cocher
 * qui n'allaient nulle part : les produits se rattachent par les
 * achats, un a un, parce que c'est l'achat qui porte la quantite et le
 * prix. Cocher un produit ici n'aurait rien appris de plus que son
 * nom.
 */
export default function CreateFournisseurModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, contactName, phone, email, city, note }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Creation refusee.");
      onSaved();
      onClose();
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
            <Building2 className="mt-0.5 h-4 w-4 text-gray-700" />
            <h2 className="text-h2 font-semibold text-gray-900">
              Nouveau fournisseur
            </h2>
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
            <div>
              <p className="text-[13px] font-medium text-blue-900">
                Coordonnees du fournisseur
              </p>
              <p className="text-[12px] text-blue-700">
                Les produits et les montants viendront de ses achats, saisis
                ensuite depuis sa fiche.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Champ label="Nom de l'entreprise *">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Guangzhou Trading Co."
                className={champStyle}
              />
            </Champ>
            <Champ label="Nom du contact">
              <input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Ex: Li Wei"
                className={champStyle}
              />
            </Champ>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Champ label="Telephone">
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="06 12 34 56 78"
                className={champStyle}
              />
            </Champ>
            <Champ label="Email">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contact@fournisseur.ma"
                className={champStyle}
              />
            </Champ>
          </div>

          <Champ label="Ville">
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Casablanca"
              className={champStyle}
            />
          </Champ>

          <Champ label="Note">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Prioriser les livraisons du matin."
              rows={3}
              className={`${champStyle} resize-none`}
            />
          </Champ>

          {error && (
            <p className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2.5 border-t border-gray-100 px-5 py-4 sm:flex-row sm:justify-end">
          <button
            onClick={onClose}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-50 sm:w-auto"
          >
            Annuler
          </button>
          <button
            onClick={() => void save()}
            disabled={saving || !name.trim()}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-gray-800 disabled:opacity-40 sm:w-auto"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Building2 className="h-3.5 w-3.5" />
            )}
            Creer le fournisseur
          </button>
        </div>
      </div>
    </div>
  );
}

const champStyle =
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
