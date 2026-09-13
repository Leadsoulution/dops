import { NextResponse } from "next/server";
import { getSupabaseServerClient, isSupabaseServerConfigured } from "@/lib/supabase/server";

/**
 * Images produits, stockees dans Supabase Storage.
 *
 * Le depot passe par le serveur et non par le navigateur : la cle
 * publique n'a aucun droit d'ecriture sur le stockage, et c'est voulu.
 * Le bucket est public en lecture, une image produit n'ayant rien de
 * confidentiel et devant s'afficher sans jeton.
 */

const BUCKET = "product-images";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"];

/** Nom de fichier sur : horodate, sans accent ni espace, jamais en collision. */
function safeName(original: string) {
  const cleaned = original
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-60);
  return `${Date.now()}-${cleaned || "image"}`;
}

export async function GET() {
  if (!isSupabaseServerConfigured) {
    return NextResponse.json({ error: "Supabase non configure." }, { status: 500 });
  }
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.storage.from(BUCKET).list("", {
    limit: 100,
    sortBy: { column: "created_at", order: "desc" },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const files = (data ?? [])
    // Supabase pose un marqueur vide dans un dossier fraichement cree.
    .filter((f) => f.id)
    .map((f) => ({
      name: f.name,
      url: supabase.storage.from(BUCKET).getPublicUrl(f.name).data.publicUrl,
      size: f.metadata?.size ?? 0,
    }));
  return NextResponse.json({ files });
}

export async function POST(request: Request) {
  if (!isSupabaseServerConfigured) {
    return NextResponse.json({ error: "Supabase non configure." }, { status: 500 });
  }

  let file: File | null = null;
  try {
    const form = await request.formData();
    const value = form.get("file");
    if (value instanceof File) file = value;
  } catch {
    return NextResponse.json({ error: "Requete invalide." }, { status: 400 });
  }

  if (!file) {
    return NextResponse.json({ error: "Aucun fichier recu." }, { status: 400 });
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json(
      { error: "Format non accepte. Utilisez PNG, JPEG, WebP, GIF ou AVIF." },
      { status: 415 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Image trop lourde : 5 Mo maximum." },
      { status: 413 }
    );
  }

  const supabase = getSupabaseServerClient();
  const name = safeName(file.name);
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(name, file, { contentType: file.type, upsert: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const url = supabase.storage.from(BUCKET).getPublicUrl(name).data.publicUrl;
  return NextResponse.json({ file: { name, url, size: file.size } }, { status: 201 });
}
