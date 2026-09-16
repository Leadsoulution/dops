import { getSupabaseServerClient } from "./server";

/**
 * Acces au dictionnaire des villes canoniques.
 *
 * Le nombre de commandes n'est pas stocke : il se compte a la lecture, en
 * rapprochant la ville ecrite sur chaque commande de la forme canonique
 * ou de l'un de ses alias. Le stocker obligerait a le tenir a jour a
 * chaque commande creee, modifiee ou supprimee, pour une valeur qui n'a
 * d'interet qu'affichee.
 */

/** Une ville livrable, et la facon dont le transporteur la designe. */
export type CarrierCity = { name: string; carrierCode?: string };

export type TariffSource = "canonique" | "transporteur" | "force";

export type City = {
  id: string;
  key: string;
  name: string;
  aliases: string[];
  carrierCode?: string;
  tariff: number;
  tariffSource: TariffSource;
  active: boolean;
  updatedAt: string;
  /** Commandes rattachees a cette ville. Calcule, jamais ecrit. */
  orders: number;
};

type CityRow = {
  id: string;
  key: string;
  name: string;
  aliases: string[] | null;
  carrier_code: string | null;
  tariff: number | string;
  tariff_source: string;
  active: boolean;
  updated_at: string;
};

const COLUMNS =
  "id,key,name,aliases,carrier_code,tariff,tariff_source,active,updated_at";

/** "Beni Mellal", "BENI-MELLAL" et "beni mellal" donnent "beni_mellal". */
export function cityKey(name: string): string {
  return name
    .normalize("NFD")
    // Retire les accents : Kenitra ecrit avec ou sans accent est la meme
    // ville. La plage vise les diacritiques isoles par la decomposition.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function toCity(row: CityRow, orders: number): City {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    aliases: row.aliases ?? [],
    carrierCode: row.carrier_code ?? undefined,
    tariff: Number(row.tariff),
    tariffSource: row.tariff_source as TariffSource,
    active: row.active,
    updatedAt: row.updated_at,
    orders,
  };
}

export type CityInput = {
  name: string;
  key?: string;
  aliases?: string[];
  carrierCode?: string;
  tariff?: number;
  tariffSource?: TariffSource;
  active?: boolean;
};

function toRow(input: Partial<CityInput>) {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) row.name = input.name.trim();
  if (input.key !== undefined) row.key = input.key.trim();
  if (input.aliases !== undefined) row.aliases = input.aliases;
  if (input.carrierCode !== undefined) row.carrier_code = input.carrierCode || null;
  if (input.tariff !== undefined) row.tariff = input.tariff;
  if (input.tariffSource !== undefined) row.tariff_source = input.tariffSource;
  if (input.active !== undefined) row.active = input.active;
  return row;
}

/** Compte les commandes par cle de ville, alias compris. */
async function countOrdersByKey(
  rows: CityRow[]
): Promise<Map<string, number>> {
  const supabase = getSupabaseServerClient();
  const { data } = await supabase.from("leads").select("ville");

  // Chaque forme rencontree pointe vers la cle canonique.
  const byForm = new Map<string, string>();
  for (const row of rows) {
    byForm.set(cityKey(row.name), row.key);
    byForm.set(row.key, row.key);
    for (const alias of row.aliases ?? []) byForm.set(cityKey(alias), row.key);
  }

  const counts = new Map<string, number>();
  for (const lead of (data ?? []) as { ville: string | null }[]) {
    if (!lead.ville) continue;
    const key = byForm.get(cityKey(lead.ville));
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Tarif de livraison par forme de ville rencontree : le nom canonique,
 * la cle et chaque alias pointent vers le meme prix. Sert a afficher un
 * tarif sur une commande qui n'en porte pas.
 *
 * Les villes desactivees sont exclues : ne plus livrer une ville et
 * continuer d'en afficher le prix serait trompeur.
 */
export async function tariffByCityForm(): Promise<Map<string, number>> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("cities")
    .select("key,name,aliases,tariff")
    .eq("active", true);
  if (error) throw new Error(error.message);

  const tariffs = new Map<string, number>();
  for (const row of (data ?? []) as Pick<
    CityRow,
    "key" | "name" | "aliases" | "tariff"
  >[]) {
    const tariff = Number(row.tariff);
    tariffs.set(cityKey(row.name), tariff);
    tariffs.set(row.key, tariff);
    for (const alias of row.aliases ?? []) tariffs.set(cityKey(alias), tariff);
  }
  return tariffs;
}

/**
 * Toutes les formes acceptees d'une ville livrable — sa cle, son nom et
 * chacun de ses alias, normalises — vers ce qu'il faut annoncer au
 * transporteur.
 *
 * Sert deux fois : a refuser une commande dont la ville est mal ecrite,
 * et a traduire cette ville en code transporteur au moment de l'envoi.
 * Les villes desactivees sont exclues : on ne livre pas ou l'on a cesse
 * de livrer.
 */
export async function deliverableCities(): Promise<Map<string, CarrierCity>> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("cities")
    .select("key,name,aliases,carrier_code")
    .eq("active", true);
  if (error) throw new Error(error.message);

  const cities = new Map<string, CarrierCity>();
  for (const row of (data ?? []) as Pick<
    CityRow,
    "key" | "name" | "aliases" | "carrier_code"
  >[]) {
    const entry: CarrierCity = {
      name: row.name,
      carrierCode: row.carrier_code ?? undefined,
    };
    cities.set(row.key, entry);
    cities.set(cityKey(row.name), entry);
    for (const alias of row.aliases ?? []) cities.set(cityKey(alias), entry);
  }
  return cities;
}

export async function listCities(): Promise<City[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("cities")
    .select(COLUMNS)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);

  const rows = data as CityRow[];
  const counts = await countOrdersByKey(rows);
  return rows.map((row) => toCity(row, counts.get(row.key) ?? 0));
}

export async function createCity(input: CityInput): Promise<City> {
  if (!input.name?.trim()) throw new Error("Le nom de la ville est requis.");
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("cities")
    .insert({ ...toRow(input), key: input.key?.trim() || cityKey(input.name) })
    .select(COLUMNS)
    .single();
  if (error) {
    throw new Error(
      error.code === "23505"
        ? "Une ville avec cette cle existe deja."
        : error.message
    );
  }
  return toCity(data as CityRow, 0);
}

export async function updateCity(
  id: string,
  changes: Partial<CityInput>
): Promise<City> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("cities")
    .update(toRow(changes))
    .eq("id", id)
    .select(COLUMNS)
    .single();
  if (error) throw new Error(error.message);

  const row = data as CityRow;
  const counts = await countOrdersByKey([row]);
  return toCity(row, counts.get(row.key) ?? 0);
}

export async function deleteCities(ids: string[]): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("cities").delete().in("id", ids);
  if (error) throw new Error(error.message);
}

/**
 * Ajoute ou met a jour des villes en masse, par cle.
 *
 * Une ville dont le tarif a ete force garde son prix : c'est tout l'objet
 * d'un tarif force que de survivre a un reimport transporteur.
 */
export async function upsertCities(
  inputs: CityInput[]
): Promise<{ inserted: number; updated: number }> {
  const supabase = getSupabaseServerClient();
  const { data: existing } = await supabase
    .from("cities")
    .select("key,tariff_source,aliases");
  const known = new Map(
    (
      (existing ?? []) as {
        key: string;
        tariff_source: string;
        aliases: string[] | null;
      }[]
    ).map((r) => [r.key, r])
  );

  // Regroupement par cle avant l'envoi, pour deux raisons.
  //
  // D'abord Postgres : un upsert qui touche deux fois la meme ligne dans
  // la meme commande echoue. Or la liste de ForceLog contient de vrais
  // doublons ("Rabat" et "RABAT", deux codes pour la meme ville).
  //
  // Ensuite l'usage : la seconde orthographe est precisement ce qu'un
  // dictionnaire d'alias doit connaitre, donc on la garde en alias plutot
  // que de la jeter.
  const grouped = new Map<
    string,
    { key: string; name: string; aliases: Set<string>; carrierCode?: string; tariff: number; tariffSource: TariffSource }
  >();

  for (const input of inputs) {
    if (!input.name?.trim()) continue;
    const name = input.name.trim();
    const key = input.key?.trim() || cityKey(name);
    const current = grouped.get(key);

    if (!current) {
      grouped.set(key, {
        key,
        name,
        aliases: new Set([
          ...(known.get(key)?.aliases ?? []),
          ...(input.aliases ?? []),
        ]),
        carrierCode: input.carrierCode,
        tariff: input.tariff ?? 0,
        tariffSource: input.tariffSource ?? "canonique",
      });
      continue;
    }

    for (const alias of input.aliases ?? []) current.aliases.add(alias);
    if (name !== current.name) current.aliases.add(name);
  }

  const rows = [...grouped.values()].map((city) => {
    // Un tarif force l'emporte sur ce que renvoie le transporteur.
    const forced = known.get(city.key)?.tariff_source === "force";
    return {
      key: city.key,
      name: city.name,
      // Les alias deja enregistres sont conserves : un import ne doit pas
      // effacer le travail de normalisation fait a la main.
      aliases: [...city.aliases].filter((a) => a !== city.name),
      carrier_code: city.carrierCode ?? null,
      ...(forced
        ? {}
        : { tariff: city.tariff, tariff_source: city.tariffSource }),
      updated_at: new Date().toISOString(),
    };
  });

  if (rows.length === 0) return { inserted: 0, updated: 0 };

  const { error } = await supabase
    .from("cities")
    .upsert(rows, { onConflict: "key" });
  if (error) throw new Error(error.message);

  const updated = rows.filter((r) => known.has(r.key)).length;
  return { inserted: rows.length - updated, updated };
}
