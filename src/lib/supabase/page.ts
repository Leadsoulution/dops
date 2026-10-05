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

/** Largeur maximale d'une vague, pour ne pas inonder la base. */
const VAGUE_MAX = 8;

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

  /*
   * Les tranches partent par vagues de plus en plus larges.
   *
   * Le journal des modifications depasse neuf mille lignes : dix
   * allers-retours l'un apres l'autre, a trois ou quatre dixiemes de
   * seconde chacun, faisaient attendre quatre secondes devant une page
   * qui ne demandait qu'a s'afficher.
   *
   * Tout lancer d'un coup ne marche pas non plus : le nombre de lignes
   * est inconnu avant d'avoir lu, et demander cinquante tranches a une
   * table qui en a cent-quarante gacherait quarante-neuf requetes.
   *
   * D'ou la montee en puissance : une tranche, puis deux, puis quatre,
   * puis huit. Une petite table coute toujours une seule requete, une
   * grande se lit en quatre vagues au lieu de dix attentes.
   */
  let prochaine = 0;
  let vague = 1;

  while (prochaine < MAX_CHUNKS) {
    const taille = Math.min(vague, MAX_CHUNKS - prochaine);
    const resultats = await Promise.all(
      Array.from({ length: taille }, (_, i) => {
        const from = (prochaine + i) * CHUNK;
        return query().range(from, from + CHUNK - 1);
      })
    );

    let derniere = false;
    // `Promise.all` garde l'ordre du tableau, pas celui des reponses :
    // le tri demande dans la requete est donc respecte.
    for (const { data, error } of resultats) {
      if (error) throw new Error(error.message);
      const batch = data ?? [];
      rows.push(...batch);
      // Une tranche incomplete est la derniere. Ce qui suit dans la
      // meme vague est vide, et la vague d'apres n'a pas lieu d'etre.
      if (batch.length < CHUNK) {
        derniere = true;
        break;
      }
    }
    if (derniere) break;

    prochaine += taille;
    vague = Math.min(vague * 2, VAGUE_MAX);
  }

  return rows;
}
