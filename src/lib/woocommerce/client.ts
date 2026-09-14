/**
 * Client WooCommerce (REST API v3).
 *
 * L'authentification se fait en Basic HTTP avec la cle client et la cle
 * secrete. WooCommerce accepte aussi ces cles en parametres d'URL, ce
 * qu'on evite : elles finiraient dans les journaux du serveur web.
 *
 * Les identifiants sont lus ici et ne quittent jamais le serveur.
 */

export class WooCommerceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WooCommerceError";
  }
}

export type WooProduct = {
  id: number;
  name: string;
  sku: string;
  price: string;
  stock_quantity: number | null;
  images?: { src: string }[];
  type?: string;
  status?: string;
};

export type WooLineItem = {
  product_id: number;
  variation_id?: number;
  name: string;
  sku?: string;
  quantity: number;
  total: string;
};

export type WooOrder = {
  id: number;
  number: string;
  status: string;
  date_created: string;
  total: string;
  billing: {
    first_name?: string;
    last_name?: string;
    phone?: string;
    address_1?: string;
    city?: string;
  };
  shipping?: {
    address_1?: string;
    city?: string;
  };
  line_items: WooLineItem[];
};

function credentials() {
  const url = process.env.WOOCOMMERCE_URL?.replace(/\/+$/, "");
  const key = process.env.WOOCOMMERCE_CONSUMER_KEY;
  const secret = process.env.WOOCOMMERCE_CONSUMER_SECRET;
  return { url, key, secret };
}

export const isWooConfigured = () => {
  const { url, key, secret } = credentials();
  return Boolean(url && key && secret);
};

async function wooRequest<T>(
  path: string,
  query: Record<string, string | number> = {}
): Promise<T> {
  const { url, key, secret } = credentials();
  if (!url || !key || !secret) {
    throw new WooCommerceError(
      "WooCommerce non configure : adresse de la boutique et cles API requises."
    );
  }

  const target = new URL(`${url}/wp-json/wc/v3${path}`);
  for (const [name, value] of Object.entries(query)) {
    target.searchParams.set(name, String(value));
  }

  let res: Response;
  try {
    res = await fetch(target, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`,
        Accept: "application/json",
      },
      // La boutique repond parfois lentement sur un gros catalogue.
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw new WooCommerceError(
      "Impossible de joindre la boutique WooCommerce (adresse injoignable ou trop lente)."
    );
  }

  if (res.status === 401) {
    throw new WooCommerceError(
      "Cles WooCommerce refusees. Verifiez la cle client et la cle secrete, et que la cle a les droits Lecture/Ecriture."
    );
  }
  if (res.status === 404) {
    throw new WooCommerceError(
      "API WooCommerce introuvable a cette adresse. Verifiez l'adresse de la boutique et que les permaliens WordPress ne sont pas en mode simple."
    );
  }
  if (!res.ok) {
    // WooCommerce decrit ses erreurs en JSON ; le texte brut si ce n'en
    // est pas (page d'erreur du serveur, pare-feu).
    let detail = "";
    try {
      const body = await res.json();
      detail = body?.message ?? "";
    } catch {
      detail = "";
    }
    throw new WooCommerceError(
      detail || `La boutique a repondu ${res.status}.`
    );
  }

  return (await res.json()) as T;
}

/**
 * Tous les produits de la boutique, page apres page.
 *
 * WooCommerce plafonne a 100 par page et ne dit pas combien il en reste :
 * on avance jusqu'a une page incomplete.
 */
export async function listAllProducts(): Promise<WooProduct[]> {
  const all: WooProduct[] = [];
  const perPage = 100;
  for (let page = 1; page <= 50; page++) {
    const batch = await wooRequest<WooProduct[]>("/products", {
      per_page: perPage,
      page,
      status: "publish",
    });
    all.push(...batch);
    if (batch.length < perPage) break;
  }
  return all;
}

export async function listRecentOrders(after?: string): Promise<WooOrder[]> {
  return wooRequest<WooOrder[]>("/orders", {
    per_page: 50,
    orderby: "date",
    order: "desc",
    ...(after ? { after } : {}),
  });
}

/** Verifie que les identifiants ouvrent bien la boutique. */
export async function checkConnection(): Promise<{ products: number }> {
  const probe = await wooRequest<WooProduct[]>("/products", { per_page: 1 });
  return { products: Array.isArray(probe) ? probe.length : 0 };
}
