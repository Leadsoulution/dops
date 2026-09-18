import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/supabase/auth";
import {
  getIntegrationSettings,
  saveIntegrationSettings,
} from "@/lib/supabase/integrations";
import {
  DELIVERY_PREFIX,
  DELIVERY_STATUSES,
  MESSAGE_STATUSES,
} from "@/lib/whatsapp";

/**
 * Modeles de messages WhatsApp, un par statut.
 *
 * Ranges avec les reglages d'integration : ce sont des reglages
 * d'equipe, partages par tout le monde, pas une preference personnelle.
 */
const SETTINGS_ID = "whatsapp-messages";

export async function GET() {
  const profile = await getSessionProfile();
  if (!profile) {
    return NextResponse.json({ error: "Non connecte." }, { status: 401 });
  }

  // Tout le monde lit : la fiche de commande en a besoin pour composer
  // le message. Seul un administrateur ecrit.
  const templates = await getIntegrationSettings<Record<string, string>>(
    SETTINGS_ID
  );
  return NextResponse.json({ templates });
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
    const incoming = body?.templates;
    if (!incoming || typeof incoming !== "object") {
      return NextResponse.json(
        { error: "Modeles manquants." },
        { status: 400 }
      );
    }

    // Seuls les statuts existants sont retenus, et un modele vide n'est
    // pas enregistre : il signifie "reprendre le texte par defaut", et
    // le stocker figerait une chaine vide a sa place.
    // Deux familles de cles : les statuts de confirmation, et les codes
    // de livraison prefixes. Les lister explicitement empeche qu'une cle
    // arbitraire n'entre dans les reglages.
    const known = [
      ...MESSAGE_STATUSES,
      ...DELIVERY_STATUSES.map((s) => DELIVERY_PREFIX + s.code),
    ];

    const templates: Record<string, string> = {};
    for (const key of known) {
      const value = incoming[key];
      if (typeof value === "string" && value.trim()) {
        templates[key] = value;
      }
    }

    await saveIntegrationSettings(SETTINGS_ID, templates);
    return NextResponse.json({ saved: true, count: Object.keys(templates).length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 400 }
    );
  }
}
