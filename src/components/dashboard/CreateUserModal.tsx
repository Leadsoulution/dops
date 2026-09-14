"use client";

import { useState } from "react";
import { AlertCircle, Loader2, X } from "lucide-react";
import Toggle from "./Toggle";
import SelectDropdown from "./SelectDropdown";
import { avatarColors, roleOptions, type TeamMember } from "./users-data";
import SectionAccessPicker from "./SectionAccessPicker";
import { ALL_SECTION_KEYS, DEFAULT_AGENT_SECTIONS, effectiveAccess } from "@/lib/access";

export default function CreateUserModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (user: TeamMember) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("Agent");
  const [suiviLivraison, setSuiviLivraison] = useState(false);
  const [importsExcel, setImportsExcel] = useState(false);
  const [creationProspects, setCreationProspects] = useState(false);
  const [active, setActive] = useState(true);
  const [pageAccess, setPageAccess] = useState<string[]>(DEFAULT_AGENT_SECTIONS);

  // Passer un compte en administrateur ouvre tout par defaut ; il reste
  // libre de decocher ce qu'il ne veut pas voir.
  function changeRole(next: string) {
    setRole(next);
    if (next === "Admin" && pageAccess.length <= DEFAULT_AGENT_SECTIONS.length) {
      setPageAccess([...ALL_SECTION_KEYS]);
    }
  }
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setError(null);
    if (!name.trim() || !email.trim()) {
      setError("Le nom et l'email sont obligatoires.");
      return;
    }
    if (password.length < 8) {
      setError("Le mot de passe doit faire au moins 8 caracteres.");
      return;
    }

    setPending(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          password,
          role,
          status: active ? "Actif" : "Inactif",
          // Une couleur d'avatar au hasard, pour distinguer les initiales
          // d'un coup d'oeil dans la liste.
          avatarColor: avatarColors[Math.floor(Math.random() * avatarColors.length)],
          permissions: { suiviLivraison, importsExcel, creationProspects },
          pageAccess: effectiveAccess({ role, pageAccess }),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onCreated(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Creation impossible.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 sm:px-4 sm:py-10">
      <div className="flex h-full w-full flex-col bg-white shadow-2xl sm:h-auto sm:max-w-sm sm:rounded-xl">
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-h2 font-semibold text-gray-900">
            Ajouter un utilisateur
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          <div>
            <label className="mb-1 block text-[12.5px] text-gray-600">
              Nom complet
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Fatima Zahra Benali"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-[12.5px] text-gray-600">
              Adresse email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Ex: nom.prenom@orderly.host"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none"
            />
            <p className="mt-1 text-[11.5px] text-gray-400">
              C&apos;est l&apos;identifiant de connexion.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-[12.5px] text-gray-600">
              Telephone
            </label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+212 6 12 34 56 78"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-[12.5px] text-gray-600">Role</label>
            <SelectDropdown
              variant="field"
              pinnedLabel={role}
              options={roleOptions}
              value={role}
              onSelect={changeRole}
            />
          </div>

          <div>
            <label className="mb-1 block text-[12.5px] text-gray-600">
              Mot de passe temporaire
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 8 caracteres"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none"
            />
            <p className="mt-1 text-[11.5px] text-gray-400">
              A transmettre a la personne : elle se connecte avec.
            </p>
          </div>

          <SectionAccessPicker
            role={role}
            value={pageAccess}
            onChange={setPageAccess}
          />

          <div className="rounded-lg border border-teal-100 bg-teal-50 px-3">
            <Toggle
              checked={suiviLivraison}
              onChange={() => setSuiviLivraison((v) => !v)}
              label="Acces suivi livraison"
              description="Autoriser cet agent a modifier les statuts livraison des commandes apres expedition."
            />
          </div>

          <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3">
            <Toggle
              checked={importsExcel}
              onChange={() => setImportsExcel((v) => !v)}
              label="Acces imports Excel"
              description="Autoriser cet agent a importer des fichiers commandes pour les admins."
            />
          </div>

          <div className="rounded-lg border border-amber-100 bg-amber-50 px-3">
            <Toggle
              checked={creationProspects}
              onChange={() => setCreationProspects((v) => !v)}
              label="Acces creation prospects"
              description="Autoriser cet agent a creer des prospects depuis l'application mobile."
            />
          </div>

          <div className="rounded-lg border border-gray-100 px-3">
            <Toggle
              checked={active}
              onChange={() => setActive((v) => !v)}
              label="Compte actif"
              description="L'utilisateur peut se connecter"
            />
          </div>

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
            onClick={submit}
            disabled={pending}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-gray-800 disabled:opacity-60 sm:w-auto"
          >
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Creer l&apos;utilisateur
          </button>
        </div>
      </div>
    </div>
  );
}
