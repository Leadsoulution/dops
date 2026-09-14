import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseServerClient } from "./server";

/**
 * Client Supabase porteur de la session de l'utilisateur connecte.
 *
 * A la difference de `getSupabaseServerClient`, qui utilise la cle secrete
 * et ignore RLS, celui-ci s'appuie sur la cle publique et sur les cookies
 * de session : il agit au nom de la personne connectee. Reserve aux
 * composants serveur et aux route handlers, ou `cookies()` existe.
 */
export async function getSupabaseAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase non configure : NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY sont requis."
    );
  }

  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        // Un composant serveur ne peut pas ecrire de cookie : Supabase
        // rafraichit alors le jeton sans pouvoir le reposer, et c'est le
        // proxy qui s'en charge a la requete suivante.
        try {
          for (const { name, value, options } of list) {
            cookieStore.set(name, value, options);
          }
        } catch {
          /* Appele depuis un composant serveur : sans effet. */
        }
      },
    },
  });
}

export type SessionProfile = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  status: string;
  avatarColor: string;
  pageAccess: string[];
  permissions: {
    suiviLivraison: boolean;
    importsExcel: boolean;
    creationProspects: boolean;
  };
};

/**
 * Utilisateur connecte, avec sa fiche. Renvoie `null` si personne n'est
 * connecte, si le compte a ete supprime, ou s'il a ete desactive depuis
 * la page Utilisateurs — un compte "Inactif" ne doit plus donner acces.
 *
 * On passe par `getUser()` et non par la session en cookie : c'est le
 * seul appel qui verifie le jeton aupres de Supabase, un cookie pouvant
 * etre fabrique de toutes pieces.
 */
export async function getSessionProfile(): Promise<SessionProfile | null> {
  const supabase = await getSupabaseAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = getSupabaseServerClient();
  const { data } = await admin
    .from("profiles")
    .select(
      "id,name,email,phone,role,status,avatar_color,page_access,suivi_livraison,imports_excel,creation_prospects"
    )
    .eq("id", user.id)
    .maybeSingle();

  if (!data || data.status !== "Actif") return null;

  return {
    id: data.id,
    name: data.name,
    email: data.email,
    phone: data.phone,
    role: data.role,
    status: data.status,
    avatarColor: data.avatar_color,
    pageAccess: data.page_access ?? [],
    permissions: {
      suiviLivraison: data.suivi_livraison,
      importsExcel: data.imports_excel,
      creationProspects: data.creation_prospects,
    },
  };
}
