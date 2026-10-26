import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/supabase/auth";
import {
  getIntegrationSettings,
  saveIntegrationSettings,
} from "@/lib/supabase/integrations";
import {
  sanitizeWorkspace,
  WORKSPACE_SETTINGS_ID,
  type WorkspaceSettings,
} from "@/lib/workspace-settings";

/**
 * Les reglages generaux de l'espace.
 *
 * Tout le monde lit : le nom de la boutique et la devise servent a
 * l'affichage partout. Seul un administrateur ecrit, comme pour les
 * modeles de messages.
 */

export async function GET() {
  const profile = await getSessionProfile();
  if (!profile) {
    return NextResponse.json({ error: "Non connecte." }, { status: 401 });
  }
  const enregistre = await getIntegrationSettings<Record<string, string>>(
    WORKSPACE_SETTINGS_ID
  );
  return NextResponse.json({ settings: sanitizeWorkspace(enregistre) });
}

export async function PUT(request: Request) {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "Admin") {
    return NextResponse.json(
      { error: "Reserve aux administrateurs." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    if (!body?.settings || typeof body.settings !== "object") {
      return NextResponse.json({ error: "Reglages manquants." }, { status: 400 });
    }
    const settings: WorkspaceSettings = sanitizeWorkspace(body.settings);
    await saveIntegrationSettings(WORKSPACE_SETTINGS_ID, settings);
    return NextResponse.json({ saved: true, settings });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 400 }
    );
  }
}
