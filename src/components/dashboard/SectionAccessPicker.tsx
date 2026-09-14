"use client";

import { Check, Lock } from "lucide-react";
import { ADMIN_LOCKED_SECTION, ALL_SECTION_KEYS, APP_SECTIONS } from "@/lib/access";

/**
 * Pages que ce compte a le droit d'ouvrir, et donc ce qui apparait dans
 * sa barre laterale.
 *
 * Chacun choisit les siennes, administrateur compris. Seule la page
 * Utilisateurs lui reste imposee : c'est de la qu'on redonne un acces
 * retire par erreur.
 */
export default function SectionAccessPicker({
  role,
  value,
  onChange,
}: {
  role: string;
  value: string[];
  onChange: (keys: string[]) => void;
}) {
  // Verrou : un administrateur garde la page Utilisateurs, seul endroit
  // d'ou l'on peut se redonner un acces retire par erreur.
  const locked = (key: string) =>
    role === "Admin" && key === ADMIN_LOCKED_SECTION;

  function toggle(key: string) {
    if (locked(key)) return;
    onChange(
      value.includes(key) ? value.filter((k) => k !== key) : [...value, key]
    );
  }

  const groups = [...new Set(APP_SECTIONS.map((s) => s.group))];

  return (
    <div className="rounded-lg border border-gray-200">
      <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
        <p className="text-[12.5px] font-medium text-gray-700">
          Pages accessibles{" "}
          <span className="font-mono text-gray-400">
            ({new Set(role === "Admin" ? [...value, ADMIN_LOCKED_SECTION] : value).size}/
            {ALL_SECTION_KEYS.length})
          </span>
        </p>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => onChange([...ALL_SECTION_KEYS])}
            className="rounded-md px-2 py-1 text-[11.5px] font-medium text-blue-600 hover:bg-blue-50"
          >
            Tout
          </button>
          <button
            type="button"
            onClick={() =>
              onChange(role === "Admin" ? [ADMIN_LOCKED_SECTION] : [])
            }
            className="rounded-md px-2 py-1 text-[11.5px] font-medium text-gray-500 hover:bg-gray-100"
          >
            Aucun
          </button>
        </div>
      </div>

      <div className="max-h-56 overflow-y-auto p-2">
        {groups.map((group) => (
          <div key={group} className="mb-1.5 last:mb-0">
            <p className="px-1 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-gray-400">
              {group}
            </p>
            {APP_SECTIONS.filter((s) => s.group === group).map((section) => {
              const isLocked = locked(section.key);
              const checked = value.includes(section.key) || isLocked;
              return (
                <button
                  key={section.key}
                  type="button"
                  onClick={() => toggle(section.key)}
                  disabled={isLocked}
                  title={
                    isLocked
                      ? "Un administrateur garde cette page : c'est d'ici qu'on redonne un acces."
                      : undefined
                  }
                  className={`flex w-full items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left ${
                    isLocked ? "cursor-not-allowed opacity-70" : "hover:bg-gray-50"
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      checked
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-gray-300 bg-white"
                    }`}
                  >
                    {checked && <Check className="h-3 w-3" />}
                  </span>
                  <span className="flex items-center gap-1.5 text-[12.5px] text-gray-700">
                    {section.label}
                    {isLocked && <Lock className="h-3 w-3 text-gray-400" />}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
