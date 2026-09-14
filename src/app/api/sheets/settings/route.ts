import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/supabase/auth";
import { saveIntegrationSettings } from "@/lib/supabase/integrations";
import { checkSheetsConnection, getSheetsSettings } from "@/lib/google/sheets";
import { GoogleError } from "@/lib/google/auth";

/** Identifiant du document, depuis une URL collee ou l'identifiant seul. */
function extractId(input: string): string {
  const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return (match?.[1] ?? input).trim();
}

export async function GET() {
  const profile = await getSessionProfile();
  if (!profile) {
    return NextResponse.json({ error: "Non connecte." }, { status: 401 });
  }

  const settings = await getSheetsSettings();
  let email = "";
  try {
    email = settings.serviceAccount
      ? JSON.parse(settings.serviceAccount).client_email ?? ""
      : "";
  } catch {
    email = "";
  }

  // La cle privee ne repart jamais vers le navigateur ; l'adresse du
  // compte, si : c'est elle qu'il faut partager avec la feuille.
  return NextResponse.json({
    spreadsheetId: settings.spreadsheetId ?? "",
    sheetName: settings.sheetName ?? "Orderly",
    serviceAccountEmail: email,
    configured: Boolean(settings.spreadsheetId && settings.serviceAccount),
  });
}

export async function POST(request: Request) {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "Admin") {
    return NextResponse.json(
      { error: "Reserve aux administrateurs." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const current = await getSheetsSettings();

    const spreadsheetId = extractId(String(body.spreadsheetId ?? ""));
    const sheetName = String(body.sheetName ?? "").trim() || "Orderly";
    // Un champ laisse vide garde le compte de service deja enregistre :
    // on ne redemande pas de recoller un fichier JSON pour renommer un
    // onglet.
    const serviceAccount =
      String(body.serviceAccount ?? "").trim() || current.serviceAccount || "";

    if (!spreadsheetId || !serviceAccount) {
      return NextResponse.json(
        { error: "Identifiant de la feuille et compte de service requis." },
        { status: 400 }
      );
    }

    await saveIntegrationSettings("google-sheets", {
      spreadsheetId,
      sheetName,
      serviceAccount,
    });

    try {
      const info = await checkSheetsConnection();
      return NextResponse.json({ saved: true, connected: true, ...info });
    } catch (error) {
      return NextResponse.json({
        saved: true,
        connected: false,
        error:
          error instanceof GoogleError ? error.message : "Connexion impossible.",
      });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 400 }
    );
  }
}
