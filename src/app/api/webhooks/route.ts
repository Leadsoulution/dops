import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient, isSupabaseServerConfigured } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/supabase/auth";
import { newSecret } from "@/lib/webhooks/send";
import { WEBHOOK_EVENTS } from "@/lib/webhooks/payload";

/**
 * Abonnements sortants.
 *
 * Reserve aux administrateurs : une URL de webhook recoit les noms,
 * telephones et adresses des clients. La donner revient a ouvrir le
 * carnet d'adresses.
 */

async function requireAdmin() {
  const profile = await getSessionProfile();
  if (!profile) return { error: "Non connecte.", status: 401 as const };
  if (profile.role !== "Admin")
    return { error: "Reserve aux administrateurs.", status: 403 as const };
  return { profile };
}

export async function GET() {
  if (!isSupabaseServerConfigured)
    return NextResponse.json({ error: "Supabase non configure." }, { status: 500 });
  const guard = await requireAdmin();
  if ("error" in guard)
    return NextResponse.json({ error: guard.error }, { status: guard.status });

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("webhooks")
    .select("id,name,url,secret,events,active,last_success_at,last_error,created_at")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ webhooks: data ?? [], events: WEBHOOK_EVENTS });
}

export async function POST(request: NextRequest) {
  if (!isSupabaseServerConfigured)
    return NextResponse.json({ error: "Supabase non configure." }, { status: 500 });
  const guard = await requireAdmin();
  if ("error" in guard)
    return NextResponse.json({ error: guard.error }, { status: guard.status });

  let body: { name?: string; url?: string; events?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }

  const url = (body.url ?? "").trim();
  // Une adresse en clair exposerait les coordonnees des clients sur le
  // reseau : seul https est accepte.
  if (!/^https:\/\/.+/i.test(url))
    return NextResponse.json(
      { error: "L'adresse doit commencer par https://" },
      { status: 400 }
    );

  const events = (body.events ?? []).filter((e) =>
    (WEBHOOK_EVENTS as readonly string[]).includes(e)
  );

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("webhooks")
    .insert({
      name: (body.name ?? "n8n").trim() || "n8n",
      url,
      secret: newSecret(),
      events,
    })
    .select("id,name,url,secret,events,active,last_success_at,last_error,created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ webhook: data }, { status: 201 });
}
