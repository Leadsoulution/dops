"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Download,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Search,
  Tag,
  Trash2,
  Truck,
  Upload,
  X,
} from "lucide-react";
import type { City, TariffSource } from "@/lib/supabase/cities";
import { CARRIERS, carrierInfo } from "@/lib/carriers/registry";
import AnchoredMenu from "./AnchoredMenu";

/**
 * Une ville, et qui la dessert.
 *
 * La couverture n'est pas stockee : elle se deduit du code ForceLog
 * pose sur la ville et de la liste de Speedaf, et le serveur la joint
 * a la lecture.
 */
type VilleListee = City & { carriers?: string[] };
import CityModal from "./CityModal";
import CityAliasesModal from "./CityAliasesModal";

/** Libelle affiche sous le tarif, selon son origine. */
const TARIFF_LABELS: Record<TariffSource, string> = {
  force: "Prix force",
  canonique: "Tarif canonique",
  transporteur: "Prix transporteur",
};

const TARIFF_STYLES: Record<TariffSource, string> = {
  force: "text-emerald-600",
  canonique: "text-gray-400",
  transporteur: "text-blue-500",
};

function formatUpdatedAt(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export default function VillesPage() {
  const [cities, setCities] = useState<VilleListee[]>([]);
  const [importMenu, setImportMenu] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editCity, setEditCity] = useState<City | "new" | null>(null);
  const [aliasCity, setAliasCity] = useState<City | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const importBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/cities");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCities(data.cities ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chargement impossible.");
    } finally {
      setLoading(false);
    }
  }

  const query = searchQuery.trim().toLowerCase();
  const visibleCities = query
    ? cities.filter(
        (c) =>
          c.key.toLowerCase().includes(query) ||
          c.name.toLowerCase().includes(query) ||
          c.aliases.some((a) => a.toLowerCase().includes(query))
      )
    : cities;

  const allSelected =
    visibleCities.length > 0 &&
    visibleCities.every((c) => selectedIds.has(c.id));

  function toggleSelectAll() {
    setSelectedIds(
      allSelected ? new Set() : new Set(visibleCities.map((c) => c.id))
    );
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Enregistre un changement en base, l'ecran suit la reponse. */
  async function patchCity(id: string, changes: Partial<City>) {
    const previous = cities;
    setCities((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...changes } : c))
    );
    try {
      const res = await fetch(`/api/cities/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCities((prev) => prev.map((c) => (c.id === id ? data.city : c)));
    } catch (err) {
      setCities(previous);
      setError(err instanceof Error ? err.message : "Enregistrement impossible.");
    }
  }

  async function removeSelected() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    const previous = cities;
    setCities((prev) => prev.filter((c) => !selectedIds.has(c.id)));
    setSelectedIds(new Set());
    try {
      const res = await fetch("/api/cities", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
    } catch (err) {
      setCities(previous);
      setError(err instanceof Error ? err.message : "Suppression impossible.");
    }
  }

  function exportCsv() {
    const header = [
      "cle",
      "ville",
      "alias",
      "tarif",
      "origine_tarif",
      "commandes",
      "actif",
      "mis_a_jour",
    ];
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const rows = visibleCities.map((c) =>
      [
        c.key,
        c.name,
        c.aliases.join("|"),
        String(c.tariff),
        c.tariffSource,
        String(c.orders),
        c.active ? "oui" : "non",
        c.updatedAt,
      ]
        .map(escape)
        .join(",")
    );
    // Le BOM garde les accents lisibles a l'ouverture dans Excel.
    const csv = `﻿${header.join(",")}\n${rows.join("\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `villes-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  /** Import d'un CSV : cle, ville, alias separes par |, tarif. */
  async function importFile(file: File) {
    setBusy("fichier");
    setError(null);
    try {
      const text = await file.text();
      const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter(Boolean);
      const cells = (line: string) =>
        (line.match(/("([^"]|"")*"|[^,]*)(,|$)/g) ?? []).map((c) =>
          c.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"').trim()
        );

      const head = cells(lines[0]).map((h) => h.toLowerCase());
      // Un fichier sans en-tete reste importable : on suppose alors
      // l'ordre cle, ville, alias, tarif.
      const hasHeader = head.includes("ville") || head.includes("cle");
      const col = (name: string, fallback: number) => {
        const i = head.indexOf(name);
        return i >= 0 ? i : fallback;
      };
      const iKey = col("cle", 0);
      const iName = col("ville", 1);
      const iAlias = col("alias", 2);
      const iTariff = col("tarif", 3);

      const parsed = (hasHeader ? lines.slice(1) : lines)
        .map(cells)
        .filter((c) => c[iName] || c[iKey])
        .map((c) => ({
          key: c[iKey] || undefined,
          name: c[iName] || c[iKey],
          aliases: c[iAlias] ? c[iAlias].split("|").filter(Boolean) : [],
          tariff: Number(c[iTariff]) || 0,
          tariffSource: "canonique" as const,
        }));

      if (parsed.length === 0) throw new Error("Aucune ligne exploitable dans ce fichier.");

      const res = await fetch("/api/cities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cities: parsed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setNotice(
        `${data.inserted} ville(s) ajoutee(s), ${data.updated} mise(s) a jour.`
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import impossible.");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function importCarrier(carrier: string) {
    setBusy("transporteur");
    setImportMenu(false);
    setError(null);
    try {
      const res = await fetch("/api/cities/import-carrier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ carrier }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setNotice(
        carrier === "speedaf"
          ? `${data.ajoutees} ville(s) Speedaf ajoutee(s) au dictionnaire, ${data.deja} deja connue(s).`
          : `${data.total} ville(s) ForceLog : ${data.inserted} ajoutee(s), ${data.updated} mise(s) a jour.`
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import impossible.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="scrollbar-hide flex-1 overflow-y-auto bg-gray-50 px-4 py-4 lg:px-6 lg:py-5">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100">
            <MapPin className="h-4 w-4 text-gray-600" />
          </div>
          <div>
            <h1 className="text-h1 font-semibold text-gray-900">
              Villes de livraison
            </h1>
            <p className="text-[13px] text-gray-500">
              <span className="font-mono">{cities.length}</span> villes au
              dictionnaire
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <p className="text-[13px] text-red-700">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="rounded-md p-0.5 text-red-400 hover:text-red-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {notice && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="text-[13px] text-emerald-700">{notice}</p>
          <button
            onClick={() => setNotice(null)}
            className="rounded-md p-0.5 text-emerald-400 hover:text-emerald-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="mb-4 flex flex-col gap-2.5 lg:flex-row lg:items-center">
        <div className="relative w-full lg:min-w-[260px] lg:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher par cle, ville ou alias..."
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-[13px] text-gray-700 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={exportCsv}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-50"
          >
            <Download className="h-3.5 w-3.5" />
            Exporter CSV
          </button>

          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importFile(file);
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy !== null}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            {busy === "fichier" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            Importer fichier
          </button>

          <button
            ref={importBtnRef}
            onClick={() => setImportMenu((v) => !v)}
            disabled={busy !== null}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            {busy === "transporteur" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Truck className="h-3.5 w-3.5" />
            )}
            Importer d&apos;un transporteur
          </button>
          {/*
            Deux transporteurs, deux listes : celle de ForceLog porte
            ses tarifs par ville, celle de Speedaf n'apporte que les
            villes qui manquent. Le choix se fait ici plutot que par un
            second bouton, pour qu'un troisieme transporteur ne
            s'ajoute pas a la barre.
          */}
          <AnchoredMenu
            open={importMenu}
            anchorRef={importBtnRef}
            onClose={() => setImportMenu(false)}
            width={232}
          >
            <div className="py-1">
              {CARRIERS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => void importCarrier(c.id)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50"
                >
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold ${c.logo.bg} ${c.logo.fg}`}
                  >
                    {c.logo.letter}
                  </span>
                  <span>
                    <span className="block text-[13px] text-gray-700">
                      Villes {c.name}
                    </span>
                    <span className="block text-[11.5px] text-gray-400">
                      {c.id === "speedaf"
                        ? "Ajoute celles qui manquent"
                        : "Villes et tarifs"}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </AnchoredMenu>

          <button
            onClick={() => setEditCity("new")}
            className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-gray-800"
          >
            <Plus className="h-3.5 w-3.5" />
            Ajouter une ville canonique
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div>
            <p className="text-[14px] font-semibold text-gray-900">
              Dictionnaire des villes canoniques
            </p>
            <p className="text-[12.5px] text-gray-500">
              Villes globales et alias utilises pour la normalisation a la
              capture/import.
            </p>
          </div>
          {selectedIds.size > 0 && (
            <button
              onClick={removeSelected}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-[12.5px] font-medium text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Supprimer (<span className="font-mono">{selectedIds.size}</span>)
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead>
              <tr className="border-b border-gray-100 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                <th className="w-10 px-5 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                </th>
                <th className="px-3 py-3">Ville canonique</th>
                <th className="px-3 py-3">Transporteurs</th>
                <th className="px-3 py-3">Tarif de livraison</th>
                <th className="px-3 py-3">Commandes</th>
                <th className="px-3 py-3">Etat</th>
                <th className="px-3 py-3">Mis a jour</th>
                <th className="px-3 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center">
                    <div className="flex flex-col items-center gap-2 text-gray-400">
                      <Loader2 className="h-6 w-6 animate-spin" />
                      <p className="text-[13px]">Chargement des villes...</p>
                    </div>
                  </td>
                </tr>
              )}
              {!loading && visibleCities.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center">
                    <div className="flex flex-col items-center gap-2 text-gray-400">
                      <MapPin className="h-6 w-6" />
                      <p className="text-[13px]">
                        {cities.length === 0
                          ? "Aucune ville. Importez celles de ForceLog pour demarrer."
                          : "Aucune ville ne correspond a cette recherche."}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
              {visibleCities.map((city) => (
                <tr
                  key={city.id}
                  className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60"
                >
                  <td className="px-5 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(city.id)}
                      onChange={() => toggleSelect(city.id)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13.5px] font-semibold text-gray-900">
                        {city.name}
                      </span>
                      <span className="flex items-center gap-1 rounded-md bg-gray-100 px-1.5 py-0.5 text-[10.5px] font-medium text-gray-500">
                        <span className="font-mono">{city.aliases.length}</span>
                        <Tag className="h-2.5 w-2.5" />
                      </span>
                    </div>
                    <p className="font-mono text-[12px] text-gray-400">
                      {city.key}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <div className="flex items-center gap-1">
                      {(city.carriers ?? []).length === 0 ? (
                        <span className="text-[12px] text-gray-300">&mdash;</span>
                      ) : (
                        (city.carriers ?? []).map((id) => {
                          const { name, logo } = carrierInfo(id);
                          return (
                            <span
                              key={id}
                              title={name}
                              className={`rounded-md px-1.5 py-0.5 text-[10.5px] font-bold ${logo.bg} ${logo.fg}`}
                            >
                              {logo.letter}
                            </span>
                          );
                        })
                      )}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <p className="font-mono text-[13px] font-semibold text-gray-900">
                      {city.tariff.toFixed(2).replace(".", ",")} MAD
                    </p>
                    <p className={`text-[11.5px] ${TARIFF_STYLES[city.tariffSource]}`}>
                      {TARIFF_LABELS[city.tariffSource]}
                    </p>
                  </td>
                  <td className="px-3 py-3 font-mono text-[13px] text-gray-700">
                    {city.orders.toLocaleString("fr-FR")}
                  </td>
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={city.active}
                      aria-label={`${city.active ? "Desactiver" : "Activer"} ${city.name}`}
                      onClick={() =>
                        void patchCity(city.id, { active: !city.active })
                      }
                      className={`flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${
                        city.active ? "bg-gray-900" : "bg-gray-200"
                      }`}
                    >
                      <span
                        className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${
                          city.active ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 font-mono text-[12px] text-gray-500">
                    {formatUpdatedAt(city.updatedAt)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditCity(city)}
                        title="Modifier la ville"
                        className="rounded-md border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setAliasCity(city)}
                        title="Gerer les alias"
                        className="rounded-md border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                      >
                        <Tag className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editCity && (
        <CityModal
          city={editCity === "new" ? null : editCity}
          onClose={() => setEditCity(null)}
          onSaved={(city) => {
            setCities((prev) => {
              const exists = prev.some((c) => c.id === city.id);
              return exists
                ? prev.map((c) => (c.id === city.id ? city : c))
                : [...prev, city].sort((a, b) => a.name.localeCompare(b.name));
            });
            setEditCity(null);
          }}
        />
      )}

      {aliasCity && (
        <CityAliasesModal
          city={aliasCity}
          onClose={() => setAliasCity(null)}
          onSaved={(aliases) => {
            void patchCity(aliasCity.id, { aliases });
            setAliasCity(null);
          }}
        />
      )}
    </div>
  );
}
