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
