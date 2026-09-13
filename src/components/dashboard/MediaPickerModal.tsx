"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { AlertCircle, ImageOff, Loader2, Search, Upload, X } from "lucide-react";

type MediaFile = { name: string; url: string; size: number };

/**
 * Bibliotheque d'images produits.
 *
 * Les fichiers sont ceux reellement deposes dans Supabase Storage, pas
 * une liste de noms d'exemple : ce qui est choisi ici s'affiche vraiment
 * sur la fiche produit.
 */
export default function MediaPickerModal({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (url: string) => void;
}) {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/uploads")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) setError(data.error);
        else setFiles(data.files ?? []);
      })
      .catch(() => {
        if (!cancelled) setError("Impossible de charger la bibliotheque.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      // L'image tout juste deposee arrive en tete et se selectionne
      // d'elle-meme : c'est celle qu'on venait chercher.
      setFiles((prev) => [data.file, ...prev]);
      setSelected(data.file.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import impossible.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const filtered = query
    ? files.filter((f) => f.name.toLowerCase().includes(query.toLowerCase()))
    : files;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-10">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-h2 font-semibold text-gray-900">
            Selectionner des medias
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher des fichiers"
                className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-[13px] text-gray-700 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none"
              />
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
              }}
            />
            <button
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              Importer
            </button>
          </div>

          {error && (
            <p className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}

          <p className="mt-3 text-[12px] text-gray-500">
            <span className="font-mono">{filtered.length}</span> media(s)
          </p>

          <div className="mt-2 max-h-[320px] overflow-y-auto">
            {loading ? (
              <div className="flex flex-col items-center gap-2 py-12 text-gray-400">
                <Loader2 className="h-6 w-6 animate-spin" />
                <p className="text-[13px]">Chargement...</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-gray-400">
                <ImageOff className="h-6 w-6" />
                <p className="text-[13px]">
                  {files.length === 0
                    ? "Aucune image. Importez-en une depuis votre ordinateur."
                    : "Aucun fichier ne correspond."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {filtered.map((file) => (
                  <button
                    key={file.name}
                    onClick={() => setSelected(file.url)}
                    className={`overflow-hidden rounded-lg border text-left transition-colors ${
                      selected === file.url
                        ? "border-blue-500 ring-2 ring-blue-100"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <div className="relative h-24 w-full bg-gray-50">
                      <Image
                        src={file.url}
                        alt={file.name}
                        fill
                        sizes="160px"
                        className="object-contain"
                        unoptimized
                      />
                    </div>
                    <p className="truncate border-t border-gray-100 px-2 py-1.5 text-[11px] text-gray-600">
                      {file.name}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2.5 border-t border-gray-100 px-5 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-50"
          >
            Annuler
          </button>
          <button
            onClick={() => selected && onSelect(selected)}
            disabled={!selected}
            className="rounded-lg bg-gray-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-gray-800 disabled:opacity-40"
          >
            Terminer{selected ? " (1)" : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
