"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ShoppingCart,
  Download,
  Upload,
  Plus,
  Search,
  SlidersHorizontal,
  Calendar,
  Truck,
  User,
  Tag,
  Package,
  Wallet,
  Inbox,
  Eye,
  Phone,
  Copy,
  Trash2,
  UserPlus,
  RefreshCw,
  X,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Flag,
  Sparkles,
  CheckCircle2,
  PhoneCall,
  PhoneOff,
  XCircle,
  ShoppingBag,
  Watch,
  Wind,
  Droplet,
  BatteryCharging,
  Loader2,
  AlertCircle,
} from "lucide-react";
import type { ComponentType } from "react";
import Image from "next/image";
import {
  tabs,
  dateRanges,
  parseLeadDate,
  sourceBadgeStyles,
  statusBadgeStyles,
  deliveryStatusStyles,
  paymentStatusStyle,
  type Lead,
  type LeadStatus,
} from "./leads-data";
import RowActionsMenu from "./RowActionsMenu";
import CreateCommandeModal from "./CreateCommandeModal";
import OrderDetailsModal from "./OrderDetailsModal";
import EditOrderModal from "./EditOrderModal";
import ChangeStatusModal from "./ChangeStatusModal";
import AssignModal from "./AssignModal";
import SelectDropdown from "./SelectDropdown";
import DateRangeCalendar from "./DateRangeCalendar";

/** Transporteur integre a l'application. */
const CARRIER_NAME = "ForceLog";

const statusIcons: Record<LeadStatus, ComponentType<{ className?: string }>> = {
  Nouveau: Sparkles,
  Assigne: UserPlus,
  "En cours": RefreshCw,
  Confirme: CheckCircle2,
  Rappel: PhoneCall,
  "Pas de reponse": PhoneOff,
  "Numero incorrect": PhoneOff,
  Annule: XCircle,
  Duplique: Copy,
  "A revoir": Eye,
  "Faux / spam": Flag,
};

function productIcon(productName: string): ComponentType<{ className?: string }> {
  const name = productName.toLowerCase();
  if (name.includes("montre") || name.includes("watch")) return Watch;
  if (name.includes("diffuseur")) return Wind;
  if (name.includes("serum")) return Droplet;
  if (name.includes("powerbank")) return BatteryCharging;
  return ShoppingBag;
}

type ModalState =
  | { type: "create" }
  | { type: "details"; lead: Lead }
  | { type: "edit"; lead: Lead }
  | { type: "status"; leadIds: string[] }
  | { type: "assign"; leadIds: string[] }
  | null;

export default function LeadsCommandesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [leadsState, setLeadsState] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("Tous");
  const [activeRange, setActiveRange] = useState("Maximum");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [customRange, setCustomRange] = useState<{ start: Date; end: Date } | null>(
    null
  );
  const [filtersResetKey, setFiltersResetKey] = useState(0);
  const [filters, setFilters] = useState({
    produits: [] as string[],
    sources: [] as string[],
    agents: [] as string[],
    confirmation: [] as string[],
    livraison: [] as string[],
    paiement: [] as string[],
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sendingToForceLog, setSendingToForceLog] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<ModalState>(null);

  // L'id d'une eventuelle arrivee depuis la recherche globale (?lead=<id>),
  // capture une seule fois : `searchParams` change d'identite a chaque
  // rendu et relancerait le chargement en boucle s'il etait une dependance.
  const deepLinkLeadId = useRef(searchParams.get("lead"));

  // Charge les commandes depuis la base, au montage uniquement.
  useEffect(() => {
    let cancelled = false;

    // Reprend d'abord les commandes de la boutique, puis lit la base :
    // l'ordre importe, sinon une commande arrivee entre les deux
    // n'apparaitrait qu'au prochain passage.
    fetch("/api/woocommerce/orders", { method: "POST" })
      .catch(() => {
        /* Boutique non connectee ou injoignable : on affiche la base. */
      })
      .then(() => {
        if (!cancelled) loadLeads();
      });

    function loadLeads() {
    fetch("/api/leads")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) {
          setLoadError(data.error);
        } else {
          const loaded: Lead[] = data.leads ?? [];
          setLeadsState(loaded);
          const lead = deepLinkLeadId.current
            ? loaded.find((l) => l.id === deepLinkLeadId.current)
            : undefined;
          if (lead) setModal({ type: "details", lead });

          // Rafraichit en arriere-plan les statuts de livraison depuis
          // ForceLog, sans bloquer l'affichage de la liste.
          if (loaded.some((l) => l.trackingNumber)) {
            fetch("/api/leads/sync", { method: "POST" })
              .then((res) => res.json())
              .then((sync) => {
                if (cancelled || !sync.updated?.length) return;
                setLeadsState((prev) =>
                  prev.map((l) => {
                    const fresh = (sync.updated as Lead[]).find(
                      (u) => u.id === l.id
                    );
                    return fresh ?? l;
                  })
                );
              })
              .catch(() => {
                /* Synchronisation silencieuse : ne derange pas l'ecran. */
              });
          }
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError("Impossible de joindre le serveur.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    }

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (searchParams.get("lead")) {
      router.replace("/");
    }
  }, [searchParams, router]);

  // Bornes de la periode choisie, en heure locale. `null` = pas de borne.
  function rangeBounds(): { from: Date | null; to: Date | null } {
    const now = new Date();
    const startOfDay = (d: Date) =>
      new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const endOfDay = (d: Date) =>
      new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

    switch (activeRange) {
      case "Aujourd'hui":
        return { from: startOfDay(now), to: endOfDay(now) };
      case "Hier": {
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        return { from: startOfDay(yesterday), to: endOfDay(yesterday) };
      }
      case "7 derniers jours": {
        // Aujourd'hui compris, donc six jours en arriere.
        const from = new Date(now);
        from.setDate(now.getDate() - 6);
        return { from: startOfDay(from), to: endOfDay(now) };
      }
      case "Ce mois-ci":
        return {
          from: new Date(now.getFullYear(), now.getMonth(), 1),
          to: endOfDay(now),
        };
      case "Personnalisee":
        return customRange
          ? { from: startOfDay(customRange.start), to: endOfDay(customRange.end) }
          : { from: null, to: null };
      // "Maximum" couvre tout l'historique.
      default:
        return { from: null, to: null };
    }
  }

  const { from: rangeFrom, to: rangeTo } = rangeBounds();

  // "3 - 12 sept." tant que les deux dates sont dans le meme mois.
  const customRangeLabel = customRange
    ? `${new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(
        customRange.start
      )} - ${new Intl.DateTimeFormat("fr-FR", {
        day: "numeric",
        month: "short",
      }).format(customRange.end)}`
    : null;

  function matchesRange(lead: Lead) {
    if (!rangeFrom && !rangeTo) return true;
    const date = parseLeadDate(lead.date);
    // Une date illisible ne doit pas faire disparaitre la commande.
    if (!date) return true;
    if (rangeFrom && date < rangeFrom) return false;
    if (rangeTo && date > rangeTo) return false;
    return true;
  }

  // La periode s'applique avant les onglets : leurs compteurs annoncent
  // ce que l'onglet contient reellement pour la periode affichee.
  const rangedLeads = leadsState.filter(matchesRange);

  const dynamicTabs = tabs.map((tab) => ({
    ...tab,
    count: tab.status
      ? rangedLeads.filter((lead) => lead.status === tab.status).length
      : rangedLeads.length,
  }));
  const activeTabDef = dynamicTabs.find((t) => t.label === activeTab) ?? dynamicTabs[0];
  const filteredLeads = activeTabDef.status
    ? rangedLeads.filter((lead) => lead.status === activeTabDef.status)
    : rangedLeads;

  // Les options proposees sont celles reellement presentes dans les
  // commandes chargees : inutile de proposer un filtre qui ne renverrait
  // jamais rien, et les statuts transporteur evoluent de leur cote.
  const uniqueValues = (pick: (lead: Lead) => string | undefined) =>
    [...new Set(rangedLeads.map(pick).filter((v): v is string => Boolean(v)))].sort();

  const filterOptions = {
    produits: uniqueValues((l) => l.productName),
    sources: uniqueValues((l) => l.source),
    agents: uniqueValues((l) => l.assignedTo),
    confirmation: uniqueValues((l) => l.status),
    livraison: uniqueValues((l) => l.deliveryStatus),
    paiement: uniqueValues((l) => l.paymentStatus),
  };

  // Un filtre vide ne restreint rien ; plusieurs valeurs dans un meme
  // filtre s'additionnent (OU), et les differents filtres se cumulent (ET).
  const matchesFilters = (lead: Lead) =>
    (filters.produits.length === 0 ||
      filters.produits.includes(lead.productName)) &&
    (filters.sources.length === 0 || filters.sources.includes(lead.source)) &&
    (filters.agents.length === 0 || filters.agents.includes(lead.assignedTo)) &&
    (filters.confirmation.length === 0 ||
      filters.confirmation.includes(lead.status)) &&
    (filters.livraison.length === 0 ||
      filters.livraison.includes(lead.deliveryStatus ?? "")) &&
    (filters.paiement.length === 0 ||
      filters.paiement.includes(lead.paymentStatus ?? ""));

  const activeFilterCount = Object.values(filters).reduce(
    (total, values) => total + values.length,
    0
  );

  function resetFilters() {
    setFilters({
      produits: [],
      sources: [],
      agents: [],
      confirmation: [],
      livraison: [],
      paiement: [],
    });
    // Les pastilles gardent leur selection en interne : les remonter est le
    // seul moyen de les remettre a zero en meme temps que l'etat du parent.
    setFiltersResetKey((k) => k + 1);
  }

  const query = searchQuery.trim().toLowerCase();
  const visibleLeads = filteredLeads.filter(
    (lead) =>
      matchesFilters(lead) &&
      (!query ||
        lead.reference.toLowerCase().includes(query) ||
        lead.client.toLowerCase().includes(query) ||
        lead.phone.includes(query))
  );

  const allVisibleSelected =
    visibleLeads.length > 0 && visibleLeads.every((l) => selectedIds.has(l.id));

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        visibleLeads.forEach((l) => next.delete(l.id));
        return next;
      }
      const next = new Set(prev);
      visibleLeads.forEach((l) => next.add(l.id));
      return next;
    });
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function sendToForceLog(lead: Lead) {
    setSendingToForceLog((prev) => new Set(prev).add(lead.id));
    try {
      const res = await fetch("/api/forcelog/parcels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reference: lead.reference,
          client: lead.client,
          phone: lead.phone,
          ville: lead.ville,
          adresse: lead.adresse,
          amount: lead.amount,
          productName: lead.productName,
        }),
      });
      const data = await res.json();
      // Le resultat (code de suivi ou message d'erreur) est enregistre en
      // base pour qu'il survive au rechargement de la page.
      await persistChanges([lead.id], {
        trackingNumber: res.ok ? data.trackingNumber : undefined,
        trackingError: res.ok
          ? undefined
          : data.error ?? "Erreur ForceLog inconnue.",
      });
    } catch {
      await persistChanges([lead.id], {
        trackingNumber: undefined,
        trackingError: "Impossible de joindre le serveur.",
      });
    } finally {
      setSendingToForceLog((prev) => {
        const next = new Set(prev);
        next.delete(lead.id);
        return next;
      });
    }
  }

  /**
   * Applique un changement en base puis met l'ecran a jour.
   * L'ecran est mis a jour immediatement (optimiste) et remis dans son
   * etat precedent si la base refuse, pour que l'affichage ne mente
   * jamais sur ce qui est reellement enregistre.
   */
  async function persistChanges(ids: string[], changes: Partial<Lead>) {
    const previous = leadsState;
    setLeadsState((prev) =>
      prev.map((l) => (ids.includes(l.id) ? { ...l, ...changes } : l))
    );
    try {
      const res = await fetch("/api/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, changes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLeadsState((prev) =>
        prev.map((l) => {
          const updated = (data.leads as Lead[]).find((u) => u.id === l.id);
          return updated ?? l;
        })
      );
      // La feuille de sauvegarde suit, sans faire attendre l'ecran : une
      // sauvegarde qui echoue ne doit pas donner l'impression que
      // l'enregistrement a echoue.
      void fetch("/api/sheets/sync", { method: "POST" }).catch(() => {});
    } catch (error) {
      setLeadsState(previous);
      setLoadError(
        error instanceof Error ? error.message : "Enregistrement impossible."
      );
    }
  }

  async function deleteLead(id: string) {
    const previous = leadsState;
    setLeadsState((prev) => prev.filter((l) => l.id !== id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    try {
      const res = await fetch(`/api/leads/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
    } catch (error) {
      setLeadsState(previous);
      setLoadError(
        error instanceof Error ? error.message : "Suppression impossible."
      );
    }
  }

  function applyAssign(agent: string) {
    if (!modal || modal.type !== "assign") return;
    void persistChanges(modal.leadIds, { assignedTo: agent });
    setSelectedIds(new Set());
    setModal(null);
  }

  function applyStatus(status: string) {
    if (!modal || modal.type !== "status") return;
    if (status !== "Aucun changement") {
      void persistChanges(modal.leadIds, { status: status as LeadStatus });
    }
    setSelectedIds(new Set());
    setModal(null);
  }

  function exportCsv() {
    const headers = [
      "Reference",
      "Produit",
      "Client",
      "Telephone",
      "Source",
      "Assigne a",
      "Montant",
      "Statut",
      "Date",
    ];
    const rows = visibleLeads.map((lead) => [
      lead.reference,
      lead.productName,
      lead.client,
      lead.phone,
      lead.source,
      lead.assignedTo,
      lead.amount,
      lead.status,
      lead.date,
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-commandes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function getRowActions(lead: Lead) {
    return {
      onViewDetails: () => setModal({ type: "details", lead }),
      onEdit: () => setModal({ type: "edit", lead }),
      onCopyReference: () => {
        navigator.clipboard?.writeText(lead.reference);
      },
      onCall: () => {
        window.location.href = `tel:${lead.phone}`;
      },
      onCopyContact: () => {
        navigator.clipboard?.writeText(lead.phone);
      },
      onAssign: () => setModal({ type: "assign", leadIds: [lead.id] }),
      onChangeStatus: () => setModal({ type: "status", leadIds: [lead.id] }),
      onDelete: () => deleteLead(lead.id),
      onSendToForceLog: () => sendToForceLog(lead),
    };
  }

  const selectedCount = selectedIds.size;

  return (
    <div className="scrollbar-hide flex-1 overflow-y-auto bg-gray-50 px-4 py-4 lg:px-6 lg:py-5">
      <div className="mb-5 hidden items-start justify-between lg:flex">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100">
            <ShoppingCart className="h-4 w-4 text-gray-600" />
          </div>
          <div>
            <h1 className="text-h1 font-semibold text-gray-900">
              Leads &amp; Commandes
            </h1>
            <p className="text-[13px] text-gray-500">
              <span className="font-mono">48745</span> leads au total
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={exportCsv}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-50"
          >
            <Download className="h-3.5 w-3.5" />
            Exporter
          </button>
          <button
            disabled
            title="Bientot disponible"
            className="flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-[13px] font-medium text-gray-400 opacity-60"
          >
            <Upload className="h-3.5 w-3.5" />
            Importer Excel
          </button>
          <button
            onClick={() => setModal({ type: "create" })}
            className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-gray-800"
          >
            <Plus className="h-3.5 w-3.5" />
            Creer commande
          </button>
        </div>
      </div>

      {loadError && (
        <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-red-100 bg-red-50 px-3.5 py-2.5">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-medium text-red-700">
              Probleme d&apos;enregistrement
            </p>
            <p className="text-[11.5px] text-red-600">{loadError}</p>
          </div>
          <button
            onClick={() => setLoadError(null)}
            className="shrink-0 rounded-md p-1 text-red-400 hover:bg-red-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="mb-4 flex items-center gap-5 overflow-x-auto border-b border-gray-200 lg:gap-6 lg:overflow-visible">
        {dynamicTabs.map((tab) =>
          tab.flagged ? (
            <button
              key={tab.label}
              onClick={() => setActiveTab(tab.label)}
              className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 pb-2.5 text-[13.5px] transition-colors ${
                activeTab === tab.label
                  ? "border-gray-900 font-semibold text-gray-900"
                  : "border-transparent text-red-500 hover:text-red-600"
              }`}
            >
              <Flag className="h-3.5 w-3.5" />
              {tab.label}
              <span className="rounded-full bg-red-600 px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-white">
                {tab.count}
              </span>
            </button>
          ) : (
            <button
              key={tab.label}
              onClick={() => setActiveTab(tab.label)}
              className={`whitespace-nowrap border-b-2 pb-2.5 text-[13.5px] transition-colors ${
                activeTab === tab.label
                  ? "border-gray-900 font-semibold text-gray-900"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label} (<span className="font-mono">{tab.count}</span>)
            </button>
          )
        )}
      </div>

      <div className="mb-4 flex flex-col gap-2.5 lg:flex-row lg:flex-wrap lg:items-center">
        <div className="relative w-full lg:min-w-[280px] lg:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher par reference, client ou telephone."
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-[13px] text-gray-700 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto lg:flex-wrap lg:overflow-visible">
          {dateRanges.map((range) => (
            <div key={range} className="relative">
              <button
                onClick={() => {
                  if (range === "Personnalisee") {
                    setActiveRange(range);
                    setCalendarOpen((v) => !v);
                  } else {
                    setActiveRange(range);
                    setCalendarOpen(false);
                  }
                }}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition-colors ${
                  activeRange === range
                    ? "bg-gray-900 text-white"
                    : "border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {range === "Maximum" && <Calendar className="h-3.5 w-3.5" />}
                {range === "Personnalisee" && customRange
                  ? customRangeLabel
                  : range}
              </button>
              {range === "Personnalisee" && calendarOpen && (
                <DateRangeCalendar
                  initialStart={customRange?.start}
                  initialEnd={customRange?.end}
                  onApply={(start, end) => {
                    setCustomRange({ start, end });
                    setActiveRange("Personnalisee");
                    setCalendarOpen(false);
                  }}
                  onClear={() => {
                    setCustomRange(null);
                    setActiveRange("Maximum");
                    setCalendarOpen(false);
                  }}
                  onCancel={() => setCalendarOpen(false)}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/*
        Barre de filtres toujours visible, sur une seule ligne juste au-dessus
        des commandes. `filtersResetKey` remonte les pastilles pour vider leur
        selection interne quand on reinitialise depuis ici.
      */}
      <div className="relative z-20 mb-3 flex flex-wrap items-center gap-2">
        <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-gray-400" />
        <SelectDropdown
          key={`produits-${filtersResetKey}`}
          variant="chip"
          icon={Package}
          panelTitle="Produits"
          pinnedLabel="Produits"
          allLabel="Tous les produits"
          options={filterOptions.produits}
          multi
          searchable
          searchPlaceholder="Rechercher un produit..."
          onMultiChange={(v) => setFilters((f) => ({ ...f, produits: v }))}
        />
        <SelectDropdown
          key={`sources-${filtersResetKey}`}
          variant="chip"
          icon={Tag}
          panelTitle="Source"
          pinnedLabel="Source"
          allLabel="Toutes les sources"
          options={filterOptions.sources}
          multi
          onMultiChange={(v) => setFilters((f) => ({ ...f, sources: v }))}
        />
        <SelectDropdown
          key={`agents-${filtersResetKey}`}
          variant="chip"
          icon={User}
          panelTitle="Assigne a"
          pinnedLabel="Assigne a"
          allLabel="Tous les agents"
          options={filterOptions.agents}
          multi
          searchable
          onMultiChange={(v) => setFilters((f) => ({ ...f, agents: v }))}
        />
        <SelectDropdown
          key={`confirmation-${filtersResetKey}`}
          variant="chip"
          icon={CheckCircle2}
          panelTitle="Statut de confirmation"
          pinnedLabel="Confirmation"
          allLabel="Tous les statuts"
          options={filterOptions.confirmation}
          multi
          onMultiChange={(v) => setFilters((f) => ({ ...f, confirmation: v }))}
        />
        <SelectDropdown
          key={`livraison-${filtersResetKey}`}
          variant="chip"
          icon={Truck}
          panelTitle="Statut livraison"
          pinnedLabel="Livraison"
          allLabel="Tous les statuts"
          options={filterOptions.livraison}
          multi
          onMultiChange={(v) => setFilters((f) => ({ ...f, livraison: v }))}
        />
        <SelectDropdown
          key={`paiement-${filtersResetKey}`}
          variant="chip"
          icon={Wallet}
          panelTitle="Statut paiement"
          pinnedLabel="Paiement"
          allLabel="Tous les statuts"
          options={filterOptions.paiement}
          multi
          onMultiChange={(v) => setFilters((f) => ({ ...f, paiement: v }))}
        />
        {activeFilterCount > 0 && (
          <button
            onClick={resetFilters}
            className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1.5 text-[12.5px] font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-3.5 w-3.5" />
            <span>
              Reinitialiser (<span className="font-mono">{activeFilterCount}</span>)
            </span>
          </button>
        )}
      </div>

      <div className="mb-3 flex items-center justify-between lg:hidden">
        <p className="text-[13px] text-gray-500">
          <span className="font-mono">
            {visibleLeads.length.toLocaleString("fr-FR")}
          </span>{" "}
          resultats
        </p>
        <label className="flex items-center gap-1.5 text-[12.5px] text-gray-600">
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={toggleSelectAll}
            className="h-4 w-4 rounded border-gray-300"
          />
          Selectionner tout
        </label>
      </div>

      <div className="hidden rounded-xl border border-gray-200 bg-white lg:block">
        {selectedCount > 0 ? (
          <div className="flex items-center justify-between border-b border-gray-100 bg-blue-50/60 px-5 py-3">
            <p className="text-[13px] font-medium text-blue-700">
              <span className="font-mono">{selectedCount}</span> selectionne
              {selectedCount > 1 ? "s" : ""}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  setModal({ type: "assign", leadIds: Array.from(selectedIds) })
                }
                className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-[12.5px] font-medium text-gray-700 hover:bg-gray-50"
              >
                <UserPlus className="h-3.5 w-3.5" />
                Assigner
              </button>
              <button
                onClick={() =>
                  setModal({ type: "status", leadIds: Array.from(selectedIds) })
                }
                className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-[12.5px] font-medium text-gray-700 hover:bg-gray-50"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Changer statut
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="flex items-center gap-1 px-2 py-1.5 text-[12.5px] font-medium text-gray-500 hover:text-gray-700"
              >
                <X className="h-3.5 w-3.5" />
                Deselectionner
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <div className="flex items-center gap-2.5">
              <ShoppingCart className="h-4 w-4 text-gray-600" />
              <div>
                <p className="text-[14px] font-semibold text-gray-900">
                  Leads &amp; Commandes
                </p>
                {/* Les filtres sont maintenant toujours visibles juste
                    au-dessus : ce compteur doit suivre la liste affichee,
                    pas le seul onglet actif. */}
                <p className="text-[12.5px] text-gray-500">
                  <span className="font-mono">
                    {visibleLeads.length.toLocaleString("fr-FR")}
                  </span>{" "}
                  resultats
                </p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleSelectAll}
              className="h-4 w-4 rounded border-gray-300"
            />
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1420px] text-left">
            <thead>
              <tr className="border-b border-gray-100 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                <th className="w-10 px-5 py-3">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                </th>
                <th className="px-3 py-3">Date</th>
                <th className="px-3 py-3">Reference</th>
                <th className="px-3 py-3">Produits</th>
                <th className="px-3 py-3">Client</th>
                <th className="px-3 py-3">Ville / Tarif</th>
                <th className="px-3 py-3">Source</th>
                <th className="px-3 py-3">Assigne a</th>
                <th className="px-3 py-3">Montant</th>
                <th className="px-3 py-3">Statut</th>
                <th className="px-3 py-3">Transporteur</th>
                <th className="px-3 py-3">Code suivi</th>
                <th className="px-3 py-3">Statut livraison</th>
                <th className="px-3 py-3">Statut paiement</th>
                <th className="px-3 py-3">Date de livraison</th>
                <th className="w-10 px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={16} className="px-5 py-12 text-center">
                    <div className="flex flex-col items-center gap-2 text-gray-400">
                      <Loader2 className="h-6 w-6 animate-spin" />
                      <p className="text-[13px]">Chargement des commandes...</p>
                    </div>
                  </td>
                </tr>
              )}
              {!loading && visibleLeads.length === 0 && (
                <tr>
                  <td colSpan={16} className="px-5 py-12 text-center">
                    <div className="flex flex-col items-center gap-2 text-gray-400">
                      <Inbox className="h-6 w-6" />
                      <p className="text-[13px]">
                        Aucune commande dans cette categorie.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
              {visibleLeads.map((lead) => (
                <tr
                  key={lead.id}
                  className="border-b border-gray-50 text-[13px] text-gray-700 last:border-0 hover:bg-gray-50/60"
                >
                  <td className="px-5 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(lead.id)}
                      onChange={() => toggleSelect(lead.id)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 font-mono text-gray-500">
                    {lead.date}
                  </td>
                  <td className="px-3 py-3 font-medium text-gray-800">
                    {lead.reference}
                  </td>
                  <td className="px-3 py-3">
                    {(() => {
                      const ProductIcon = productIcon(lead.productName);
                      return (
                        <div className="flex items-center gap-2">
                          {lead.productImage ? (
                            <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-md border border-gray-100 bg-gray-50">
                              <Image
                                src={lead.productImage}
                                alt=""
                                fill
                                sizes="32px"
                                className="object-cover"
                                unoptimized
                              />
                            </div>
                          ) : (
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-500">
                              <ProductIcon className="h-3.5 w-3.5" />
                            </div>
                          )}
                          {lead.productName && (
                            <span
                              title={lead.productName}
                              className="max-w-[150px] truncate text-[12.5px] text-gray-700"
                            >
                              {lead.productName}
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1.5">
                      <p className="font-medium text-gray-800">{lead.client}</p>
                      {lead.itemCount && lead.itemCount > 1 && (
                        <span className="flex items-center gap-0.5 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10.5px] font-medium text-gray-500">
                          <Package className="h-2.5 w-2.5" />
                          x{lead.itemCount}
                        </span>
                      )}
                    </div>
                    <p className="font-mono text-[12px] text-gray-400">{lead.phone}</p>
                  </td>
                  <td className="px-3 py-3">
                    {lead.ville && (
                      <p className="flex items-center gap-1 text-gray-700">
                        <MapPin className="h-3 w-3 text-gray-400" />
                        {lead.ville}
                      </p>
                    )}
                    <p className="flex items-center gap-1 font-mono text-[12px] text-gray-400">
                      <Tag className="h-3 w-3" />
                      {lead.tarif ?? "Sans tarif"}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`rounded-md px-2 py-1 text-[12px] font-medium ${sourceBadgeStyles[lead.source]}`}
                    >
                      {lead.source}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-gray-600">
                    {lead.assignedTo}
                  </td>
                  <td className="px-3 py-3 font-mono font-semibold text-gray-900">
                    {lead.amount}
                  </td>
                  <td className="px-3 py-3">
                    {(() => {
                      const StatusIcon = statusIcons[lead.status];
                      return (
                        <span
                          className={`flex w-fit items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium ${statusBadgeStyles[lead.status]}`}
                        >
                          <StatusIcon className="h-3 w-3" />
                          {lead.status}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    {lead.trackingNumber ? (
                      <span className="flex w-fit items-center gap-1 rounded-md bg-orange-50 px-2 py-1 text-[12px] font-medium text-orange-600">
                        <Truck className="h-3 w-3" />
                        {CARRIER_NAME}
                      </span>
                    ) : (
                      <span className="text-[12px] text-gray-300">&mdash;</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    {sendingToForceLog.has(lead.id) ? (
                      <span className="flex items-center gap-1.5 text-[12px] text-gray-400">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Envoi...
                      </span>
                    ) : lead.trackingNumber ? (
                      <span className="font-mono text-[12px] font-medium text-gray-800">
                        {lead.trackingNumber}
                      </span>
                    ) : lead.trackingError ? (
                      <span
                        title={lead.trackingError}
                        className="flex max-w-[160px] items-center gap-1 truncate text-[12px] font-medium text-red-600"
                      >
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{lead.trackingError}</span>
                      </span>
                    ) : (
                      <span className="text-[12px] text-gray-300">&mdash;</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    {lead.deliveryStatus ? (
                      <span
                        className={`rounded-md px-2 py-1 text-[12px] font-medium ${
                          deliveryStatusStyles[lead.deliveryStatusCode ?? ""] ??
                          "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {lead.deliveryStatus}
                      </span>
                    ) : (
                      <span className="text-[12px] text-gray-300">&mdash;</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    {lead.paymentStatus ? (
                      <span
                        className={`rounded-md px-2 py-1 text-[12px] font-medium ${paymentStatusStyle(lead.paymentStatus)}`}
                      >
                        {lead.paymentStatus}
                      </span>
                    ) : (
                      <span className="text-[12px] text-gray-300">&mdash;</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    {lead.deliveryDate ? (
                      <span className="font-mono text-[12px] text-gray-600">
                        {lead.deliveryDate}
                      </span>
                    ) : (
                      <span className="text-[12px] text-gray-300">&mdash;</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <RowActionsMenu {...getRowActions(lead)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3">
          <p className="text-[12px] text-gray-500">
            <span className="font-mono">
              {visibleLeads.length > 0 ? 1 : 0}-{visibleLeads.length} /{" "}
              {visibleLeads.length}
            </span>{" "}
            resultats
          </p>
          <div className="flex items-center gap-2">
            <button
              disabled
              className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 text-gray-300"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="text-[12px] text-gray-600">
              Page <span className="font-mono">1 / 1</span>
            </span>
            <button
              disabled
              className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 text-gray-300"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-3 lg:hidden">
        {loading && (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white py-12 text-gray-400">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-[13px]">Chargement des commandes...</p>
          </div>
        )}
        {!loading && visibleLeads.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white py-12 text-gray-400">
            <Inbox className="h-6 w-6" />
            <p className="text-[13px]">Aucune commande dans cette categorie.</p>
          </div>
        )}
        {visibleLeads.map((lead) => {
          const actions = getRowActions(lead);
          return (
            <div
              key={lead.id}
              className="rounded-xl border border-gray-200 bg-white p-3.5"
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`rounded-md px-2 py-1 text-[11.5px] font-medium ${sourceBadgeStyles[lead.source]}`}
                  >
                    {lead.source}
                  </span>
                  <span
                    className={`rounded-md px-2 py-1 text-[11.5px] font-medium ${statusBadgeStyles[lead.status]}`}
                  >
                    {lead.status}
                  </span>
                </div>
                <RowActionsMenu {...actions} />
              </div>

              <div className="mb-3 flex gap-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-[10px] font-medium text-gray-400">
                  {lead.productLabel}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-gray-900">
                    {lead.client}
                  </p>
                  <p className="font-mono text-[12.5px] text-gray-400">{lead.phone}</p>
                  <p className="mt-1 flex items-center gap-1 text-[12.5px] text-gray-500">
                    <User className="h-3 w-3" />
                    {lead.assignedTo}
                  </p>
                </div>
              </div>

              <div className="mb-2 flex items-center justify-between">
                {lead.trackingNumber ? (
                  <span className="flex items-center gap-1 rounded-md bg-orange-50 px-2 py-1 text-[11.5px] font-medium text-orange-600">
                    <Truck className="h-3 w-3" />
                    {CARRIER_NAME}
                  </span>
                ) : (
                  <span />
                )}
                <span className="font-mono text-[16px] font-semibold text-gray-900">
                  {lead.amount}
                </span>
              </div>

              <p className="mb-1 font-mono text-[12px] text-gray-400">{lead.date}</p>

              {lead.deliveryDate && (
                <p className="mb-1 flex items-center gap-1.5 font-mono text-[12px] text-emerald-600">
                  <CheckCircle2 className="h-3 w-3" />
                  Livre le {lead.deliveryDate}
                </p>
              )}

              <div className="mb-3">
                {sendingToForceLog.has(lead.id) ? (
                  <span className="flex items-center gap-1.5 text-[12px] text-gray-400">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Envoi vers ForceLog...
                  </span>
                ) : lead.trackingNumber ? (
                  <span className="flex items-center gap-1.5 font-mono text-[12px] font-medium text-gray-700">
                    <Truck className="h-3.5 w-3.5 text-gray-400" />
                    {lead.trackingNumber}
                  </span>
                ) : lead.trackingError ? (
                  <span className="flex items-center gap-1.5 text-[12px] font-medium text-red-600">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    {lead.trackingError}
                  </span>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={actions.onViewDetails}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 py-2 text-[12.5px] font-medium text-gray-700 hover:bg-gray-50"
                >
                  <Eye className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Voir details</span>
                </button>
                <button
                  onClick={actions.onCall}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 py-2 text-[12.5px] font-medium text-gray-700 hover:bg-gray-50"
                >
                  <Phone className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Appeler</span>
                </button>
                <button
                  onClick={actions.onCopyContact}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 py-2 text-[12.5px] font-medium text-gray-700 hover:bg-gray-50"
                >
                  <Copy className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Copier numero</span>
                </button>
                <button
                  onClick={actions.onDelete}
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-red-600 py-2 text-[12.5px] font-medium text-white hover:bg-red-700"
                >
                  <Trash2 className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Supprimer commande</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={() => setModal({ type: "create" })}
        className="fixed bottom-5 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-gray-900 text-white shadow-lg hover:bg-gray-800 lg:hidden"
      >
        <Plus className="h-6 w-6" />
      </button>

      {modal?.type === "create" && (
        <CreateCommandeModal
          onClose={() => setModal(null)}
          onCreated={(lead) => setLeadsState((prev) => [lead, ...prev])}
        />
      )}
      {modal?.type === "details" && (
        <OrderDetailsModal
          lead={modal.lead}
          onClose={() => setModal(null)}
          onEdit={() => setModal({ type: "edit", lead: modal.lead })}
        />
      )}
      {modal?.type === "edit" && (
        <EditOrderModal
          lead={modal.lead}
          onClose={() => setModal(null)}
          onSave={() => setModal(null)}
        />
      )}
      {modal?.type === "status" && (
        <ChangeStatusModal
          count={modal.leadIds.length}
          onClose={() => setModal(null)}
          onApply={applyStatus}
        />
      )}
      {modal?.type === "assign" && (
        <AssignModal
          count={modal.leadIds.length}
          onClose={() => setModal(null)}
          onApply={applyAssign}
        />
      )}
    </div>
  );
}
