"use client";

import { useEffect, useState } from "react";
import type { TeamStats } from "./confirmation-data";

/**
 * Statistiques de l'equipe pour une periode, partagees par les trois
 * pages de la confirmation : l'accueil qui resume, la page des agents de
 * confirmation, celle de la livraison.
 *
 * Les trois posent la meme question au serveur et affichent le meme
 * selecteur de dates ; les separer aurait garanti que les bornes de
 * periode finissent par diverger d'une page a l'autre.
 */

export type Range = {
  label: string;
  custom: { start: Date; end: Date } | null;
};

/**
 * Bornes d'une periode. Fonction pure : le hook s'en sert, et les pages
 * qui interrogent une autre route aussi, pour qu'un meme choix couvre
 * partout le meme intervalle.
 *
 * Elles portent sur ce que les agents ont fait pendant l'intervalle, et
 * non sur la date des commandes : c'est le travail qui est mesure.
 */
export function periodBounds(range: Range): { from?: string; to?: string } {
  const now = new Date();
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const endOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  const span = (a: Date, b: Date) => ({
    from: a.toISOString(),
    to: b.toISOString(),
  });

  switch (range.label) {
    case "Aujourd'hui":
      return span(startOfDay(now), endOfDay(now));
    case "Hier": {
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      return span(startOfDay(yesterday), endOfDay(yesterday));
    }
    case "7 derniers jours": {
      // Aujourd'hui compris, donc six jours en arriere.
      const from = new Date(now);
      from.setDate(now.getDate() - 6);
      return span(startOfDay(from), endOfDay(now));
    }
    case "Ce mois-ci":
      return span(new Date(now.getFullYear(), now.getMonth(), 1), endOfDay(now));
    case "Personnalisee":
      return range.custom
        ? span(startOfDay(range.custom.start), endOfDay(range.custom.end))
        : {};
    // "Maximum" couvre tout l'historique.
    default:
      return {};
  }
}

export function useTeamStats(range: Range) {
  // Le resultat porte la periode pour laquelle il a ete calcule : c'est
  // la comparaison avec la periode affichee qui dit si l'on attend.
  const [loaded, setLoaded] = useState<{
    key: string;
    data: TeamStats | null;
    error: string | null;
  } | null>(null);

  const { from, to } = periodBounds(range);
  const key = `${from ?? ""}|${to ?? ""}`;

  useEffect(() => {
    let cancelled = false;
    const [start, end] = key.split("|");
    const params = new URLSearchParams();
    if (start) params.set("from", start);
    if (end) params.set("to", end);

    fetch(`/api/agents/stats?${params}`)
      .then((res) => res.json())
      .then((data: TeamStats & { error?: string }) => {
        if (cancelled) return;
        if (data.error) setLoaded({ key, data: null, error: data.error });
        else setLoaded({ key, data, error: null });
      })
      .catch(() => {
        if (!cancelled) {
          setLoaded({ key, data: null, error: "Statistiques indisponibles." });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [key]);

  return {
    stats: loaded?.data ?? null,
    error: loaded?.error ?? null,
    loading: loaded?.key !== key,
  };
}
