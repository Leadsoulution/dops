import { NextResponse } from "next/server";
import { syncSheet } from "@/lib/google/sync";
import { isSheetsConfigured } from "@/lib/google/sheets";

/** Synchronise l'application et la feuille de sauvegarde. */
export async function POST() {
  if (!(await isSheetsConfigured())) {
    return NextResponse.json(
      { error: "Aucune feuille Google connectee." },
      { status: 400 }
    );
  }
  try {
    return NextResponse.json(await syncSheet());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 502 }
    );
  }
}
