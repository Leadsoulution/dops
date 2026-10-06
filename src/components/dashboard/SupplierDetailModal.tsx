"use client";

import { Building2, Mail, Phone, X } from "lucide-react";
import type { Supplier } from "@/lib/supabase/suppliers";

export default function SupplierDetailModal({
  supplier,
  onClose,
}: {
  supplier: Supplier;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 sm:px-4 sm:py-10">
      <div className="flex h-full w-full flex-col bg-white shadow-2xl sm:h-auto sm:max-w-sm sm:rounded-xl">
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100">
              <Building2 className="h-4 w-4 text-gray-500" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-h2 font-semibold text-gray-900">
                {supplier.name}
              </h2>
              <p className="truncate text-[12px] text-gray-500">
                {supplier.contactName}
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

        <div className="space-y-4 px-5 py-4">
          <div className="space-y-2 rounded-lg border border-gray-100 p-3">
            <p className="flex items-center gap-2 font-mono text-[13px] text-gray-700">
              <Phone className="h-3.5 w-3.5 text-gray-400" />
              {supplier.phone}
            </p>
            <p className="flex items-center gap-2 text-[13px] text-gray-700">
              <Mail className="h-3.5 w-3.5 text-gray-400" />
              {supplier.email}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md bg-gray-50 px-2.5 py-1.5">
              <p className="font-mono text-[13px] font-semibold text-gray-800">
                {supplier.productsCount}
              </p>
              <p className="text-[10.5px] text-gray-500">Produits lies</p>
            </div>
            <div className="rounded-md bg-gray-50 px-2.5 py-1.5">
              <p className="font-mono text-[13px] font-semibold text-gray-800">
                {supplier.unitsSupplied.toLocaleString("fr-FR")}
              </p>
              <p className="text-[10.5px] text-gray-500">Unites fournies</p>
            </div>
            <div className="rounded-md bg-emerald-50 px-2.5 py-1.5">
              <p className="font-mono text-[13px] font-semibold text-emerald-700">
                {supplier.paid.toLocaleString("fr-FR")} MAD
              </p>
              <p className="text-[10.5px] text-emerald-600">Paye</p>
            </div>
            <div className="rounded-md bg-red-50 px-2.5 py-1.5">
              <p className="font-mono text-[13px] font-semibold text-red-700">
                {supplier.balanceDue.toLocaleString("fr-FR")} MAD
              </p>
              <p className="text-[10.5px] text-red-600">Solde du</p>
            </div>
          </div>

          <p className="text-[11.5px] text-gray-400">
            Dernier achat : <span className="font-mono">{supplier.lastPurchaseAt ?? "aucun"}</span>
          </p>
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
