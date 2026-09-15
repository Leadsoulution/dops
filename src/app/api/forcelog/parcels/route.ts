import { NextRequest, NextResponse } from "next/server";
import { addParcel } from "@/lib/forcelog/client";
import { mapOrderToParcel, type MappableOrder } from "@/lib/forcelog/mapping";
import { ForceLogApiError } from "@/lib/forcelog/types";
import { dispatchBlocker } from "@/lib/forcelog/eligibility";
import { deliverableCityKeys } from "@/lib/supabase/cities";

export async function POST(request: NextRequest) {
  const apiKey = process.env.FORCELOG_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Cle API ForceLog non configuree." },
      { status: 500 }
    );
  }

  let order: MappableOrder;
  try {
    order = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Corps de requete JSON invalide." },
      { status: 400 }
    );
  }

  // Le nom et le telephone sont verifies plus bas, qui en dit davantage
  // sur ce qui manque ; ici seule la reference, qui n'a pas de message
  // dedie, est controlee.
  if (!order?.reference) {
    return NextResponse.json(
      { error: "Champ requis manquant (reference)." },
      { status: 400 }
    );
  }

  // Meme controle que l'envoi automatique : la ville doit exister dans
  // la liste des villes livrables, et la commande porter un nom et un
  // numero joignable.
  try {
    const blocker = dispatchBlocker(order, await deliverableCityKeys());
    if (blocker) return NextResponse.json({ error: blocker }, { status: 422 });
  } catch {
    return NextResponse.json(
      { error: "Liste des villes indisponible." },
      { status: 500 }
    );
  }

  try {
    const parcel = await addParcel(apiKey, mapOrderToParcel(order));
    // ForceLog n'expose pas d'identifiant interne distinct : le numero de
    // suivi est la seule reference exploitable.
    return NextResponse.json({ trackingNumber: parcel.TRACKING_NUMBER });
  } catch (error) {
    const message =
      error instanceof ForceLogApiError
        ? error.message
        : "Erreur inattendue lors de la creation du colis.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
