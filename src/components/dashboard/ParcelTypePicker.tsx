"use client";

import { AlertCircle, Package, Warehouse } from "lucide-react";

/**
 * Comment ce produit part par defaut.
 *
 * C'est ce choix qui permettra a une commande WooCommerce de rejoindre
 * le transporteur sans intervention : elle n'a pas a savoir d'ou part la
 * marchandise, le produit le sait.
 */
export default function ParcelTypePicker({
  value,
  onChange,
  forcelogRef,
}: {
  value: "simple" | "stock";
  onChange: (value: "simple" | "stock") => void;
  forcelogRef?: string;
}) {
  // Sans code article, le transporteur n'a rien a prelever dans son
  // depot : l'option est proposee mais inutilisable, et on le dit.
  const stockPossible = Boolean(forcelogRef?.trim());

  const options = [
    {
      key: "simple" as const,
      icon: Package,
      title: "Colis simple",
      description: "Expedie depuis votre depot",
      disabled: false,
    },
    {
      key: "stock" as const,
      icon: Warehouse,
      title: "Colis de stock",
      description: "Preleve dans le depot du transporteur",
      disabled: !stockPossible,
    },
  ];

  return (
    <div>
      <label className="mb-1 block text-[12.5px] text-gray-600">
        Type d&apos;expedition par defaut
      </label>
      <div className="grid grid-cols-2 gap-2">
        {options.map((option) => {
          const Icon = option.icon;
          const active = value === option.key;
          return (
            <button
              key={option.key}
              type="button"
              disabled={option.disabled}
              onClick={() => onChange(option.key)}
              title={
                option.disabled
                  ? "Renseignez d'abord le code article ForceLog."
                  : undefined
              }
              className={`flex flex-col items-start gap-1 rounded-lg border p-2.5 text-left transition-colors ${
                active
                  ? "border-blue-500 bg-blue-50"
                  : option.disabled
                    ? "cursor-not-allowed border-gray-200 bg-gray-50 opacity-60"
                    : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <span
                className={`flex items-center gap-1.5 text-[12.5px] font-medium ${
                  active ? "text-blue-700" : "text-gray-700"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {option.title}
              </span>
              <span className="text-[11px] leading-snug text-gray-500">
                {option.description}
              </span>
            </button>
          );
        })}
      </div>

      {!stockPossible && (
        <p className="mt-1.5 flex items-start gap-1.5 text-[11.5px] text-amber-600">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
          Colis de stock indisponible : ce produit n&apos;a pas de code article
          ForceLog.
        </p>
      )}
    </div>
  );
}
