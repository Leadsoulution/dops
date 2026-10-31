import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/supabase/auth";
import { saveIntegrationSettings } from "@/lib/supabase/integrations";
import {
  checkConnection,
  getWooStores,
  storeId,
  WooCommerceError,
  type WooStore,
} from "@/lib/woocommerce/client";

/**
 * Les boutiques WooCommerce branchees.
 *
 * Plusieurs, depuis qu'un meme vendeur tient deux sites. Elles sont
 * rangees sous `stores`, et l'ancienne forme a plat — une seule
 * boutique — est relue comme la premiere de la liste, sans rien
 * resaisir.
 */

/** "cs_32f5…ee81" : assez pour reconnaitre la cle, pas pour s'en servir. */
function mask(value?: string) {
  if (!value) return "";
  return value.length <= 12
    ? `${value.slice(0, 3)}...`
    : `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function vue(store: WooStore) {
  // Les secrets ne repartent jamais en clair vers le navigateur, meme
  // vers celui d'un administrateur : ils n'ont aucune raison d'y etre.
  return {
    id: store.id,
    name: store.name,
    url: store.url,
    key: mask(store.key),
    secret: mask(store.secret),
  };
}

async function enregistrer(stores: WooStore[]): Promise<void> {
  await saveIntegrationSettings("woocommerce", {
    stores: stores.map((s) => ({
      name: s.name,
      url: s.url,
      key: s.key,
      secret: s.secret,
    })),
  });
}

export async function GET() {
  const profile = await getSessionProfile();
  if (!profile) {
    return NextResponse.json({ error: "Non connecte." }, { status: 401 });
  }
  const stores = await getWooStores();
  return NextResponse.json({
    stores: stores.map(vue),
    configured: stores.length > 0,
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
    const url = String(body.url ?? "")
      .trim()
      .replace(/\/+$/, "");
    const key = String(body.key ?? "").trim();
    const secret = String(body.secret ?? "").trim();
    const name = String(body.name ?? "").trim();

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

    const id = storeId(url);
    const nouvelle: WooStore = { id, name: name || id, url, key, secret };

    /*
     * Une boutique deja la est remplacee, pas ajoutee une seconde
     * fois : c'est son domaine qui l'identifie, et les commandes deja
     * importees y sont rattachees. En creer un doublon les orphelinerait.
     */
    const existantes = await getWooStores();
    const stores = [
      ...existantes.filter((s) => s.id !== id),
      nouvelle,
    ];

    // Enregistre d'abord, teste ensuite avec ce qui vient d'etre pose :
    // tester des identifiants non enregistres validerait les anciens.
    await enregistrer(stores);

    try {
      await checkConnection(nouvelle);
    } catch (error) {
      return NextResponse.json({
        saved: true,
        connected: false,
        store: vue(nouvelle),
        error:
          error instanceof WooCommerceError
            ? error.message
            : "Connexion impossible.",
      });
    }

    return NextResponse.json({
      saved: true,
      connected: true,
      store: vue(nouvelle),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request) {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "Admin") {
    return NextResponse.json(
      { error: "Reserve aux administrateurs." },
      { status: 403 }
    );
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Boutique non precisee." }, { status: 400 });
  }

  try {
    const restantes = (await getWooStores()).filter((s) => s.id !== id);
    await enregistrer(restantes);
    /*
     * Les commandes deja importees restent.
     *
     * Elles racontent des ventes qui ont eu lieu ; les effacer
     * fausserait le chiffre de tous les mois passes. Debrancher une
     * boutique arrete la suite, pas le passe.
     */
    return NextResponse.json({ removed: id, stores: restantes.map(vue) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 500 }
    );
  }
}
