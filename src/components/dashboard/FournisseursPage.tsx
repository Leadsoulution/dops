"use client";

import { useState } from "react";
import {
  Building2,
  ChevronsLeft,
  ChevronsRight,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Eye,
  MoreVertical,
  Package2,
  Phone,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  TrendingUp,
} from "lucide-react";
import SelectDropdown from "./SelectDropdown";
import CreateFournisseurModal from "./CreateFournisseurModal";
import SupplierDetailModal from "./SupplierDetailModal";
import { suppliers as initialSuppliers, type Supplier } from "./fournisseurs-data";

const rowsPerPageOptions = ["10", "25", "50"];

export default function FournisseursPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>(initialSuppliers);
  const [searchQuery, setSearchQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [rowsPerPage, setRowsPerPage] = useState(rowsPerPageOptions[0]);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [detailSupplier, setDetailSupplier] = useState<Supplier | null>(null);

  const query = searchQuery.trim().toLowerCase();
  const visibleSuppliers = query
    ? suppliers.filter(
        (s) =>
          s.name.toLowerCase().includes(query) ||
          s.contactName.toLowerCase().includes(query) ||
          s.phone.includes(query) ||
          s.email.toLowerCase().includes(query)
      )
    : suppliers;

  const totalSuppliers = suppliers.length;
  const totalUnits = suppliers.reduce((sum, s) => sum + s.unitsSupplied, 0);
  const totalDue = suppliers.reduce((sum, s) => sum + s.balanceDue, 0);
  const totalPaid = suppliers.reduce((sum, s) => sum + s.paid, 0);

  return (
    <div className="scrollbar-hide flex-1 overflow-y-auto bg-gray-50 px-4 py-4 lg:px-6 lg:py-5">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100">
            <Building2 className="h-4 w-4 text-gray-600" />
          </div>
          <div>
            <h1 className="text-h1 font-semibold text-gray-900">
              Fournisseurs
            </h1>
            <p className="text-[13px] text-gray-500">
              <span className="font-mono">{totalSuppliers}</span> fournisseurs enregistres
            </p>
          </div>
        </div>

        <button
          onClick={() => setCreateOpen(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-gray-900 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-gray-800 sm:w-auto"
        >
          <Plus className="h-3.5 w-3.5" />
          Nouveau fournisseur
        </button>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-3.5">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-400">
                Total fournisseurs
              </p>
              <span className="flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600">
                <TrendingUp className="h-2.5 w-2.5" />
                Actifs
              </span>
            </div>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50">
              <Building2 className="h-4 w-4 text-blue-500" />
            </span>
          </div>
          <p className="font-mono text-[19px] font-semibold text-gray-900">
            {totalSuppliers}
          </p>
          <p className="text-[11px] text-gray-400">Tous operationnels</p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-3.5">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-400">
                Unites fournies
              </p>
              <span className="flex items-center gap-0.5 rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-600">
                <TrendingUp className="h-2.5 w-2.5" />
                Actuel
              </span>
            </div>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-50">
              <Package2 className="h-4 w-4 text-violet-500" />
            </span>
          </div>
          <p className="font-mono text-[19px] font-semibold text-gray-900">
            {totalUnits.toLocaleString("fr-FR")}
          </p>
          <p className="text-[11px] text-gray-400">ce mois</p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-3.5">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-400">
                Payable en cours
              </p>
              <span className="flex items-center gap-0.5 rounded-full bg-orange-50 px-1.5 py-0.5 text-[10px] font-medium text-orange-600">
                <TrendingUp className="h-2.5 w-2.5" />
                A jour
              </span>
            </div>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50">
              <DollarSign className="h-4 w-4 text-red-500" />
            </span>
          </div>
          <p className="font-mono text-[19px] font-semibold text-gray-900">
            {totalDue.toLocaleString("fr-FR")} MAD
          </p>
          <p className="text-[11px] text-gray-400">aucun retard</p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-3.5">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-400">
                Total paye
              </p>
              <span className="flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600">
                <TrendingUp className="h-2.5 w-2.5" />
                A jour
              </span>
            </div>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50">
              <DollarSign className="h-4 w-4 text-emerald-500" />
            </span>
          </div>
          <p className="font-mono text-[19px] font-semibold text-gray-900">
            {totalPaid.toLocaleString("fr-FR")} MAD
          </p>
          <p className="text-[11px] text-gray-400">historique cumule</p>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-2.5 lg:flex-row lg:flex-wrap lg:items-center">
        <div className="relative w-full lg:min-w-[280px] lg:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher fournisseur, contact, telephone ou email..."
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-[13px] text-gray-700 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none"
          />
        </div>
        <button
          onClick={() => setFiltersOpen((v) => !v)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-50 lg:w-auto"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filtres
        </button>
      </div>

      {filtersOpen && (
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SelectDropdown
            pinnedLabel="Tous les statuts"
            options={["Actif", "Inactif"]}
          />
          <SelectDropdown
            pinnedLabel="Toutes les echeances"
            options={["A jour", "En retard"]}
          />
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-5 py-4">
          <p className="text-h3 font-semibold text-gray-900">
            Liste des fournisseurs
          </p>
          <p className="text-[12.5px] text-gray-500">
            <span className="font-mono">{visibleSuppliers.length}</span> fournisseurs
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead>
              <tr className="border-b border-gray-100 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                <th className="px-5 py-3">Fournisseur</th>
                <th className="px-3 py-3">Contact</th>
                <th className="px-3 py-3">Produits</th>
                <th className="px-3 py-3">Fournis</th>
                <th className="px-3 py-3">Paye</th>
                <th className="px-3 py-3">Solde du</th>
                <th className="px-3 py-3">Echeance</th>
                <th className="w-10 px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {/*
                Un tableau vide sans un mot se lit comme une panne.
                Celui-ci dit pourquoi il est vide, et ce qu'il advient
                de ce qu'on y ajoute.
              */}
              {visibleSuppliers.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-16 text-center">
                    <p className="text-[13px] text-gray-500">
                      {query
                        ? "Aucun fournisseur ne correspond a cette recherche."
                        : "Aucun fournisseur enregistre."}
                    </p>
                    {!query && (
                      <p className="mx-auto mt-1 max-w-md text-[12px] text-gray-400">
                        Cette page n&apos;a pas encore de table en base : un
                        fournisseur ajoute ici disparait au rechargement.
                      </p>
                    )}
                  </td>
                </tr>
              )}
              {visibleSuppliers.map((supplier) => (
                <tr
                  key={supplier.id}
                  onClick={() => setDetailSupplier(supplier)}
                  className="cursor-pointer border-b border-gray-50 text-[13px] text-gray-700 last:border-0 hover:bg-gray-50/60"
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-100">
                        <Building2 className="h-3.5 w-3.5 text-gray-500" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-gray-800">
                          {supplier.name}
                        </p>
                        <p className="truncate text-[12px] text-gray-400">
                          {supplier.contactName}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-mono text-gray-600">{supplier.phone}</p>
                    <p className="text-[12px] text-gray-400">{supplier.email}</p>
                  </td>
                  <td className="px-3 py-3 font-mono text-gray-700">
                    {supplier.productsCount}
                  </td>
                  <td className="px-3 py-3 font-mono text-gray-700">
                    {supplier.unitsSupplied.toLocaleString("fr-FR")}
                  </td>
                  <td className="px-3 py-3 font-mono font-medium text-emerald-600">
                    {supplier.paid.toLocaleString("fr-FR")} MAD
                  </td>
                  <td className="px-3 py-3 font-mono font-medium text-red-600">
                    {supplier.balanceDue.toLocaleString("fr-FR")} MAD
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 font-mono text-gray-500">
                    {supplier.dueDate}
                  </td>
                  <td
                    className="relative px-3 py-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() =>
                        setOpenMenuId((v) =>
                          v === supplier.id ? null : supplier.id
                        )
                      }
                      className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                    {openMenuId === supplier.id && (
                      <div className="absolute right-3 top-full z-20 mt-1 w-48 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                        <button
                          onClick={() => {
                            setDetailSupplier(supplier);
                            setOpenMenuId(null);
                          }}
                          className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-gray-700 hover:bg-gray-50"
                        >
                          <Eye className="h-3.5 w-3.5 text-gray-400" />
                          Voir details
                        </button>
                        <button
                          disabled
                          title="Bientot disponible"
                          className="flex w-full cursor-not-allowed items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-gray-300"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Modifier
                        </button>
                        <a
                          href={`tel:${supplier.phone}`}
                          onClick={() => setOpenMenuId(null)}
                          className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-gray-700 hover:bg-gray-50"
                        >
                          <Phone className="h-3.5 w-3.5 text-gray-400" />
                          Appeler
                        </a>
                        <div className="mt-1 border-t border-gray-100 pt-1">
                          <button
                            onClick={() => {
                              setSuppliers((prev) =>
                                prev.filter((s) => s.id !== supplier.id)
                              );
                              setOpenMenuId(null);
                            }}
                            className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Supprimer
                          </button>
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-gray-100 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[12px] text-gray-500">
            <span className="font-mono">
              {visibleSuppliers.length > 0 ? 1 : 0}-{visibleSuppliers.length} /{" "}
              {visibleSuppliers.length}
            </span>{" "}
            resultats
          </p>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-[12px] text-gray-500">
              Lignes
              <div className="w-16">
                <SelectDropdown
                  pinnedLabel={rowsPerPage}
                  options={rowsPerPageOptions}
                  value={rowsPerPage}
                  onSelect={setRowsPerPage}
                />
              </div>
            </div>
            <span className="text-[12px] text-gray-600">
              Page <span className="font-mono">1 / 1</span>
            </span>
            <div className="flex items-center gap-1.5">
              <button
                disabled
                className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 text-gray-300"
              >
                <ChevronsLeft className="h-3.5 w-3.5" />
              </button>
              <button
                disabled
                className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 text-gray-300"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                disabled
                className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 text-gray-300"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
              <button
                disabled
                className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 text-gray-300"
              >
                <ChevronsRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {createOpen && (
        <CreateFournisseurModal onClose={() => setCreateOpen(false)} />
      )}
      {detailSupplier && (
        <SupplierDetailModal
          supplier={detailSupplier}
          onClose={() => setDetailSupplier(null)}
        />
      )}
    </div>
  );
}
