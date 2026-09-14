"use client";

import { useState } from "react";
import Image from "next/image";
import { ClipboardList, MapPin, Pencil, Trash2, User, X } from "lucide-react";
import type { Lead, LeadStatus } from "./leads-data";
import CallOutcomePanel from "./CallOutcomePanel";

const tabs = [
  "Historique des statuts",
  "Historique des modifications",
  "Tracking & attribution",
  "Historique client",
] as const;

export default function OrderDetailsModal({
  lead,
  onClose,
  onEdit,
  onStatusChange,
  onDelete,
}: {
  lead: Lead;
  onClose: () => void;
  onEdit: () => void;
  onStatusChange: (status: LeadStatus) => Promise<void> | void;
  /** Absente pour qui n'a pas le droit de supprimer. */
  onDelete?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>(tabs[0]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 sm:px-4 sm:py-10">
      <div className="flex h-full w-full flex-col bg-white shadow-2xl sm:h-auto sm:max-w-lg sm:rounded-xl">
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-start gap-2.5">
            <ClipboardList className="mt-0.5 h-4 w-4 text-gray-700" />
            <div>
              <h2 className="text-h2 font-semibold text-gray-900">
                Details de la commande
              </h2>
              <p className="mt-0.5 max-w-sm text-[12.5px] text-gray-500">
                Vue operationnelle avec historique, attribution et contexte de
                la commande.
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
          <div className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2.5">
            <div className="flex items-center gap-3">
              {lead.productImage ? (
                <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-gray-100 bg-gray-50">
                  <Image
                    src={lead.productImage}
                    alt={lead.productName}
                    fill
                    sizes="80px"
                    className="object-cover"
                    unoptimized
                  />
                </div>
              ) : (
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-[11px] font-medium text-gray-400">
                  {lead.productLabel}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-gray-800">
                  {lead.productName}
                </p>
                <p className="text-[12px] text-gray-500">
                  <span className="font-mono">
                    {lead.itemCount ?? 1} x {lead.amount}
                  </span>
                </p>
              </div>
            </div>
            <p className="font-mono text-[14px] font-semibold text-gray-900">
              {lead.amount}
            </p>
          </div>

          <CallOutcomePanel lead={lead} onStatusChange={onStatusChange} />

          <div>
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-gray-500">
              <MapPin className="h-3 w-3" />
              ADRESSE
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-gray-100 px-3 py-2.5 text-[12.5px]">
              <div>
                <p className="text-gray-400">Quartier</p>
                <p className="text-gray-700">{lead.quartier ?? "—"}</p>
              </div>
              <div>
                <p className="text-gray-400">Ville</p>
                <p className="text-gray-700">{lead.ville ?? "—"}</p>
              </div>
              <div className="col-span-2">
                <p className="text-gray-400">Adresse</p>
                <p className="text-gray-700">{lead.adresse ?? "—"}</p>
              </div>
            </div>
          </div>

          <div>
            <div className="grid grid-cols-2 gap-2 border-b border-gray-100 pb-2 sm:flex sm:items-center sm:gap-4 sm:gap-y-0 sm:pb-0">
              {tabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`truncate rounded-md px-2 py-1.5 text-left text-[12px] font-medium transition-colors sm:rounded-none sm:border-b-2 sm:px-0 sm:py-0 sm:pb-2 sm:text-center ${
                    activeTab === tab
                      ? "bg-gray-100 text-gray-900 sm:bg-transparent sm:border-gray-900"
                      : "text-gray-400 hover:bg-gray-50 hover:text-gray-600 sm:border-transparent sm:hover:bg-transparent"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="pt-3">
              {activeTab === "Historique des statuts" && (
                <div className="space-y-3">
                  <div className="flex gap-2.5">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                    <div>
                      <p className="text-[12.5px] font-medium text-gray-700">
                        {lead.status} &mdash; Par Mohamed Alaoui
                      </p>
                      <p className="font-mono text-[11.5px] text-gray-400">
                        {lead.date}
                      </p>
                      <p className="mt-0.5 text-[11.5px] text-gray-500">
                        Order reassigned to agent
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2.5">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                    <div>
                      <p className="text-[12.5px] font-medium text-gray-700">
                        Nouveau &mdash; Par Mohamed Alaoui
                      </p>
                      <p className="font-mono text-[11.5px] text-gray-400">
                        {lead.date}
                      </p>
                      <p className="mt-0.5 text-[11.5px] text-gray-500">
                        Order imported from Excel file lead_import_template.csv
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "Historique des modifications" && (
                <p className="text-[12.5px] text-gray-400">
                  Aucune modification enregistree pour cette commande.
                </p>
              )}

              {activeTab === "Tracking & attribution" && (
                <div className="space-y-1.5 text-[12.5px] text-gray-600">
                  <p>
                    Source : <span className="font-medium">{lead.source}</span>
                  </p>
                  <p>
                    Assigne a :{" "}
                    <span className="font-medium">{lead.assignedTo}</span>
                  </p>
                  <p>
                    Expedition :{" "}
                    <span className="font-medium">{lead.shipping}</span>
                  </p>
                </div>
              )}

              {activeTab === "Historique client" && (
                <div className="flex items-start gap-2 text-[12.5px] text-gray-400">
                  <User className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <p>
                    Aucune commande precedente n&apos;utilise ce telephone.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2.5 border-t border-gray-100 px-5 py-4 sm:flex-row sm:justify-end">
          {onDelete && (
            <button
              onClick={onDelete}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white px-4 py-2 text-[13px] font-medium text-red-600 hover:bg-red-50 sm:mr-auto sm:w-auto"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Supprimer la commande
            </button>
          )}
          <button
            onClick={onClose}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-50 sm:w-auto"
          >
            Annuler
          </button>
          <button
            onClick={onEdit}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-blue-700 sm:w-auto"
          >
            <Pencil className="h-3.5 w-3.5" />
            Modifier les details
          </button>
        </div>
      </div>
    </div>
  );
}
