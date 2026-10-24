import "server-only";
import { getSupabaseServerClient, isSupabaseServerConfigured } from "./server";
import { fetchAll } from "./page";
import { cityKey, deliverableCities } from "./cities";
import { getCarrierRouting } from "./carriers";
import { getSpeedafSettings } from "./speedaf-settings";
import { getArea } from "@/lib/speedaf/client";
import { matchCities, normalizeCity, type CarrierCity } from "@/lib/carriers/city-match";
import type { CarrierId } from "@/lib/carriers/registry";

/**
 * La liste des villes de chaque transporteur, tenue a part.
 *
 * ForceLog garde la sienne dans le dictionnaire historique, ou son
 * code vit a cote du nom canonique. Speedaf a la sienne, importee de
 * son API : huit cent treize villes dont la moitie nous est inconnue,
 * et qui ignorent la moitie des notres.
 *
 * Les melanger obligerait a choisir une orthographe et ferait croire
 * qu'une localite desservie par l'un l'est par l'autre. Le
 * dictionnaire reste la reference — c'est ce que l'agent saisit — et
 * chaque transporteur y accroche sa propre correspondance.
 */

type Row = {
  carrier: string;
  code: string;
  name: string;
  parent_code: string | null;
  parent_name: string | null;
  city_key: string | null;
  active: boolean;
};

/** Les villes d'un transporteur, telles qu'il les nomme. */
export async function listCarrierCities(
  carrier: CarrierId
): Promise<CarrierCity[]> {
  if (!isSupabaseServerConfigured) return [];
  const supabase = getSupabaseServerClient();
  const rows = await fetchAll<Row>(() =>
    supabase
      .from("carrier_cities")
      .select("carrier,code,name,parent_code,parent_name,city_key,active")
      .eq("carrier", carrier)
      .eq("active", true)
      .order("name", { ascending: true })
  );
  return rows.map((r) => ({
    code: r.code,
    name: r.name,
    parentName: r.parent_name ?? undefined,
    cityKey: r.city_key ?? undefined,
  }));
}

/**
 * Les villes de notre dictionnaire qu'un transporteur sait livrer.
 *
 * ForceLog repond depuis le dictionnaire, ou son code est pose a cote
 * de chaque ville ; Speedaf depuis sa propre liste. L'appelant n'a pas
 * a savoir lequel des deux il interroge.
 */
export async function deliverableKeys(
  carrier: CarrierId
): Promise<Set<string>> {
  if (carrier === "forcelog") {
    const villes = await deliverableCities().catch(() => new Map());
    // `deliverableCities` indexe toutes les ecritures acceptees ; on ne
    // garde que les cles canoniques.
    return new Set([...villes.keys()].map((forme) => normalizeCity(forme)));
  }
  const { matched } = await rapprochement(carrier);
  return new Set(matched.keys());
}

/**
 * Le rapprochement entre notre dictionnaire et la liste d'un
 * transporteur, refait a la lecture.
 *
 * Le `city_key` pose a l'import ne suffit pas : une seule ville chez
 * eux peut en desservir deux chez nous — Speedaf livre "M Diq -
 * Fnideq" d'une seule zone, la ou nous avons deux villes — et une
 * ligne ne porte qu'une cle. Rejouer le rapprochement donne la reponse
 * juste dans les deux sens, et reste coherent avec ce qui partira
 * reellement.
 */
async function rapprochement(carrier: CarrierId) {
  const supabase = getSupabaseServerClient();
  const [leurs, nos] = await Promise.all([
    listCarrierCities(carrier),
    fetchAll<{ key: string; name: string; aliases: string[] | null }>(() =>
      supabase.from("cities").select("key,name,aliases").eq("active", true)
    ),
  ]);
  return matchCities(
    nos.map((c) => ({ key: c.key, name: c.name, aliases: c.aliases ?? [] })),
    leurs
  );
}

/** La ville Speedaf correspondant a une ville ecrite sur une commande. */
export async function speedafCityFor(
  ville: string | null | undefined
): Promise<CarrierCity | null> {
  const cle = cityKey(ville ?? "");
  if (!cle || !isSupabaseServerConfigured) return null;

  const supabase = getSupabaseServerClient();
  const { data } = await supabase
    .from("carrier_cities")
    .select("carrier,code,name,parent_code,parent_name,city_key,active")
    .eq("carrier", "speedaf")
    .eq("city_key", cle)
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  const row = data as Row | null;
  if (row) {
    return {
      code: row.code,
      name: row.name,
      parentName: row.parent_name ?? undefined,
      cityKey: row.city_key ?? undefined,
    };
  }

  // Pas de cle posee : la ville partage peut-etre une zone avec une
  // autre, qui a pris la ligne. On rejoue le rapprochement.
  const { matched } = await rapprochement("speedaf");
  return matched.get(cle) ?? null;
}

export type ImportResult = {
  villes: number;
  regions: number;
  rapprochees: number;
  sansCorrespondance: string[];
  /** Villes qui ont quitte leur liste et ne sont plus proposees. */
  retirees?: number;
};

/**
 * Importe le referentiel de Speedaf et le rapproche du notre.
 *
 * Les correspondances sont recalculees a chaque import : une ville
 * ajoutee chez eux, ou renommee chez nous, se rattrape en relancant.
 * Une correspondance posee a la main n'est pas ecrasee — elle a ete
 * tranchee par quelqu'un qui savait.
 */
export async function importSpeedafCities(): Promise<ImportResult> {
  const config = await getSpeedafSettings();
  if (!config) throw new Error("Identifiants Speedaf non configures.");
  const supabase = getSupabaseServerClient();

  const regions = await getArea(config, 1);
  const villes: CarrierCity[] = [];
  for (const region of regions) {
    for (const v of await getArea(config, 2, region.code)) {
      villes.push({ code: v.code, name: v.name, parentName: region.name });
    }
  }
  if (villes.length === 0) throw new Error("Speedaf n'a rendu aucune ville.");

  const nos = await fetchAll<{ key: string; name: string; aliases: string[] | null }>(
    () => supabase.from("cities").select("key,name,aliases").eq("active", true)
  );

  const { matched, sansCorrespondance } = matchCities(
    nos.map((c) => ({ key: c.key, name: c.name, aliases: c.aliases ?? [] })),
    villes
  );
  const parCode = new Map(
    [...matched.values()].map((v) => [v.code, v.cityKey as string])
  );

  const lignes = villes.map((v) => ({
    carrier: "speedaf",
    code: v.code,
    name: v.name,
    parent_code: regions.find((r) => r.name === v.parentName)?.code ?? null,
    parent_name: v.parentName ?? null,
    /*
     * La correspondance est refaite a chaque import, jamais heritee.
     *
     * Une ville rapprochee lors d'un import precedent peut ne plus
     * l'etre : le bac a sable et la production ne nomment pas toujours
     * la meme reference pareil, et garder l'ancienne cle ferait partir
     * un colis vers une ville que personne n'a choisie.
     */
    city_key: parCode.get(v.code) ?? null,
    active: true,
    updated_at: new Date().toISOString(),
  }));

  // Par paquets : huit cents lignes en une requete passent mal.
  for (let i = 0; i < lignes.length; i += 200) {
    const { error } = await supabase
      .from("carrier_cities")
      .upsert(lignes.slice(i, i + 200), { onConflict: "carrier,code" });
    if (error) throw new Error(error.message);
  }

  /*
   * Ce qui n'est plus dans leur liste cesse d'etre livrable.
   *
   * La table est un miroir : une ville retiree de chez eux — ou
   * heritee d'un autre environnement, le bac a sable et la production
   * n'ayant pas les memes codes — resterait sinon proposee, et le
   * colis serait refuse a la creation. On la desactive plutot que de
   * l'effacer : elle explique encore les commandes deja parties.
   */
  const vivants = new Set(villes.map((v) => v.code));
  const anciens = await fetchAll<{ code: string }>(() =>
    supabase
      .from("carrier_cities")
      .select("code")
      .eq("carrier", "speedaf")
      .eq("active", true)
  );
  const retirees = anciens.map((a) => a.code).filter((c) => !vivants.has(c));
  for (let i = 0; i < retirees.length; i += 200) {
    const { error } = await supabase
      .from("carrier_cities")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("carrier", "speedaf")
      .in("code", retirees.slice(i, i + 200));
    if (error) throw new Error(error.message);
  }

  return {
    villes: villes.length,
    regions: regions.length,
    rapprochees: matched.size,
    sansCorrespondance,
    retirees: retirees.length,
  };
}

export type DictionaryImport = {
  /** Villes Speedaf versees au dictionnaire. */
  ajoutees: number;
  /** Villes qu'il dessert et que nous connaissions deja. */
  deja: number;
  /** Villes Speedaf desormais rattachees a une ville du dictionnaire. */
  rapprochees: number;
};

/**
 * Verse au dictionnaire les villes que seul Speedaf dessert.
 *
 * Le dictionnaire n'a longtemps connu que les villes de ForceLog, le
 * seul transporteur. Speedaf en dessert cinq cent vingt-neuf autres :
 * tant qu'elles manquent, un client de ces villes-la ne peut pas etre
 * saisi, alors qu'un transporteur sait l'atteindre.
 *
 * L'ajout est strictement additif. Une ville deja connue n'est jamais
 * reecrite — ni son nom, ni son tarif, ni son code ForceLog : elle a
 * peut-etre ete corrigee a la main, et un import ne doit pas effacer
 * une decision. Les nouvelles arrivent sans code ForceLog, ce qui est
 * la verite : il ne les dessert pas.
 */
export async function addSpeedafCitiesToDictionary(): Promise<DictionaryImport> {
  const supabase = getSupabaseServerClient();
  const [leurs, nos, routing] = await Promise.all([
    listCarrierCities("speedaf"),
    fetchAll<{ key: string; name: string; aliases: string[] | null }>(() =>
      supabase.from("cities").select("key,name,aliases")
    ),
    getCarrierRouting(),
  ]);
  if (leurs.length === 0) {
    throw new Error("Aucune ville Speedaf importee : lancez d'abord leur import.");
  }

  const { matched } = matchCities(
    nos.map((c) => ({ key: c.key, name: c.name, aliases: c.aliases ?? [] })),
    leurs
  );
  const dejaPrises = new Set([...matched.values()].map((v) => v.code));

  /*
   * Une cle ne peut appartenir qu'a une ville.
   *
   * Le rapprochement est exact ; la normalisation, elle, rapproche
   * davantage — "M'Diq" et "M Diq" donnent la meme cle. Inserer sans
   * regarder ferait echouer le lot entier sur un doublon, ou pire,
   * ecraserait la ville existante.
   */
  const clesConnues = new Set(nos.map((c) => c.key));
  const aAjouter: { key: string; name: string; tariff: number }[] = [];
  for (const ville of leurs) {
    if (dejaPrises.has(ville.code)) continue;
    const cle = cityKey(ville.name);
    if (!cle || clesConnues.has(cle)) continue;
    clesConnues.add(cle);
    aAjouter.push({
      key: cle,
      name: ville.name,
      tariff: routing.tariffs.speedaf,
    });
  }

  const maintenant = new Date().toISOString();
  for (let i = 0; i < aAjouter.length; i += 200) {
    const { error } = await supabase.from("cities").insert(
      aAjouter.slice(i, i + 200).map((v) => ({
        key: v.key,
        name: v.name,
        aliases: [],
        // Pas de code ForceLog : il ne dessert pas ces villes-la.
        carrier_code: null,
        tariff: v.tariff,
        tariff_source: "transporteur",
        active: true,
        updated_at: maintenant,
      }))
    );
    if (error) throw new Error(error.message);
  }

  /*
   * Le rapprochement, refait sur le dictionnaire elargi.
   *
   * Sans cela, les villes qu'on vient d'ajouter resteraient sans cle
   * cote Speedaf et un colis pour l'une d'elles serait refuse a
   * l'expedition, alors qu'elle figure maintenant dans la liste.
   */
  const apres = await fetchAll<{ key: string; name: string; aliases: string[] | null }>(
    () => supabase.from("cities").select("key,name,aliases").eq("active", true)
  );
  const { matched: refait } = matchCities(
    apres.map((c) => ({ key: c.key, name: c.name, aliases: c.aliases ?? [] })),
    leurs
  );
  for (const ville of refait.values()) {
    if (dejaPrises.has(ville.code)) continue;
    const { error } = await supabase
      .from("carrier_cities")
      .update({ city_key: ville.cityKey, updated_at: maintenant })
      .eq("carrier", "speedaf")
      .eq("code", ville.code);
    if (error) throw new Error(error.message);
  }

  return {
    ajoutees: aAjouter.length,
    deja: dejaPrises.size,
    rapprochees: refait.size,
  };
}
