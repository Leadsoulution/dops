import {
  currencyOptions,
  languageOptions,
  timezoneOptions,
} from "@/components/dashboard/settings-data";

/**
 * Les reglages de l'espace, ranges avec ceux des integrations.
 *
 * Reglages d'equipe et non preferences personnelles : le nom de la
 * boutique et le telephone partent sur les etiquettes de colis, et
 * deux utilisateurs ne peuvent pas en avoir chacun une version.
 */
export const WORKSPACE_SETTINGS_ID = "workspace";

export type MediaStorage = "local" | "s3";

export type WorkspaceSettings = {
  shopName: string;
  email: string;
  phone: string;
  currency: string;
  timezone: string;
  language: string;
  mediaStorage: MediaStorage;
};

export const WORKSPACE_DEFAULTS: WorkspaceSettings = {
  shopName: "",
  email: "",
  phone: "",
  currency: currencyOptions[0],
  timezone: timezoneOptions[0],
  language: languageOptions[0],
  mediaStorage: "local",
};

const LONGUEUR_MAX = 200;

function texte(valeur: unknown, defaut: string): string {
  if (typeof valeur !== "string") return defaut;
  return valeur.trim().slice(0, LONGUEUR_MAX);
}

function parmi(valeur: unknown, choix: string[], defaut: string): string {
  return typeof valeur === "string" && choix.includes(valeur) ? valeur : defaut;
}

/**
 * Ce qui entre en base.
 *
 * Une liste deroulante ne protege de rien : la requete peut arriver
 * sans passer par l'ecran. Une devise inconnue reviendrait ensuite
 * dans la liste sans option correspondante, et l'ecran afficherait un
 * champ vide que personne ne saurait corriger.
 */
export function sanitizeWorkspace(brut: unknown): WorkspaceSettings {
  const o = (brut ?? {}) as Record<string, unknown>;
  return {
    shopName: texte(o.shopName, WORKSPACE_DEFAULTS.shopName),
    email: texte(o.email, WORKSPACE_DEFAULTS.email),
    phone: texte(o.phone, WORKSPACE_DEFAULTS.phone),
    currency: parmi(o.currency, currencyOptions, WORKSPACE_DEFAULTS.currency),
    timezone: parmi(o.timezone, timezoneOptions, WORKSPACE_DEFAULTS.timezone),
    language: parmi(o.language, languageOptions, WORKSPACE_DEFAULTS.language),
    mediaStorage: o.mediaStorage === "s3" ? "s3" : "local",
  };
}
