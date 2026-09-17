import { NextResponse, type NextRequest } from "next/server";
import { getSessionProfile } from "@/lib/supabase/auth";
import { getSupabaseServerClient, isSupabaseServerConfigured } from "@/lib/supabase/server";
import { saveIntegrationSettings } from "@/lib/supabase/integrations";
import { getPaymentRate, getPaymentReport } from "@/lib/supabase/confirmation-pay";

/**
 * Suivi du paiement des agents de confirmation.
 *
 * Tout le monde consulte : un agent doit pouvoir verifier ce qui lui est
 * du. Seul un administrateur marque une commande payee ou change le
 * tarif — c'est de l'argent.
 */
const SETTINGS_ID = "confirmation-payment";

export async function GET(request: NextRequest) {
  const profile = await getSessionProfile();
  if (!profile) {
    return NextResponse.json({ error: "Non connecte." }, { status: 401 });
  }
  if (!isSupabaseServerConfigured) {
    return NextResponse.json({ error: "Supabase non configure." }, { status: 500 });
  }

  const from = request.nextUrl.searchParams.get("from") ?? undefined;
  const to = request.nextUrl.searchParams.get("to") ?? undefined;

  try {
    return NextResponse.json({
      ...(await getPaymentReport(from, to)),
      canEdit: profile.role === "Admin",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "Admin") {
    return NextResponse.json(
      { error: "Reserve aux administrateurs." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();

    // Changement de tarif : il ne vaut que pour les paiements a venir,
    // les sommes deja versees etant copiees sur la commande.
    if (body.rate !== undefined) {
      const rate = Number(body.rate);
      if (!Number.isFinite(rate) || rate < 0) {
        return NextResponse.json({ error: "Tarif invalide." }, { status: 400 });
      }
      await saveIntegrationSettings(SETTINGS_ID, { rate: String(rate) });
      return NextResponse.json({ rate });
    }

    const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
    if (ids.length === 0) {
      return NextResponse.json({ error: "Aucune commande." }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();

    if (body.paid === false) {
      const { error } = await supabase
        .from("leads")
        .update({
          confirmation_paid_at: null,
          confirmation_paid_amount: null,
          confirmation_paid_by: null,
        })
        .in("id", ids);
      if (error) throw new Error(error.message);
      return NextResponse.json({ updated: ids.length, paid: false });
    }

    // Le tarif est copie maintenant : le relire plus tard reecrirait le
    // passe a chaque changement de tarif.
    const rate = await getPaymentRate();
    const { error } = await supabase
      .from("leads")
      .update({
        confirmation_paid_at: new Date().toISOString(),
        confirmation_paid_amount: rate,
        confirmation_paid_by: profile.name,
      })
      .in("id", ids);
    if (error) throw new Error(error.message);

    return NextResponse.json({ updated: ids.length, paid: true, rate });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 400 }
    );
  }
}
