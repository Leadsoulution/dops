import "server-only";
import { getSupabaseServerClient, isSupabaseServerConfigured } from "./server";
import { fetchAll } from "./page";
import {
  getIntegrationSettings,
  saveIntegrationSettings,
} from "./integrations";
import {
  CARRIERS,
  CARRIER_PAR_DEFAUT,
  carrierOfLead,
  type CarrierId,
} from "@/lib/carriers/registry";
import { chooseCarrier, type CarrierShares } from "@/lib/carriers/routing";
import { parseStockItems } from "@/lib/stock-items";

/**
 * La repartition des envois entre transporteurs.
 *
 * Elle vit dans les reglages d'integration, a cote de ceux de la
 * boutique : c'est un choix d'exploitation, pas un secret, et il doit
 * se changer depuis l'ecran sans redeployer.
 *
 * Tant que personne n'y touche, tout part chez ForceLog — l'etat
 * d'avant. Un deuxieme transporteur ne prend des commandes que le jour
 * ou on lui en donne une part.
 */

const CLE = "carriers";

export type CarrierRouting = {
  /** Celui qui prend la commande quand rien ne le designe autrement. */
  default: CarrierId;
  /** Part voulue de chacun, en pourcentage. */
  shares: Record<CarrierId, number>;
};

export const REPARTITION_INITIALE: CarrierRouting = {
  default: CARRIER_PAR_DEFAUT,
  shares: { forcelog: 100, speedaf: 0 },
};

type Stocke = Record<string, string>;

export async function getCarrierRouting(): Promise<CarrierRouting> {
  if (!isSupabaseServerConfigured) return REPARTITION_INITIALE;
  const brut = (await getIntegrationSettings<Stocke>(CLE)) as Stocke;
  if (!brut || Object.keys(brut).length === 0) return REPARTITION_INITIALE;

  const shares = { ...REPARTITION_INITIALE.shares };
  for (const c of CARRIERS) {
    const valeur = Number(brut[`share:${c.id}`]);
    if (Number.isFinite(valeur) && valeur >= 0) shares[c.id] = valeur;
  }
  const defaut = CARRIERS.some((c) => c.id === brut.default)
    ? (brut.default as CarrierId)
    : CARRIER_PAR_DEFAUT;
  return { default: defaut, shares };
}

export async function saveCarrierRouting(
  routing: CarrierRouting
): Promise<void> {
  const settings: Stocke = { default: routing.default };
  for (const c of CARRIERS) {
    const part = routing.shares[c.id];
    settings[`share:${c.id}`] = String(
      Number.isFinite(part) && part > 0 ? Math.round(part) : 0
    );
  }
  await saveIntegrationSettings(CLE, settings);
}

/**
 * Combien de colis chaque transporteur a deja pris.
 *
 * Seules les commandes reellement parties comptent : une commande sans
 * numero de suivi n'a ete confiee a personne, et la compter fausserait
 * la repartition qu'on cherche a tenir.
 */
export async function carrierCounts(): Promise<Record<CarrierId, number>> {
  const counts: Record<CarrierId, number> = { forcelog: 0, speedaf: 0 };
  if (!isSupabaseServerConfigured) return counts;
  const supabase = getSupabaseServerClient();
  const rows = await fetchAll<{ carrier: string | null }>(() =>
    supabase.from("leads").select("carrier").not("tracking_number", "is", null)
  );
  for (const row of rows) counts[carrierOfLead(row.carrier)] += 1;
  return counts;
}

/**
 * Le transporteur de la prochaine commande, selon la repartition
 * voulue et ce qui est deja parti.
 */
export async function nextCarrier(): Promise<CarrierId> {
  const routing = await getCarrierRouting();
  const counts = await carrierCounts();
  return chooseCarrier(
    routing.shares as CarrierShares,
    counts,
    routing.default
  ) as CarrierId;
}

/**
 * Les commandes deja parties, comptees par transporteur et par
 * produit.
 *
 * Une repartition par produit ne peut pas se tenir sur un comptage
 * general : un produit stocke chez un seul transporteur part toujours
 * chez lui, et il masquerait le retard des autres. Chaque produit a
 * donc son propre compte.
 *
 * Le produit d'une commande se lit sur sa reference prelevee, puis sur
 * son nom — la meme regle qu'ailleurs.
 */
export async function countsParProduit(): Promise<Map<string, Record<CarrierId, number>>> {
  const supabase = getSupabaseServerClient();
  const rows = await fetchAll<{
    carrier: string | null;
    stock_items: string | null;
    product_name: string | null;
  }>(() =>
    supabase
      .from("leads")
      .select("carrier,stock_items,product_name")
      .not("tracking_number", "is", null)
  );

  const out = new Map<string, Record<CarrierId, number>>();
  const ajoute = (cle: string, carrier: CarrierId) => {
    const compte = out.get(cle) ?? { forcelog: 0, speedaf: 0 };
    compte[carrier] += 1;
    out.set(cle, compte);
  };

  for (const row of rows) {
    const carrier = carrierOfLead(row.carrier);
    const refs = [...parseStockItems(row.stock_items).keys()];
    if (refs.length > 0) {
      for (const ref of refs) ajoute(`ref:${ref}`, carrier);
    }
    const nom = (row.product_name ?? "").trim().toLowerCase();
    if (nom) ajoute(`nom:${nom}`, carrier);
  }
  return out;
}

/**
 * Le transporteur d'une commande, en tenant compte du produit.
 *
 * Un produit peut avoir sa propre repartition — il n'est en stock que
 * chez l'un, ou on veut l'essayer chez l'autre. Elle prime alors sur
 * la repartition generale, et se tient sur le compte de ce produit
 * seul.
 *
 * Une commande de plusieurs produits suit le premier : un colis ne se
 * coupe pas en deux.
 */
export async function nextCarrierForProduct(lead: {
  stockItems?: string;
  productName?: string;
}): Promise<CarrierId> {
  const routing = await getCarrierRouting();

  const supabase = getSupabaseServerClient();
  const { data } = await supabase
    .from("products")
    .select("name,forcelog_ref,carrier_shares")
    .not("carrier_shares", "is", null);
  const regles = ((data ?? []) as {
    name: string;
    forcelog_ref: string | null;
    carrier_shares: Record<string, number> | null;
  }[]).filter((p) => p.carrier_shares);

  if (regles.length === 0) return nextCarrier();

  const premiereRef = [...parseStockItems(lead.stockItems).keys()][0];
  const nom = (lead.productName ?? "").split(",")[0].trim().toLowerCase();
  const produit =
    regles.find((p) => p.forcelog_ref && p.forcelog_ref === premiereRef) ??
    regles.find((p) => p.name.trim().toLowerCase() === nom);

  if (!produit?.carrier_shares) return nextCarrier();

  const parProduit = await countsParProduit();
  const cle = produit.forcelog_ref
    ? `ref:${produit.forcelog_ref}`
    : `nom:${produit.name.trim().toLowerCase()}`;
  const counts = parProduit.get(cle) ?? { forcelog: 0, speedaf: 0 };

  return chooseCarrier(
    produit.carrier_shares as CarrierShares,
    counts,
    routing.default
  ) as CarrierId;
}


export type ProductRouting = {
  id: string;
  ref: string;
  name: string;
  /** Repartition propre au produit, ou rien s'il suit la generale. */
  shares: Record<string, number> | null;
  /** Colis deja partis pour ce produit, par transporteur. */
  counts: Record<CarrierId, number>;
};

/** Les produits et leur repartition, pour l'ecran des integrations. */
export async function listProductRouting(): Promise<ProductRouting[]> {
  const supabase = getSupabaseServerClient();
  const [{ data }, parProduit] = await Promise.all([
    supabase
      .from("products")
      .select("id,ref,name,forcelog_ref,carrier_shares,status")
      .order("name", { ascending: true }),
    countsParProduit(),
  ]);

  return ((data ?? []) as {
    id: string;
    ref: string;
    name: string;
    forcelog_ref: string | null;
    carrier_shares: Record<string, number> | null;
    status: string;
  }[])
    .filter((p) => p.status !== "Archive")
    .map((p) => ({
      id: p.id,
      ref: p.ref,
      name: p.name,
      shares: p.carrier_shares,
      counts:
        (p.forcelog_ref ? parProduit.get(`ref:${p.forcelog_ref}`) : undefined) ??
        parProduit.get(`nom:${p.name.trim().toLowerCase()}`) ?? {
          forcelog: 0,
          speedaf: 0,
        },
    }));
}

/**
 * Pose ou retire la repartition d'un produit.
 *
 * `null` le remet sous la regle generale : c'est l'etat normal, et il
 * doit rester atteignable en un geste.
 */
export async function saveProductRouting(
  productId: string,
  shares: Record<string, number> | null
): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("products")
    .update({ carrier_shares: shares, updated_at: new Date().toISOString() })
    .eq("id", productId);
  if (error) throw new Error(error.message);
}
