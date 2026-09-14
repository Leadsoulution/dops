"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Database, Loader2 } from "lucide-react";

type SizeInfo = {
  totalBytes: number;
  limitMb: number;
  tables: { name: string; bytes: number }[];
};

/** "18,3 Mo" : la meme unite que celle annoncee par Supabase. */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  const ko = bytes / 1024;
  if (ko < 1024) return `${ko.toFixed(1).replace(".", ",")} Ko`;
  const mo = ko / 1024;
  if (mo < 1024) return `${mo.toFixed(1).replace(".", ",")} Mo`;
  return `${(mo / 1024).toFixed(2).replace(".", ",")} Go`;
}

export default function DatabaseSizeCard() {
  const [info, setInfo] = useState<SizeInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/database")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) setError(data.error);
        else setInfo(data);
      })
      .catch(() => {
        if (!cancelled) setError("Taille de la base indisponible.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const limitBytes = (info?.limitMb ?? 500) * 1024 * 1024;
  const percent = info ? (info.totalBytes / limitBytes) * 100 : 0;

  // Vert tant qu'on est loin du plafond, ambre quand il approche, rouge
  // quand il est presque atteint : la couleur dit quand agir.
  const barColor =
    percent >= 90 ? "bg-red-500" : percent >= 75 ? "bg-amber-500" : "bg-emerald-500";
  const textColor =
    percent >= 90 ? "text-red-600" : percent >= 75 ? "text-amber-600" : "text-emerald-600";

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="mb-1 flex items-center gap-2 text-h3 font-semibold text-gray-900">
        <Database className="h-4 w-4 text-gray-400" />
        Taille de la base de donnees
      </p>
      <p className="mb-4 text-[12.5px] text-gray-500">
        L&apos;espace occupe par vos commandes, produits, villes et comptes.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 py-2 text-[13px] text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Lecture de la base...
        </div>
      ) : error ? (
        <p className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      ) : info ? (
        <>
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className={`h-full rounded-full transition-all ${barColor}`}
              // Un filet visible meme a 0,1 % : une barre vide laisserait
              // croire a une erreur de lecture.
              style={{ width: `${Math.max(1, Math.min(100, percent))}%` }}
            />
          </div>
          <p className={`mt-2 text-[12.5px] font-medium ${textColor}`}>
            <span className="font-mono">{formatSize(info.totalBytes)}</span> sur{" "}
            <span className="font-mono">{info.limitMb} Mo</span> utilises (
            <span className="font-mono">
              {percent.toFixed(1).replace(".", ",")}
            </span>
            %)
          </p>

          {percent >= 75 && (
            <p className="mt-2 text-[12px] text-amber-600">
              La base approche de son plafond. Archivez les anciennes commandes
              ou passez a une formule superieure.
            </p>
          )}

          {info.tables.length > 0 && (
            <>
              <button
                onClick={() => setDetailsOpen((v) => !v)}
                className="mt-3 text-[12px] font-medium text-blue-600 hover:underline"
              >
                {detailsOpen ? "Masquer le detail" : "Voir le detail par table"}
              </button>

              {detailsOpen && (
                <div className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-100">
                  {info.tables.map((table) => (
                    <div
                      key={table.name}
                      className="flex items-center justify-between px-3 py-1.5 text-[12.5px]"
                    >
                      <span className="font-mono text-gray-600">{table.name}</span>
                      <span className="font-mono text-gray-500">
                        {formatSize(table.bytes)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      ) : null}
    </div>
  );
}
