import { NextResponse, type NextRequest } from "next/server";
import { getSessionProfile } from "@/lib/supabase/auth";
import { isSupabaseServerConfigured } from "@/lib/supabase/server";
import { getDashboardKpis } from "@/lib/supabase/dashboard";

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
    return NextResponse.json(await getDashboardKpis(from, to));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 500 }
    );
  }
}
