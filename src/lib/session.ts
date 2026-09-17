"use client";

import type { SessionProfile } from "@/lib/supabase/auth";

/**
 * Le profil connecte, demande une seule fois.
 *
 * Quatre composants veulent savoir qui est connecte — la barre laterale
 * pour ses acces, l'en-tete pour l'avatar, la liste des commandes pour
 * les suppressions, les parametres pour l'edition. Chacun le demandait
 * de son cote : quatre requetes identiques au chargement, qui se
 * disputaient le serveur avec celle qui ramene les commandes.
 *
 * La promesse est retenue ici et partagee. L'identite ne change pas en
 * cours de session : la redemander n'apprendrait rien.
 */

let pending: Promise<SessionProfile | null> | null = null;

export function currentProfile(): Promise<SessionProfile | null> {
  if (!pending) {
    pending = fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => (data?.profile as SessionProfile) ?? null)
      .catch(() => null);
  }
  return pending;
}

/** Apres une connexion ou une deconnexion, l'identite est a redemander. */
export function forgetProfile() {
  pending = null;
}
