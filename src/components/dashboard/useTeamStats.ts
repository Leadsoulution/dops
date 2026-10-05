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

/**
 * Les statistiques deja calculees, gardees pour la session.
 *
 * Changer de periode puis revenir redemandait tout : neuf mille
 * evenements relus pour un resultat qu'on venait d'afficher. Le cache
 * vit en dehors du composant, donc il survit aux allers-retours entre
 * les pages de la confirmation.
 *
 * Il n'expire pas : les statistiques d'une periode close ne bougent
 * plus, et celles du jour se rafraichissent au rechargement de la
 * page. Mieux vaut un chiffre d'il y a dix minutes affiche
 * instantanement qu'un chiffre juste apres trois secondes d'attente —
 * surtout pour comparer deux periodes.
 */
const cache = new Map<string, TeamStats>();

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

  /*
   * Le cache se lit au rendu, pas depuis l'effet.
   *
   * Y poser l'etat declencherait un second rendu pour une valeur
   * qu'on avait deja sous la main, et React 19 refuse cette cascade.
   * Lu ici, le resultat garde est affiche du premier coup.
   */
  const garde = cache.get(key);

  useEffect(() => {
    if (cache.has(key)) return;

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
        else {
          cache.set(key, data);
          setLoaded({ key, data, error: null });
        }
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

  const aJour = garde !== undefined || loaded?.key === key;

  return {
    /*
     * Le resultat garde s'il existe, sinon celui de la periode
     * precedente le temps du calcul. Vider l'ecran pour le remplir
     * deux secondes plus tard donne l'impression que tout est a
     * refaire, alors qu'il ne manque qu'un chiffre.
     */
    stats: garde ?? loaded?.data ?? null,
    error: aJour ? (loaded?.error ?? null) : null,
    loading: !aJour,
  };
}

/** Oublie les statistiques gardees : apres un changement de donnees. */
export function clearTeamStatsCache() {
  cache.clear();
}
