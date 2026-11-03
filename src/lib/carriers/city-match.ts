/**
 * Faire correspondre nos villes a celles d'un transporteur.
 *
 * Chaque transporteur tient sa propre liste, et elles ne se
 * ressemblent pas : l'un ecrit "Beni Mellal", l'autre "BENI MELLAL -
 * KHENIFRA" ; l'un dessert une localite que l'autre ignore. Garder une
 * seule liste obligerait a choisir une orthographe, et les commandes
 * de l'autre transporteur seraient refusees.
 *
 * Nos villes restent donc la reference — c'est ce que l'agent saisit —
 * et chaque transporteur a sa table de correspondance.
 *
 * Module pur : la lecture des deux listes appartient a l'appelant.
 */

/** Une ville telle que le transporteur la nomme. */
export type CarrierCity = {
  code: string;
  name: string;
  /** Region, exigee par Speedaf a la creation du colis. */
  parentName?: string;
  /** Notre cle canonique, quand la correspondance est etablie. */
  cityKey?: string;
  /**
   * Les autres ecritures du meme lieu chez le transporteur.
   *
   * Speedaf nomme Kelâat M'Gouna de cinq facons selon la langue. Ne
   * comparer que la premiere laissait la ville introuvable, alors
   * qu'une des autres correspond a la notre.
   */
  autresNoms?: string[];
};

/** "Beni Mellal", "BENI-MELLAL" et "beni mellal" donnent "beni_mellal". */
export function normalizeCity(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Les ecritures sous lesquelles une ville de transporteur peut etre
 * reconnue.
 *
 * Speedaf prefixe ses zones du nom de la ville — "CASA - MAARIF",
 * "CASA - ANFA" — et suffixe ses regions — "BENI MELLAL - KHENIFRA".
 * On retient donc le nom entier et, s'il contient un tiret, chacune de
 * ses moities : "casa_maarif" ne doit pas empecher "maarif" d'etre
 * trouve, ni "beni_mellal_khenifra" d'etre reconnu comme Beni Mellal.
 */
export function cityAliases(name: string): string[] {
  const entier = normalizeCity(name);
  const morceaux = name
    .split(/\s*[-–]\s*/)
    .map((m) => normalizeCity(m))
    .filter((m) => m.length > 2);
  return [...new Set([entier, ...morceaux])];
}

/**
 * Une seule ecriture par ville, pour une liste a presenter.
 *
 * Un transporteur nomme parfois deux fois le meme lieu : Speedaf tient
 * un arbre de regions et une liste de communes, et "EL KELAA MGOUNA"
 * y cotoie "KELAAT M'GOUNA". Les montrer toutes les deux a l'agent,
 * c'est lui demander de deviner laquelle part.
 *
 * La plus courte gagne, comme au rapprochement : entre "CASABLANCA"
 * et "CASABLANCA AEROPORT", c'est la ville qu'on veut.
 */
export function uneSeuleEcriture(noms: string[]): string[] {
  const parEcriture = new Map<string, string>();
  for (const nom of noms) {
    const cle = normalizeCity(nom);
    if (!cle) continue;
    const vue = parEcriture.get(cle);
    if (!vue || nom.length < vue.length) parEcriture.set(cle, nom);
  }
  return [...parEcriture.values()].sort((a, b) => a.localeCompare(b, "fr"));
}

/**
 * Rapproche automatiquement les deux listes.
 *
 * Seules les correspondances exactes sont posees : une ville reconnue
 * a l'a-peu-pres enverrait des colis a cent kilometres de leur
 * destination. Le reste ressort dans `sansCorrespondance`, pour etre
 * tranche a la main.
 *
 * Quand plusieurs villes du transporteur portent la meme ecriture, la
 * plus courte gagne : entre "CASABLANCA" et "CASABLANCA AEROPORT
 * MOHAMED V TERMINAL 2", c'est la ville qu'on veut, pas le terminal.
 */
export function matchCities(
  nosVilles: { key: string; name: string; aliases?: string[] }[],
  cellesDuTransporteur: CarrierCity[]
): {
  matched: Map<string, CarrierCity>;
  sansCorrespondance: string[];
} {
  const parEcriture = new Map<string, CarrierCity>();
  for (const ville of cellesDuTransporteur) {
    const ecritures = [
      ...cityAliases(ville.name),
      ...(ville.autresNoms ?? []).flatMap((n) => cityAliases(n)),
    ];
    for (const ecriture of new Set(ecritures)) {
      const existante = parEcriture.get(ecriture);
      if (!existante || ville.name.length < existante.name.length) {
        parEcriture.set(ecriture, ville);
      }
    }
  }

  const matched = new Map<string, CarrierCity>();
  const sansCorrespondance: string[] = [];

  for (const nous of nosVilles) {
    const ecritures = [
      normalizeCity(nous.name),
      nous.key,
      ...(nous.aliases ?? []).map(normalizeCity),
    ];
    const trouvee = ecritures
      .map((e) => parEcriture.get(e))
      .find((v): v is CarrierCity => Boolean(v));
    if (trouvee) matched.set(nous.key, { ...trouvee, cityKey: nous.key });
    else sansCorrespondance.push(nous.key);
  }

  return { matched, sansCorrespondance };
}
