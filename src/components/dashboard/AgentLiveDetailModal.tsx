"use client";

import {
  ChevronRight,
  Clock,
  Info,
  Inbox,
  PhoneOff,
  RefreshCw,
  UserCheck,
  X,
} from "lucide-react";
import type { AgentStats } from "./confirmation-data";

export default function AgentLiveDetailModal({
  agent,
  onClose,
}: {
  agent: AgentStats;
  onClose: () => void;
}) {
  const initial = agent.name.trim().charAt(0).toUpperCase();

  const funnelItems = [
    { icon: UserCheck, label: "Ou en sont les leads traites", value: agent.treated },
    { icon: RefreshCw, label: "Ou en sont les leads confirmes", value: agent.confirmed },
    { icon: Clock, label: "Ou en sont les leads au rappel", value: agent.rappels },
    { icon: PhoneOff, label: "Ou en sont les leads sans reponse", value: 0 },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-10">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-semibold text-white ${agent.avatarColor}`}
            >
              {initial}
            </span>
            <div>
              <p className="text-[14px] font-semibold text-gray-900">
                {agent.name}
              </p>
              <p className="text-[12px] text-gray-400">{agent.email}</p>
              <span className="mt-1 inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-medium text-emerald-600">
                Compte actif
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-5 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-gray-100 px-3 py-2.5">
              <p className="text-[11px] text-gray-400">Assignes</p>
              <p className="font-mono text-[17px] font-semibold text-gray-900">
                {agent.treated.toLocaleString("fr-FR")}
              </p>
            </div>
            <div className="rounded-lg border border-gray-100 px-3 py-2.5">
              <p className="text-[11px] text-gray-400">En cours</p>
              <p className="font-mono text-[17px] font-semibold text-gray-900">
                {agent.pending.toLocaleString("fr-FR")}
              </p>
            </div>
            <div className="rounded-lg border border-gray-100 px-3 py-2.5">
              <p className="text-[11px] text-gray-400">Confirmes</p>
              <p className="font-mono text-[17px] font-semibold text-emerald-600">
                {agent.confirmed.toLocaleString("fr-FR")}
              </p>
            </div>
            <div className="rounded-lg border border-gray-100 px-3 py-2.5">
              <p className="text-[11px] text-gray-400">Rappeles</p>
              <p className="font-mono text-[17px] font-semibold text-orange-500">
                {agent.rappels.toLocaleString("fr-FR")}
              </p>
            </div>
            <div className="rounded-lg border border-gray-100 px-3 py-2.5">
              <p className="text-[11px] text-gray-400">Contactes</p>
              <p className="font-mono text-[17px] font-semibold text-gray-900">
                {agent.contacted.toLocaleString("fr-FR")}
              </p>
            </div>
            <div className="rounded-lg border border-gray-100 px-3 py-2.5">
              <p className="text-[11px] text-gray-400">Conversion</p>
              <p className="font-mono text-[17px] font-semibold text-gray-900">
                {agent.confirmRate}%
              </p>
            </div>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-semibold tracking-wide text-gray-500">
              ENTONNOIR LEADS
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {funnelItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 px-3 py-2 text-left hover:bg-gray-50"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Icon className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                      <span className="truncate text-[12px] text-gray-600">
                        {item.label}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      <span className="font-mono text-[12.5px] font-semibold text-gray-800">
                        {item.value.toLocaleString("fr-FR")}
                      </span>
                      <ChevronRight className="h-3 w-3 text-gray-300" />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-semibold tracking-wide text-gray-500">
              ACTIVITE RECENTE (7J)
            </p>
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-gray-200 py-6 text-gray-400">
              <Inbox className="h-5 w-5" />
              <p className="text-[12px]">
                Aucune mise a jour de statut sur cet agent sur la fenetre
                selectionnee.
              </p>
            </div>
          </div>

          <div className="rounded-lg bg-gray-50 px-3 py-2.5">
            <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-gray-500">
              <Info className="h-3 w-3" />
              SOURCE LIVE
            </p>
            <p className="text-[11.5px] text-gray-500">
              Endpoint confirmation-overview (/confirmation/overview) : les
              compteurs de file sont les totaux courants, tandis que
              contactes/conversion/activite s&apos;ouvrent avec la fenetre
              selectionnee.
            </p>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-semibold tracking-wide text-gray-500">
              TELEMETRIE (PERIODE SELECTIONNEE)
            </p>
            <div className="space-y-1.5 text-[12.5px]">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Temps moyen de traitement</span>
                <span className="font-medium text-gray-400">
                  Aucun actionnable sur cette fenetre
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Temps moyen de session</span>
                <span className="font-mono font-medium text-gray-700">1h 18m</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
