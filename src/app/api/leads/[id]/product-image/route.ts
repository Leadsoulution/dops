import { NextRequest, NextResponse } from "next/server";
import { leadProductImage } from "@/lib/supabase/leads";
import { isSupabaseServerConfigured } from "@/lib/supabase/server";

/**
 * La photo du produit d'une commande, reservie par nos soins.
 *
 * Le navigateur ne peut pas la telecharger lui-meme : les hebergeurs des
 * images (le CDN du transporteur, la boutique) n'autorisent pas la
 * lecture depuis une autre origine, et sans octets en main il n'y a pas
 * de fichier a joindre a un partage.
 *
 * L'adresse de l'image est relue en base a partir de la commande, jamais
 * recue du client : une route qui irait chercher l'URL qu'on lui passe
 * ferait de ce serveur un relai vers n'importe quelle machine du reseau.
 */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/leads/[id]/product-image">
) {
  if (!isSupabaseServerConfigured) {
    return NextResponse.json({ error: "Supabase non configure." }, { status: 500 });
  }
  const { id } = await ctx.params;

  const source = await leadProductImage(id);
  if (!source) {
    return NextResponse.json(
      { error: "Ce produit n'a pas de photo." },
      { status: 404 }
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(source);
  } catch {
    return NextResponse.json({ error: "Photo injoignable." }, { status: 502 });
  }

  const type = upstream.headers.get("content-type") ?? "";
  if (!upstream.ok || !type.startsWith("image/")) {
    return NextResponse.json({ error: "Photo injoignable." }, { status: 502 });
  }

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": type,
      // Privee : elle ne traverse que la session de l'agent.
      "Cache-Control": "private, max-age=3600",
    },
  });
}
