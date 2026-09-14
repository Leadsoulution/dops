/**
 * Sections de l'application et droits d'acces.
 *
 * Une seule liste sert a trois choses : cocher les acces d'un compte,
 * masquer les entrees de la barre laterale, et refuser une page ouverte
 * par son adresse. Les separer aurait garanti qu'elles finissent par
 * diverger.
 *
 * Ce fichier ne contient volontairement aucun composant ni icone : il
 * est importe aussi bien par l'interface que par la couche serveur.
 */

export type AppSection = {
  key: string;
  label: string;
  href: string;
  /** Regroupement affiche dans la barre laterale. */
  group: string;
};

export const APP_SECTIONS: AppSection[] = [
  { key: "dashboard", label: "Tableau de bord", href: "/dashboard", group: "PRINCIPAL" },
  { key: "leads", label: "Leads / Commandes", href: "/", group: "PRINCIPAL" },
  { key: "confirmation", label: "Confirmation", href: "/confirmation", group: "PRINCIPAL" },
  { key: "perf-agents", label: "Perf. Agents", href: "/perf-agents", group: "PRINCIPAL" },
  { key: "products", label: "Produits", href: "/products", group: "COMMERCE" },
  { key: "integrations", label: "Integrations", href: "/integrations", group: "COMMERCE" },
  { key: "fournisseurs", label: "Fournisseurs", href: "/fournisseurs", group: "OPERATIONS" },
  { key: "villes", label: "Villes de livraison", href: "/villes", group: "DONNEES MAITRES" },
  { key: "finance", label: "Finance", href: "/finance", group: "GESTION" },
  { key: "utilisateurs", label: "Utilisateurs", href: "/utilisateurs", group: "GESTION" },
  { key: "parametres", label: "Parametres", href: "/parametres", group: "GESTION" },
];

export const ALL_SECTION_KEYS = APP_SECTIONS.map((s) => s.key);

/** Acces donnes par defaut a un nouvel agent. */
export const DEFAULT_AGENT_SECTIONS = ["leads", "confirmation"];

/**
 * Section correspondant a une adresse. "/" est un cas particulier :
 * c'est la page des commandes, et tout chemin la prefixerait.
 */
export function sectionForPath(pathname: string): AppSection | undefined {
  if (pathname === "/") return APP_SECTIONS.find((s) => s.href === "/");
  return APP_SECTIONS.find(
    (s) => s.href !== "/" && (pathname === s.href || pathname.startsWith(`${s.href}/`))
  );
}

/**
 * Section qu'un administrateur garde toujours : c'est depuis la page
 * Utilisateurs qu'on redonne un acces. La lui retirer fermerait la porte
 * a clef de l'interieur, sans personne pour rouvrir.
 */
export const ADMIN_LOCKED_SECTION = "utilisateurs";

/** Acces effectifs d'un compte, verrou administrateur compris. */
export function effectiveAccess(profile: {
  role: string;
  pageAccess: string[];
}): string[] {
  if (profile.role !== "Admin") return profile.pageAccess;
  return profile.pageAccess.includes(ADMIN_LOCKED_SECTION)
    ? profile.pageAccess
    : [...profile.pageAccess, ADMIN_LOCKED_SECTION];
}

/**
 * Chacun choisit les sections de sa barre laterale, administrateur
 * compris. Seule la page Utilisateurs reste imposee a un administrateur.
 */
export function canAccess(
  profile: { role: string; pageAccess: string[] } | null,
  pathname: string
): boolean {
  if (!profile) return false;
  const section = sectionForPath(pathname);
  // Une page hors liste (page inconnue) n'est pas une page protegee.
  if (!section) return true;
  return effectiveAccess(profile).includes(section.key);
}

/** Premiere page autorisee, ou renvoyer quelqu'un qui n'a rien a faire ici. */
export function firstAllowedHref(profile: {
  role: string;
  pageAccess: string[];
}): string {
  const allowed = effectiveAccess(profile);
  const section = APP_SECTIONS.find((s) => allowed.includes(s.key));
  return section?.href ?? "/utilisateurs";
}
