import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/supabase/auth";
import { getSupabaseServerClient, isSupabaseServerConfigured } from "@/lib/supabase/server";

/**
 * Taille de la base.
 *
 * Le quota depend de la formule Supabase : 500 Mo sur l'offre gratuite.
 * Il se regle par variable d'environnement plutot que d'etre ecrit en
 * dur, pour qu'un changement de formule ne demande pas un deploiement.
 */
const LIMIT_MB = Number(process.env.SUPABASE_DB_LIMIT_MB) || 500;

export async function GET() {
  const profile = await getSessionProfile();
  if (!profile) {
    return NextResponse.json({ error: "Non connecte." }, { status: 401 });
  }
  if (!isSupabaseServerConfigured) {
    return NextResponse.json({ error: "Supabase non configure." }, { status: 500 });
  }

  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.rpc("database_size");
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as {
      total_bytes: number;
      table_name: string;
      table_bytes: number;
    }[];

    if (rows.length === 0) {
      return NextResponse.json({ totalBytes: 0, limitMb: LIMIT_MB, tables: [] });
    }

    return NextResponse.json({
      totalBytes: Number(rows[0].total_bytes),
      limitMb: LIMIT_MB,
      tables: rows
        .filter((r) => Number(r.table_bytes) > 0)
        .map((r) => ({ name: r.table_name, bytes: Number(r.table_bytes) })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Taille de la base indisponible.",
      },
      { status: 500 }
    );
  }
}
