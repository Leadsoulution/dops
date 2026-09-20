import { NextResponse } from "next/server";
import { getInventory } from "@/lib/supabase/inventory";
import { isSupabaseServerConfigured } from "@/lib/supabase/server";

export async function GET() {
  if (!isSupabaseServerConfigured) {
    return NextResponse.json({ error: "Supabase non configure." }, { status: 500 });
  }
  try {
    return NextResponse.json(await getInventory());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 500 }
    );
  }
}
