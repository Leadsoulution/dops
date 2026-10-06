"use client";

import { useEffect, useState } from "react";
import {
  Building2,
  CreditCard,
  Loader2,
  Mail,
  MapPin,
  PackagePlus,
  Phone,
  Tag,
  X,
} from "lucide-react";
import type { Arrival, Supplier } from "@/lib/supabase/suppliers";
import ArrivalModal from "./ArrivalModal";

/**
 * La fiche d'un fournisseur.
 *
 * Ses coordonnees, ce qu'on lui a achete, ce qu'on lui a regle, et ce
 * qu'on lui doit encore. Les arrivages sont listes du plus recent au
 * plus ancien : c'est le dernier qui renseigne le cout d'aujourd'hui.
 *
 * ICE et RIB y figurent parce qu'ils servent a facturer et a virer.
 * Toute la page est reservee aux administrateurs, eux seuls les
 * voient.
 */

const nf2 = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default function SupplierDetailModal({
  supplier,
  onClose,
  onChanged,
}: {
  supplier: Supplier;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [arrivals, setArrivals] = useState<Arrival[] | null>(null);
  const [nouvel, setNouvel] = useState(false);

  async function charger() {
    try {
      const body = await fetch(
        `/api/suppliers?supplier=${encodeURIComponent(supplier.id)}`
      ).then((r) => r.json());
      setArrivals((body.arrivals ?? []) as Arrival[]);
    } catch {
      setArrivals([]);
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/suppliers?supplier=${encodeURIComponent(supplier.id)}`)
      .then((r) => r.json())
      .then((body) => {
        if (!cancelled) setArrivals((body.arrivals ?? []) as Arrival[]);
      })
      .catch(() => {
        if (!cancelled) setArrivals([]);
      });
    return () => {
      cancelled = true;
    };
  }, [supplier.id]);

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 sm:px-4 sm:py-10">
        <div className="flex h-full w-full flex-col bg-white shadow-2xl sm:h-auto sm:max-w-2xl sm:rounded-xl">
          <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100">
                <Building2 className="h-4 w-4 text-gray-500" />
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-h2 font-semibold text-gray-900">
                  {supplier.name}
                </h2>
                <p className="truncate text-[12px] text-gray-500">
                  {[supplier.category, supplier.contactName]
                    .filter(Boolean)
                    .join(" - ") || "Fournisseur"}
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

          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:max-h-[66vh] sm:flex-none">
            {/* Les trois chiffres qui resument la relation. */}
            <div className="grid grid-cols-3 gap-3">
              <Chiffre label="Achete" value={supplier.purchased} />
              <Chiffre label="Regle" value={supplier.paid} />
              <Chiffre
                label="Solde du"
                value={supplier.balanceDue}
                alerte={supplier.balanceDue > 0}
              />
            </div>

            <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 rounded-lg border border-gray-200 p-3 sm:grid-cols-2">
              <Ligne icon={<Phone className="h-3.5 w-3.5" />} value={supplier.phone} />
              <Ligne icon={<Mail className="h-3.5 w-3.5" />} value={supplier.email} />
              <Ligne
                icon={<MapPin className="h-3.5 w-3.5" />}
                value={[supplier.address, supplier.city].filter(Boolean).join(", ")}
              />
              <Ligne
                icon={<Tag className="h-3.5 w-3.5" />}
                label="ICE"
                value={supplier.ice}
                mono
              />
              <Ligne
                icon={<CreditCard className="h-3.5 w-3.5" />}
                label="RIB"
                value={supplier.rib}
                mono
              />
              {supplier.note && (
                <p className="text-[12px] italic text-gray-500 sm:col-span-2">
                  {supplier.note}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] font-semibold text-gray-800">
                Arrivages
                <span className="ml-1.5 font-normal text-gray-400">
                  {arrivals?.length ?? 0}
                </span>
              </p>
              <button
                onClick={() => setNouvel(true)}
                className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-gray-800"
              >
                <PackagePlus className="h-3.5 w-3.5" />
                Nouvel arrivage
              </button>
            </div>

            {!arrivals && (
              <p className="flex items-center justify-center gap-2 py-8 text-[12.5px] text-gray-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Lecture des arrivages...
              </p>
            )}

            {arrivals?.length === 0 && (
              <p className="rounded-lg border border-dashed border-gray-200 py-8 text-center text-[12.5px] text-gray-400">
                Aucun arrivage enregistre. C&apos;est lui qui donnera le cout de
                la marchandise.
              </p>
            )}

            <div className="space-y-2">
              {(arrivals ?? []).map((a) => (
                <div
                  key={a.id}
                  className="overflow-hidden rounded-lg border border-gray-200"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 bg-gray-50 px-3 py-2">
                    <p className="text-[12.5px] font-medium text-gray-800">
                      <span className="font-mono">{a.arrivedAt}</span>
                      {a.reference && (
                        <span className="ml-2 text-gray-400">{a.reference}</span>
                      )}
                    </p>
                    <p className="font-mono text-[12.5px] font-semibold text-gray-900">
                      {nf2.format(a.totalMad)} DH
                      <span className="ml-1.5 font-sans text-[11px] font-normal text-gray-400">
                        {a.units} unite{a.units > 1 ? "s" : ""}
                      </span>
                    </p>
                  </div>
                  <ul className="divide-y divide-gray-50">
                    {a.lines.map((l, i) => (
                      <li
                        key={`${a.id}-${l.productId}-${i}`}
                        className="flex items-center justify-between gap-2 px-3 py-1.5 text-[12px]"
                      >
                        <span className="min-w-0 truncate text-gray-700">
                          {l.productName ?? "Produit retire"}
                        </span>
                        <span className="shrink-0 font-mono text-gray-500">
                          {l.quantity} x {nf2.format(l.unitCost)} ={" "}
                          <span className="text-gray-800">
                            {nf2.format(l.totalMad)}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {nouvel && (
        <ArrivalModal
          supplierId={supplier.id}
          supplierName={supplier.name}
          onClose={() => setNouvel(false)}
          onSaved={() => {
            void charger();
            onChanged?.();
          }}
        />
      )}
    </>
  );
}

function Chiffre({
  label,
  value,
  alerte,
}: {
  label: string;
  value: number;
  alerte?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${alerte ? "border-amber-300 bg-amber-50" : "border-gray-200"}`}
    >
      <p className="text-[11px] font-semibold tracking-wide text-gray-400">
        {label.toUpperCase()}
      </p>
      <p
        className={`font-mono text-[16px] font-semibold ${alerte ? "text-amber-800" : "text-gray-900"}`}
      >
        {nf2.format(value)}
      </p>
    </div>
  );
}

function Ligne({
  icon,
  label,
  value,
  mono,
}: {
  icon: React.ReactNode;
  label?: string;
  value?: string;
  mono?: boolean;
}) {
  // Une ligne vide ne s'affiche pas : un intitule sans valeur occupe
  // la place sans rien apprendre.
  if (!value) return null;
  return (
    <p className="flex items-center gap-2 text-[12.5px] text-gray-600">
      <span className="shrink-0 text-gray-400">{icon}</span>
      {label && <span className="shrink-0 text-gray-400">{label}</span>}
      <span className={`min-w-0 truncate ${mono ? "font-mono" : ""}`}>
        {value}
      </span>
    </p>
  );
}
