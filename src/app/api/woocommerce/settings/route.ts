import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/supabase/auth";
import { saveIntegrationSettings } from "@/lib/supabase/integrations";
import {
  checkConnection,
  getWooCredentials,
  WooCommerceError,
} from "@/lib/woocommerce/client";

/** "cs_32f5…ee81" : assez pour reconnaitre la cle, pas pour s'en servir. */
function mask(value?: string) {
  if (!value) return "";
  return value.length <= 12
    ? `${value.slice(0, 3)}...`
    : `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export async function GET() {
  const profile = await getSessionProfile();
  if (!profile) {
    return NextResponse.json({ error: "Non connecte." }, { status: 401 });
  }

  const { url, key, secret } = await getWooCredentials();
  // Les secrets ne repartent jamais en clair vers le navigateur, meme
  // vers celui d'un administrateur : ils n'ont aucune raison d'y etre.
  return NextResponse.json({
    url: url ?? "",
    key: mask(key),
    secret: mask(secret),
    configured: Boolean(url && key && secret),
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
    const url = String(body.url ?? "").trim().replace(/\/+$/, "");
    const key = String(body.key ?? "").trim();
    const secret = String(body.secret ?? "").trim();

    if (!url || !key || !secret) {
      return NextResponse.json(
        { error: "Adresse de la boutique, cle client et cle secrete requises." },
        { status: 400 }
      );
    }
    if (!/^https?:\/\//.test(url)) {
      return NextResponse.json(
        { error: "L'adresse doit commencer par https://" },
        { status: 400 }
      );
    }

    // Enregistre d'abord, teste ensuite avec ce qui vient d'etre pose :
    // tester des identifiants non enregistres validerait les anciens.
    await saveIntegrationSettings("woocommerce", { url, key, secret });

    try {
      await checkConnection();
    } catch (error) {
      return NextResponse.json(
        {
          saved: true,
          connected: false,
          error:
            error instanceof WooCommerceError
              ? error.message
              : "Connexion impossible.",
        },
        { status: 200 }
      );
    }

    return NextResponse.json({ saved: true, connected: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 400 }
    );
  }
}
