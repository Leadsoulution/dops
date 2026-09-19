/**
 * Lecture complete d'une table, par tranches.
 *
 * Supabase plafonne toute lecture a mille lignes et ne previent pas : la
 * requete reussit, il en manque simplement la suite. Le journal des
 * modifications a depasse ce seuil, et comme il est lu du plus ancien au
 * plus recent, ce sont les gestes les plus recents qui disparaissaient
 * des statistiques — celles-ci se figeaient a mesure que l'activite
 * augmentait, sans aucune erreur nulle part.
 *
 * Cette fonction demande donc des tranches jusqu'a ce que la table soit
 * epuisee. Elle vaut pour toute lecture dont le nombre de lignes suit
 * l'activite : commandes, evenements, paiements.
 */

/** Taille d'une tranche. Le plafond de Supabase, demande explicitement. */
const CHUNK = 1000;

/**
 * Garde-fou : cinquante tranches, soit cinquante mille lignes. Au-dela,
 * c'est qu'une requete ne se termine pas comme prevu, et mieux vaut
 * rendre ce qu'on a que boucler indefiniment.
 */
const MAX_CHUNKS = 50;

type Sliceable<T> = {
  range: (from: number, to: number) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>;
};

export async function fetchAll<T>(
  /**
   * Fabrique la requete. Appelee a chaque tranche, parce qu'un
   * constructeur de requete Supabase ne se rejoue pas : une fois
   * attendu, il garde son resultat.
   */
  query: () => Sliceable<T>
): Promise<T[]> {
  const rows: T[] = [];

  for (let chunk = 0; chunk < MAX_CHUNKS; chunk++) {
    const from = chunk * CHUNK;
    const { data, error } = await query().range(from, from + CHUNK - 1);
    if (error) throw new Error(error.message);

    const batch = data ?? [];
    rows.push(...batch);
    // Une tranche incomplete est la derniere.
    if (batch.length < CHUNK) break;
  }

  return rows;
}
