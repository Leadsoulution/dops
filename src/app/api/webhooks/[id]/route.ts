import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient, isSupabaseServerConfigured } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/supabase/auth";

/**
 * Activer, desactiver ou retirer un abonnement.
 *
 * Retirer n'efface pas le journal : la table des envois le retient par
 * une contrainte `restrict`, et c'est voulu. Un abonnement se desactive
 * donc plutot qu'il ne se supprime des qu'il a servi.
 */
async function requireAdmin() {
  const profile = await getSessionProfile();
  if (!profile) return { error: "Non connecte.", status: 401 as const };
  if (profile.role !== "Admin")
    return { error: "Reserve aux administrateurs.", status: 403 as const };
  return { profile };
}

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/webhooks/[id]">
) {
  if (!isSupabaseServerConfigured)
    return NextResponse.json({ error: "Supabase non configure." }, { status: 500 });
  const guard = await requireAdmin();
  if ("error" in guard)
    return NextResponse.json({ error: guard.error }, { status: guard.status });

  const { id } = await ctx.params;
  let body: { active?: boolean; events?: string[]; name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }

  const changes: Record<string, unknown> = {};
  if (body.active !== undefined) changes.active = Boolean(body.active);
  if (body.name !== undefined) changes.name = String(body.name).trim();
  if (body.events !== undefined) changes.events = body.events;

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("webhooks")
    .update(changes)
    .eq("id", id)
    .select("id,name,url,secret,events,active,last_success_at,last_error,created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ webhook: data });
}

export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<"/api/webhooks/[id]">
) {
  if (!isSupabaseServerConfigured)
    return NextResponse.json({ error: "Supabase non configure." }, { status: 500 });
  const guard = await requireAdmin();
  if ("error" in guard)
    return NextResponse.json({ error: guard.error }, { status: guard.status });

  const { id } = await ctx.params;
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("webhooks").delete().eq("id", id);

  if (error) {
    // La contrainte `restrict` refuse tant que des envois existent :
    // le dire plutot que d'afficher un message de base de donnees.
    return NextResponse.json(
      {
        error:
          "Cet abonnement a deja servi : son journal d'envois le retient. Desactivez-le plutot que de le supprimer.",
      },
      { status: 409 }
    );
  }
  return NextResponse.json({ deleted: true });
}
