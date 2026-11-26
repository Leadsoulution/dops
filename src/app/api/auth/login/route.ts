import { NextResponse } from "next/server";
import { getSupabaseAuthClient } from "@/lib/supabase/auth";
import { getSupabaseServerClient, isSupabaseServerConfigured } from "@/lib/supabase/server";
import { refusDeConnexion } from "@/lib/supabase/login-error";

/**
 * Connexion par email et mot de passe.
 *
 * Supabase pose lui-meme les cookies de session via le client cree ici.
 * Les erreurs renvoyees restent volontairement vagues ("identifiants
 * incorrects") : distinguer "compte inconnu" de "mauvais mot de passe"
 * revient a confirmer a un inconnu quelles adresses ont un compte.
 */
export async function POST(request: Request) {
  if (!isSupabaseServerConfigured) {
    return NextResponse.json({ error: "Supabase non configure." }, { status: 500 });
  }

  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requete invalide." }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password;
  if (!email || !password) {
    return NextResponse.json(
      { error: "Email et mot de passe requis." },
      { status: 400 }
    );
  }

  const supabase = await getSupabaseAuthClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    /*
     * Un refus n'est pas toujours un mauvais mot de passe.
     *
     * Quota Supabase depasse, service en panne, trop de tentatives :
     * tout cela echoue ici aussi. Tout annoncer comme "mot de passe
     * incorrect" a deja envoye chercher au clavier pendant que
     * l'application entiere etait hors service.
     */
    const refus = refusDeConnexion(error?.status);
    if (refus.http !== 401) {
      // La vraie raison reste cote serveur : elle nomme le service en
      // cause, ce que la page n'a pas a dire a un visiteur.
      console.error(
        "[login] Supabase a refuse la connexion :",
        error?.status,
        error?.message
      );
    }
    return NextResponse.json({ error: refus.message }, { status: refus.http });
  }

  const admin = getSupabaseServerClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("name,status")
    .eq("id", data.user.id)
    .maybeSingle();

  // Un compte desactive depuis la page Utilisateurs ne doit pas entrer,
  // meme avec le bon mot de passe.
  if (!profile || profile.status !== "Actif") {
    await supabase.auth.signOut();
    return NextResponse.json(
      { error: "Ce compte est desactive. Contactez un administrateur." },
      { status: 403 }
    );
  }

  await admin
    .from("profiles")
    .update({ last_sign_in_at: new Date().toISOString() })
    .eq("id", data.user.id);

  return NextResponse.json({ ok: true, name: profile.name });
}
