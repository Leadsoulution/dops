import { NextResponse, type NextRequest } from "next/server";
import {
  getSupabaseServerClient,
  isSupabaseServerConfigured,
} from "@/lib/supabase/server";
import { createLead } from "@/lib/supabase/leads";
import { receptionCommande, type ProduitCatalogue } from "@/lib/web-forms";
import {
  getWebFormsSettings,
  origineAutorisee,
  recordWebFormCall,
} from "@/lib/supabase/web-forms-settings";

/**
 * L'entree des commandes d'un site fait a la main.
 *
 * Publique par necessite : c'est une page HTML chez un hebergeur
 * quelconque qui appelle, sans session ni cookie. Trois choses la
 * protegent — une cle, l'origine declaree, et le fait qu'elle ne
 * sache rien faire d'autre que creer une commande.
 *
 * Elle repond toujours en JSON et jamais en HTML : du code colle dans
 * une page lit `ok`, pas une page d'erreur de Next.
 */

/**
 * Les en-tetes qui autorisent le navigateur a parler ici.
 *
 * Sans eux, un formulaire pose sur un autre domaine verrait sa
 * requete bloquee avant meme de partir : le navigateur refuse une
 * reponse qui ne l'invite pas nommement.
 */
function cors(origine: string | null, autorisee: string) {
  return {
    "Access-Control-Allow-Origin": autorisee || origine || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Orderly-Key",
    "Access-Control-Max-Age": "86400",
  };
}

export async function OPTIONS(request: NextRequest) {
  const { origin } = await getWebFormsSettings().catch(() => ({ origin: "" }));
  return new NextResponse(null, {
    status: 204,
    headers: cors(request.headers.get("origin"), origin),
  });
}

export async function POST(request: NextRequest) {
  const origineRecue = request.headers.get("origin");
  let entetes: Record<string, string> = cors(origineRecue, "");

  if (!isSupabaseServerConfigured) {
    return NextResponse.json(
      { ok: false, error: "Serveur non configure." },
      { status: 500, headers: entetes }
    );
  }

  const reglages = await getWebFormsSettings();
  entetes = cors(origineRecue, reglages.origin);

  if (!reglages.token) {
    return NextResponse.json(
      { ok: false, error: "Aucune cle generee dans Orderly." },
      { status: 503, headers: entetes }
    );
  }

  /*
   * Le corps est lu avant la cle : un formulaire HTML classique ne
   * sait pas poser d'en-tete, il poste ses champs. La cle est donc
   * acceptee dans l'en-tete ou dans le corps, sinon il faudrait du
   * JavaScript pour une page qui n'en a peut-etre pas.
   */
  const brut = await lireCorps(request);
  if (!brut) {
    return NextResponse.json(
      { ok: false, error: "Corps illisible." },
      { status: 400, headers: entetes }
    );
  }

  /*
   * La cle, par l'un des trois chemins possibles.
   *
   * L'en-tete est le plus propre, mais une plateforme qui se contente
   * d'un champ "adresse du webhook" ne sait pas en poser : LOORA, par
   * exemple, n'offre qu'une URL. L'adresse reste donc acceptee, parce
   * qu'une integration impossible vaut moins qu'une cle dans une URL
   * — laquelle, de toute facon, n'est pas un secret ici.
   */
  const cle =
    request.headers.get("x-orderly-key") ||
    request.nextUrl.searchParams.get("key") ||
    (typeof brut.key === "string" ? brut.key : "");
  if (cle !== reglages.token) {
    return NextResponse.json(
      { ok: false, error: "Cle invalide." },
      { status: 401, headers: entetes }
    );
  }
  if (!origineAutorisee(reglages.origin, origineRecue)) {
    return NextResponse.json(
      { ok: false, error: "Origine non autorisee." },
      { status: 403, headers: entetes }
    );
  }

  /*
   * Les noms des champs recus sont notes, quoi qu'il arrive.
   *
   * Une plateforme tierce poste sans jamais montrer ce qu'elle
   * envoie : sans cette trace, une commande refusee parce que le
   * champ s'appelle "customer_name" ne laisserait aucun indice.
   */
  const champs = Object.keys(brut).filter((c) => c !== "key");

  const reception = receptionCommande(brut, new Date(), Math.random, await catalogue());
  if (!reception.ok) {
    await recordWebFormCall(champs, false, reception.erreur);
    return NextResponse.json(
      { ok: false, error: reception.erreur },
      { status: 400, headers: entetes }
    );
  }

  try {
    const lead = await createLead(reception.lead);
    await recordWebFormCall(champs, true);
    return NextResponse.json(
      { ok: true, reference: lead.reference },
      { status: 201, headers: entetes }
    );
  } catch (error) {
    // La commande est perdue pour le client s'il ne la repasse pas :
    // elle part au moins dans les journaux du serveur.
    console.error("[formulaire web] commande refusee :", error);
    await recordWebFormCall(champs, false, "Enregistrement impossible.");
    return NextResponse.json(
      { ok: false, error: "Enregistrement impossible." },
      { status: 500, headers: entetes }
    );
  }
}

/**
 * Les produits auxquels un code article peut renvoyer.
 *
 * Un catalogue illisible ne doit pas couter la commande : elle entre
 * alors sous le nom envoye par la page, comme avant les codes.
 */
async function catalogue(): Promise<ProduitCatalogue[]> {
  try {
    const { data } = await getSupabaseServerClient()
      .from("products")
      .select("name,ref,forcelog_ref,woo_sku,default_parcel_type");
    return ((data ?? []) as {
      name: string;
      ref: string;
      forcelog_ref: string | null;
      woo_sku: string | null;
      default_parcel_type: string | null;
    }[]).map((p) => ({
      name: p.name,
      ref: p.ref,
      forcelogRef: p.forcelog_ref ?? undefined,
      wooSku: p.woo_sku ?? undefined,
      defaultParcelType: p.default_parcel_type === "stock" ? "stock" : "simple",
    }));
  } catch {
    return [];
  }
}

/** JSON ou formulaire HTML : les deux arrivent, les deux sont lus. */
async function lireCorps(
  request: NextRequest
): Promise<Record<string, unknown> | null> {
  const type = request.headers.get("content-type") ?? "";
  try {
    if (type.includes("application/json")) {
      return (await request.json()) as Record<string, unknown>;
    }
    const form = await request.formData();
    return Object.fromEntries(form.entries());
  } catch {
    return null;
  }
}

export function GET() {
  return NextResponse.json({
    message:
      "Entree des commandes d'un site web. POST en JSON ou en formulaire, " +
      "avec la cle dans l'en-tete X-Orderly-Key ou le champ key.",
  });
}
