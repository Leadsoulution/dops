import { NextResponse, type NextRequest } from "next/server";
import { getSessionProfile } from "@/lib/supabase/auth";
import { isSupabaseServerConfigured } from "@/lib/supabase/server";
import {
  getWebFormsSettings,
  rotateWebFormsToken,
  setWebFormsOrigin,
} from "@/lib/supabase/web-forms-settings";

/**
 * La cle et l'origine du site branche a la main.
 *
 * Reserve aux administrateurs : la cle ouvre la creation de commandes.
 * Elle est rendue en clair, contrairement aux jetons publicitaires —
 * il faut pouvoir la recopier dans une page HTML, et elle y sera
 * visible de toute facon.
 */

async function admin() {
  const profile = await getSessionProfile();
  if (!profile) return { error: "Non connecte.", status: 401 as const };
  if (profile.role !== "Admin") {
    return { error: "Reserve aux administrateurs.", status: 403 as const };
  }
  return { profile };
}

export async function GET() {
  if (!isSupabaseServerConfigured) {
    return NextResponse.json({ error: "Supabase non configure." }, { status: 500 });
  }
  const garde = await admin();
  if ("error" in garde) {
    return NextResponse.json({ error: garde.error }, { status: garde.status });
  }
  return NextResponse.json({ settings: await getWebFormsSettings() });
}

export async function POST(request: NextRequest) {
  if (!isSupabaseServerConfigured) {
    return NextResponse.json({ error: "Supabase non configure." }, { status: 500 });
  }
  const garde = await admin();
  if ("error" in garde) {
    return NextResponse.json({ error: garde.error }, { status: garde.status });
  }

  let corps: { action?: string; origin?: string };
  try {
    corps = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }

  try {
    if (corps.action === "rotate") {
      return NextResponse.json({ settings: await rotateWebFormsToken() });
    }
    if (typeof corps.origin === "string") {
      return NextResponse.json({
        settings: await setWebFormsOrigin(corps.origin),
      });
    }
    return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 500 }
    );
  }
}
