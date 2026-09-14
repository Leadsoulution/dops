export type UserRole = "Admin" | "Agent";
export type UserStatus = "Actif" | "Inactif";

export type Permissions = {
  suiviLivraison: boolean;
  importsExcel: boolean;
  creationProspects: boolean;
};

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  status: UserStatus;
  permissions: Permissions;
  leadsAssignes: number | null;
  confirmesAjd: number | null;
  tauxConv: number | null;
  derniereConnexion: string;
  avatarColor: string;
  /** Cles des sections que ce compte a le droit d'ouvrir. */
  pageAccess: string[];
};

// Les comptes viennent de la base : la page Utilisateurs les charge via
// /api/users. Aucune liste d'exemple ici, elle ne pourrait que mentir sur
// qui a reellement acces a l'application.

export const roleOptions = ["Admin", "Agent"];

/** Couleurs d'avatar tirees au sort a la creation d'un compte. */
export const avatarColors = [
  "bg-gray-900",
  "bg-blue-600",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-teal-500",
  "bg-indigo-500",
];
export const statusOptions = ["Actif", "Inactif"];
