import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient, isSupabaseServerConfigured } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/supabase/auth";

/**
 * Activer, desactiver ou retirer un abonnement.
 *
 * Retirer emporte le journal de ses envois. La table des envois
 * retient l'abonnement par une contrainte `restrict` : sans ce
 * menage, "Retirer" ne retirait plus rien des le premier evenement
 * parti, et il ne restait qu'a desactiver.
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

  /*
   * Eteint d'abord, efface ensuite.
   *
   * Un evenement ne part qu'aux abonnements actifs. Couper celui-ci
   * avant de vider son journal evite qu'une commande arrivee entre
   * les deux y pose une ligne, qui ferait echouer la suppression.
   */
  await supabase.from("webhooks").update({ active: false }).eq("id", id);

  /*
   * Le journal part avec l'abonnement.
   *
   * Il ne sert qu'a reprendre les envois en attente et a expliquer une
   * panne : d'un abonnement retire, plus personne ne le lit. Le garder
   * conserverait surtout, dans ses charges utiles, les coordonnees des
   * clients envoyees a une adresse qu'on vient de retirer.
   */
  const { count, error: journal } = await supabase
    .from("webhook_deliveries")
    .delete({ count: "exact" })
    .eq("webhook_id", id);
  if (journal)
    return NextResponse.json({ error: journal.message }, { status: 500 });

  const { error } = await supabase.from("webhooks").delete().eq("id", id);
  if (error) {
    // Reste la course perdue : un envoi enregistre a l'instant.
    // L'abonnement est deja eteint, donc un second essai aboutira.
    return NextResponse.json(
      {
        error:
          "Un envoi vient d'etre enregistre pour cet abonnement. Il est desactive : reessayez pour le retirer.",
      },
      { status: 409 }
    );
  }
  return NextResponse.json({ deleted: true, envois: count ?? 0 });
}
