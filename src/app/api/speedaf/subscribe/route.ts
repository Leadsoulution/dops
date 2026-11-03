import { NextResponse, type NextRequest } from "next/server";
import { getSessionProfile } from "@/lib/supabase/auth";
import { isSupabaseServerConfigured } from "@/lib/supabase/server";
import { getSpeedafSettings } from "@/lib/supabase/speedaf-settings";
import { subscribeWebhook, SpeedafError } from "@/lib/speedaf/client";

/**
 * Abonne l'application aux notifications de suivi de Speedaf.
 *
 * Sans cet abonnement, personne ne pousse rien : les statuts ne
 * changent que lorsqu'un navigateur ouvert interroge le transporteur,
 * toutes les deux minutes. Un colis livre a vingt heures reste donc
 * "en cours de livraison" jusqu'au lendemain matin.
 *
 * L'adresse est fournie par l'appelant parce que le serveur ignore
 * sous quel nom de domaine il est joignable : derriere un proxy, ce
 * qu'il voit de lui-meme n'est pas ce que Speedaf devra appeler.
 */

export async function POST(request: NextRequest) {
  if (!isSupabaseServerConfigured) {
    return NextResponse.json({ error: "Supabase non configure." }, { status: 500 });
  }
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "Admin") {
    return NextResponse.json(
      { error: "Reserve aux administrateurs." },
      { status: 403 }
    );
  }

  let origin: string;
  try {
    origin = String((await request.json()).origin ?? "").trim().replace(/\/+$/, "");
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }
  if (!/^https:\/\//.test(origin)) {
    return NextResponse.json(
      { error: "Speedaf n'appelle qu'une adresse en https." },
      { status: 400 }
    );
  }

  const config = await getSpeedafSettings();
  if (!config) {
    return NextResponse.json(
      { error: "Identifiants Speedaf non configures." },
      { status: 400 }
    );
  }
  if (!config.secretKey) {
    // Sans cle, leurs notifications arriveraient non signees et
    // seraient refusees a l'entree : autant le dire avant.
    return NextResponse.json(
      {
        error:
          "Cle de signature Speedaf absente : leurs notifications seraient refusees.",
      },
      { status: 400 }
    );
  }

  const callbackUrl = `${origin}/api/speedaf/webhook`;
  try {
    await subscribeWebhook(config, callbackUrl);
    return NextResponse.json({ subscribed: true, callbackUrl });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof SpeedafError
            ? error.message
            : "Abonnement refuse par Speedaf.",
        callbackUrl,
      },
      { status: 502 }
    );
  }
}
