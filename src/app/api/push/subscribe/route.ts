import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/supabase/auth";
import {
  isPushConfigured,
  removeSubscription,
  saveSubscription,
  sendPushToAll,
} from "@/lib/push";

/** La cle publique, dont le navigateur a besoin pour s'abonner. */
export async function GET() {
  return NextResponse.json({
    publicKey: process.env.VAPID_PUBLIC_KEY ?? null,
    configured: isPushConfigured(),
  });
}

export async function POST(request: Request) {
  const profile = await getSessionProfile();
  if (!profile) {
    return NextResponse.json({ error: "Non connecte." }, { status: 401 });
  }

  try {
    const body = await request.json();

    // Un essai declenche l'envoi vers cet appareil, pour verifier toute la
    // chaine sans attendre une vraie commande.
    if (body.test) {
      const sent = await sendPushToAll({
        title: "Orderly",
        body: "Les notifications fonctionnent sur cet appareil.",
        kind: "payment",
        tag: "test",
      });
      return NextResponse.json({ sent });
    }

    const { endpoint, keys } = body.subscription ?? {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json({ error: "Abonnement invalide." }, { status: 400 });
    }

    await saveSubscription(
      { endpoint, keys },
      profile.id,
      request.headers.get("user-agent") ?? undefined
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { endpoint } = await request.json();
    if (endpoint) await removeSubscription(endpoint);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
