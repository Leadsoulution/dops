/**
 * Conversion des depenses publicitaires en dirhams.
 *
 * Un compte Meta peut facturer en dollars et un compte TikTok en euros,
 * pendant que toutes les commandes se comptent en MAD. Additionner sans
 * convertir donnerait un total qui ne veut rien dire, et un cout par
 * livraison faux d'un facteur dix.
 *
 * Les taux sont fixes, pas releves : une depense d'hier convertie au
 * cours d'aujourd'hui changerait de valeur chaque nuit, et les
 * historiques ne seraient plus comparables. Le taux applique est
 * d'ailleurs enregistre avec chaque ligne (`fx_rate`), de sorte qu'un
 * changement de taux ne reecrit jamais le passe.
 *
 * `ADS_FX_USD_MAD`, `ADS_FX_EUR_MAD`, etc. permettent de les corriger
 * sans toucher au code.
 */

/** Taux par defaut, donnes par l'exploitant. */
const DEFAUT: Record<string, number> = {
  MAD: 1,
  USD: 10,
  CAD: 7,
};

/**
 * Le taux d'une devise vers le dirham, ou `null` si personne ne l'a
 * donne. `null` n'est pas 1 : confondre les deux ferait passer mille
 * euros pour mille dirhams, en silence.
 */
export function fxRate(currency: string): number | null {
  const code = (currency || "").trim().toUpperCase();
  if (!code) return null;

  const surcharge = process.env[`ADS_FX_${code}_MAD`];
  if (surcharge) {
    const n = Number(surcharge);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return DEFAUT[code] ?? null;
}

export type Converted = {
  /** Montant en dirhams, ou le montant d'origine si le taux manque. */
  mad: number;
  /** Taux applique. 1 quand il a fallu se resoudre a ne pas convertir. */
  rate: number;
  /** Vrai quand la devise est inconnue : a dire a l'ecran. */
  unknownCurrency: boolean;
};

export function toMad(amount: number, currency: string): Converted {
  const rate = fxRate(currency);
  if (rate === null) return { mad: amount, rate: 1, unknownCurrency: true };
  return {
    mad: Math.round(amount * rate * 100) / 100,
    rate,
    unknownCurrency: false,
  };
}

/** Les devises que l'on sait convertir, pour l'afficher dans les reglages. */
export function knownCurrencies(): string[] {
  return Object.keys(DEFAUT);
}
