import { NextResponse, type NextRequest } from "next/server";
import { getSessionProfile } from "@/lib/supabase/auth";
import { isSupabaseServerConfigured } from "@/lib/supabase/server";
import {
  connectAdAccount,
  disconnectAdAccount,
  listAdAccounts,
} from "@/lib/supabase/ad-accounts";
import { canEncrypt } from "@/lib/ads/crypto";
import { verifyAdAccount } from "@/lib/ads/sync";
import { AdApiError, type AdPlatform } from "@/lib/ads/types";

/**
 * Les comptes publicitaires branches sur l'application.
 *
 * Reserve aux administrateurs : un jeton publicitaire donne a voir les
 * depenses et les audiences d'une entreprise entiere.
 *
 * Le jeton entre par ici et n'en ressort jamais. La reponse ne porte
 * qu'une empreinte de quatre caracteres, assez pour reconnaitre celui
 * qui est en place, pas pour s'en servir.
 */

const PLATEFORMES = new Set(["meta", "tiktok"]);

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
  try {
    return NextResponse.json({
      accounts: await listAdAccounts(),
      // Sans cle de chiffrement, aucun compte ne peut etre branche : le
      // dire ici evite un formulaire qui echoue a l'enregistrement.
      canConnect: canEncrypt(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const garde = await admin();
  if ("error" in garde) {
    return NextResponse.json({ error: garde.error }, { status: garde.status });
  }
  if (!canEncrypt()) {
    return NextResponse.json(
      {
        error:
          "ADS_TOKEN_KEY absente : le jeton ne peut pas etre chiffre, " +
          "il ne sera pas enregistre.",
      },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();
    const platform = String(body.platform ?? "") as AdPlatform;
    const externalId = String(body.externalId ?? "").trim();
    const token = String(body.token ?? "").trim();

    if (!PLATEFORMES.has(platform)) {
      return NextResponse.json({ error: "Plateforme inconnue." }, { status: 400 });
    }
    if (!externalId || !token) {
      return NextResponse.json(
        { error: "Identifiant de compte et jeton sont requis." },
        { status: 400 }
      );
    }

    // Le jeton est essaye avant d'etre garde : un compte "Actif" qui
    // echoue a chaque relevee ne se remarquerait qu'une heure plus tard.
    const info = await verifyAdAccount(platform, externalId, token);
    const account = await connectAdAccount(platform, info, token);
    return NextResponse.json({ account });
  } catch (error) {
    const message =
      error instanceof AdApiError
        ? `${error.platform === "meta" ? "Meta" : "TikTok"} a refuse : ${error.message}`
        : error instanceof Error
          ? error.message
          : "Erreur inattendue.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/**
 * Debranche un compte. Il n'est pas supprime : ses depenses passees
 * restent, et le rebrancher lui rend ses campagnes.
 */
export async function DELETE(request: NextRequest) {
  const garde = await admin();
  if ("error" in garde) {
    return NextResponse.json({ error: garde.error }, { status: garde.status });
  }
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Compte manquant." }, { status: 400 });
    await disconnectAdAccount(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 500 }
    );
  }
}
