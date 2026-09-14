import { getSupabaseServerClient } from "./server";
import type { TeamMember } from "@/components/dashboard/users-data";

/**
 * Acces a la table `profiles`, la fiche applicative d'un compte.
 *
 * Creer ou supprimer un utilisateur touche aussi `auth.users`, ou vivent
 * les mots de passe : ces deux operations passent par l'API admin de
 * Supabase, qui exige la cle secrete et n'est donc appelable que depuis
 * une route serveur.
 */

type ProfileRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  status: string;
  suivi_livraison: boolean;
  imports_excel: boolean;
  creation_prospects: boolean;
  avatar_color: string;
  last_sign_in_at: string | null;
  page_access: string[] | null;
};

const COLUMNS =
  "id,name,email,phone,role,status,suivi_livraison,imports_excel,creation_prospects,avatar_color,last_sign_in_at,page_access";

/** "26 aout 2026, 16:02", comme les autres dates de l'interface. */
function formatSignIn(iso: string | null): string {
  if (!iso) return "Jamais connecte";
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Africa/Casablanca",
  }).format(d);
  const time = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Africa/Casablanca",
  }).format(d);
  return `${date}, ${time}`;
}

function toMember(row: ProfileRow): TeamMember {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone ?? "",
    role: row.role as TeamMember["role"],
    status: row.status as TeamMember["status"],
    permissions: {
      suiviLivraison: row.suivi_livraison,
      importsExcel: row.imports_excel,
      creationProspects: row.creation_prospects,
    },
    leadsAssignes: null,
    confirmesAjd: null,
    tauxConv: null,
    derniereConnexion: formatSignIn(row.last_sign_in_at),
    avatarColor: row.avatar_color,
    pageAccess: row.page_access ?? [],
  };
}

function toRow(member: Partial<TeamMember>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (member.name !== undefined) row.name = member.name;
  if (member.email !== undefined) row.email = member.email.trim().toLowerCase();
  if (member.phone !== undefined) row.phone = member.phone || null;
  if (member.role !== undefined) row.role = member.role;
  if (member.status !== undefined) row.status = member.status;
  if (member.avatarColor !== undefined) row.avatar_color = member.avatarColor;
  if (member.pageAccess !== undefined) row.page_access = member.pageAccess;
  if (member.permissions) {
    row.suivi_livraison = member.permissions.suiviLivraison;
    row.imports_excel = member.permissions.importsExcel;
    row.creation_prospects = member.permissions.creationProspects;
  }
  return row;
}

export async function listProfiles(): Promise<TeamMember[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(COLUMNS)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as ProfileRow[]).map(toMember);
}

/** Cree le compte de connexion puis sa fiche. */
export async function createProfile(
  member: Partial<TeamMember> & { password: string }
): Promise<TeamMember> {
  const supabase = getSupabaseServerClient();
  const email = member.email?.trim().toLowerCase();
  if (!email || !member.name) {
    throw new Error("Nom et email requis.");
  }
  if (member.password.length < 8) {
    throw new Error("Le mot de passe doit faire au moins 8 caracteres.");
  }

  const { data: created, error: authError } = await supabase.auth.admin.createUser({
    email,
    password: member.password,
    // Pas de serveur d'envoi d'emails configure : le compte est utilisable
    // immediatement, l'administrateur transmet lui-meme les identifiants.
    email_confirm: true,
  });
  if (authError || !created.user) {
    throw new Error(authError?.message ?? "Creation du compte impossible.");
  }

  const { data, error } = await supabase
    .from("profiles")
    .insert({ id: created.user.id, ...toRow({ ...member, email }) })
    .select(COLUMNS)
    .single();

  if (error) {
    // La fiche a echoue : retirer le compte de connexion pour ne pas
    // laisser un utilisateur capable de se connecter sans profil.
    await supabase.auth.admin.deleteUser(created.user.id);
    throw new Error(error.message);
  }
  return toMember(data as ProfileRow);
}

export async function updateProfile(
  id: string,
  changes: Partial<TeamMember>
): Promise<TeamMember> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .update(toRow(changes))
    .eq("id", id)
    .select(COLUMNS)
    .single();
  if (error) throw new Error(error.message);

  // L'email sert d'identifiant de connexion : le changer ici seulement
  // laisserait la personne se connecter avec l'ancien.
  if (changes.email) {
    await supabase.auth.admin.updateUserById(id, {
      email: changes.email.trim().toLowerCase(),
    });
  }
  return toMember(data as ProfileRow);
}

/** Change le mot de passe d'un compte. */
export async function setProfilePassword(id: string, password: string) {
  if (password.length < 8) {
    throw new Error("Le mot de passe doit faire au moins 8 caracteres.");
  }
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.auth.admin.updateUserById(id, { password });
  if (error) throw new Error(error.message);
}

/** Supprime le compte ; la fiche suit, via `on delete cascade`. */
export async function deleteProfile(id: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.auth.admin.deleteUser(id);
  if (error) throw new Error(error.message);
}
