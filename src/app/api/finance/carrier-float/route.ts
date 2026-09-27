import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/supabase/auth";
import { isSupabaseServerConfigured } from "@/lib/supabase/server";
import { getCarrierFloat } from "@/lib/supabase/carrier-float";

/** Ce que le transporteur a encaisse et pas encore verse. */
export async function GET() {
  if (!(await getSessionProfile())) {
    return NextResponse.json({ error: "Non connecte." }, { status: 401 });
  }
  if (!isSupabaseServerConfigured) {
    return NextResponse.json({ error: "Supabase non configure." }, { status: 500 });
  }
  try {
    return NextResponse.json(await getCarrierFloat());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 500 }
    );
  }
}
