/**
 * Quel transporteur prend la prochaine commande.
 *
 * Deux transporteurs, une repartition voulue — soixante-dix pour cent
 * chez l'un, trente chez l'autre — et une question a trancher a chaque
 * confirmation : celui-ci, ou l'autre ?
 *
 * Le tirage au sort respecte les proportions a la longue, mais pas sur
 * vingt commandes, et il ne s'explique pas : personne ne peut dire
 * pourquoi ce colis-la est parti chez l'un plutot que chez l'autre.
 *
 * On prend donc celui qui est le plus en retard sur sa part. Avec
 * 70/30, le premier colis part chez le premier, et la repartition reelle
 * colle a la cible des la dixieme commande. La decision se verifie : il
 * suffit de compter ce qui est deja parti.
 *
 * Module pur : le comptage appartient a l'appelant.
 */

export type CarrierId = string;

/** Part voulue de chaque transporteur, en pourcentage. */
export type CarrierShares = Record<CarrierId, number>;

/** Commandes deja envoyees chez chacun. */
export type CarrierCounts = Record<CarrierId, number>;

/**
 * Les parts ramenees a une somme de cent, les transporteurs a zero
 * ecartes.
 *
 * Une somme qui ne fait pas cent n'est pas une erreur a refuser : deux
 * transporteurs a 50 et 30 veulent dire 62,5 % et 37,5 %. Ce qui serait
 * une erreur, c'est de s'arreter la-dessus au moment d'expedier.
 */
export function normalizeShares(shares: CarrierShares): CarrierShares {
  const positives = Object.entries(shares).filter(([, v]) => v > 0);
  const total = positives.reduce((s, [, v]) => s + v, 0);
  if (total === 0) return {};
  return Object.fromEntries(
    positives.map(([id, v]) => [id, (v / total) * 100])
  );
}

/**
 * Le transporteur de la prochaine commande.
 *
 * Celui dont la part reelle est la plus en dessous de sa part voulue.
 * A egalite — la premiere commande, ou une repartition deja parfaite —
 * c'est le transporteur par defaut qui prend, puis le mieux dote.
 *
 * Rend le defaut si aucune part n'est definie : une repartition vide ne
 * doit pas empecher une commande de partir.
 */
export function chooseCarrier(
  shares: CarrierShares,
  counts: CarrierCounts,
  parDefaut: CarrierId
): CarrierId {
  const parts = normalizeShares(shares);
  const ids = Object.keys(parts);
  if (ids.length === 0) return parDefaut;
  if (ids.length === 1) return ids[0];

  const total = ids.reduce((s, id) => s + (counts[id] ?? 0), 0);
  if (total === 0) {
    // Rien n'est encore parti : le defaut ouvre, s'il a une part.
    return parts[parDefaut] ? parDefaut : plusGrandePart(parts);
  }

  /** De combien ce transporteur est en dessous de sa part voulue. */
  const retard = (id: CarrierId) =>
    parts[id] - ((counts[id] ?? 0) / total) * 100;

  /** A egalite, le defaut passe devant, puis la plus grosse part. */
  const devance = (a: CarrierId, b: CarrierId) => {
    const ecart = retard(a) - retard(b);
    if (Math.abs(ecart) > 1e-9) return ecart > 0;
    if (a === parDefaut) return true;
    if (b === parDefaut) return false;
    return parts[a] > parts[b];
  };

  return ids.reduce((gagnant, id) => (devance(id, gagnant) ? id : gagnant));
}

function plusGrandePart(parts: CarrierShares): CarrierId {
  return Object.entries(parts).sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * La repartition reellement obtenue, pour l'afficher a cote de la
 * cible : une consigne qu'on ne peut pas verifier ne vaut rien.
 */
export function actualShares(counts: CarrierCounts): CarrierShares {
  const total = Object.values(counts).reduce((s, v) => s + v, 0);
  if (total === 0) return {};
  return Object.fromEntries(
    Object.entries(counts).map(([id, v]) => [id, (v / total) * 100])
  );
}
