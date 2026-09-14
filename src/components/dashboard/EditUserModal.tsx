"use client";

import { useState } from "react";
import { X } from "lucide-react";
import Toggle from "./Toggle";
import SelectDropdown from "./SelectDropdown";
import SectionAccessPicker from "./SectionAccessPicker";
import { effectiveAccess } from "@/lib/access";
import { roleOptions } from "./users-data";
import type { TeamMember } from "./users-data";

export default function EditUserModal({
  member,
  onClose,
  onSave,
}: {
  member: TeamMember;
  onClose: () => void;
  onSave: (updated: TeamMember) => void;
}) {
  const [name, setName] = useState(member.name);
  const [email, setEmail] = useState(member.email);
  const [phone, setPhone] = useState(member.phone);
  const [suiviLivraison, setSuiviLivraison] = useState(
    member.permissions.suiviLivraison
  );
  const [importsExcel, setImportsExcel] = useState(member.permissions.importsExcel);
  const [creationProspects, setCreationProspects] = useState(
    member.permissions.creationProspects
  );
  const [active, setActive] = useState(member.status === "Actif");
  const [role, setRole] = useState(member.role);
  const [pageAccess, setPageAccess] = useState<string[]>(member.pageAccess);

  function handleSave() {
    onSave({
      ...member,
      name,
      email,
      phone,
      status: active ? "Actif" : "Inactif",
      role,
      permissions: { suiviLivraison, importsExcel, creationProspects },
      pageAccess: effectiveAccess({ role, pageAccess }),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 sm:px-4 sm:py-10">
      <div className="flex h-full w-full flex-col bg-white shadow-2xl sm:h-auto sm:max-w-sm sm:rounded-xl">
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-h2 font-semibold text-gray-900">
            Modifier {member.name}
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
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-800 focus:border-blue-400 focus:outline-none"
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
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-800 focus:border-blue-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-[12.5px] text-gray-600">
              Telephone
            </label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-800 focus:border-blue-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-[12.5px] text-gray-600">Role</label>
            <SelectDropdown
              variant="field"
              pinnedLabel={role}
              options={roleOptions}
              value={role}
              onSelect={(v) => setRole(v as TeamMember["role"])}
            />
          </div>

          <SectionAccessPicker
            role={role}
            value={pageAccess}
            onChange={setPageAccess}
          />

          {role === "Agent" && (
            <>
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
            </>
          )}

          <div className="rounded-lg border border-gray-100 px-3">
            <Toggle
              checked={active}
              onChange={() => setActive((v) => !v)}
              label="Compte actif"
              description="L'utilisateur peut se connecter"
            />
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2.5 border-t border-gray-100 px-5 py-4 sm:flex-row sm:justify-end">
          <button
            onClick={onClose}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-50 sm:w-auto"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            className="w-full rounded-lg bg-gray-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-gray-800 sm:w-auto"
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
