/**
 * Montants, arrondis a la dizaine.
 *
 * Les prix de la boutique se terminent par 9 — 199, 299, 189 — mais un
 * livreur encaisse un compte rond : c'est le montant arrondi qui est
 * annonce au client au telephone, affiche dans l'application et reclame
 * par le transporteur. Les trois doivent concorder, sinon l'un des trois
 * ment.
 *
 * Module sans dependance : il sert aussi bien a l'affichage qu'au calcul
 * du montant a encaisser envoye a ForceLog.
 */

export function roundToTen(value: number): number {
  return Math.round(value / 10) * 10;
}

/** Valeur numerique d'un montant ecrit "199 MAD", si elle existe. */
export function amountValue(amount: string | undefined): number | undefined {
  if (!amount) return undefined;
  const digits = amount.replace(/[^\d.,-]/g, "").replace(",", ".");
  const value = Number.parseFloat(digits);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * "199 MAD" devient "200 MAD". Ce qui ne porte pas de nombre — "Sans
 * tarif" — ressort intact : arrondir une absence n'a pas de sens.
 */
export function displayAmount(amount: string | undefined): string {
  const value = amountValue(amount);
  if (value === undefined) return amount ?? "";
  // Le suffixe de la chaine d'origine est conserve : "MAD", "dh" ou rien.
  const suffix = (amount ?? "").replace(/[\d.,\s-]/g, "");
  const rounded = roundToTen(value);
  return suffix ? `${rounded} ${suffix}` : `${rounded}`;
}
