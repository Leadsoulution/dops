/**
 * Pourquoi la connexion a echoue.
 *
 * Le message rendu a l'ecran reste volontairement vague quand les
 * identifiants sont refuses : distinguer "compte inconnu" de "mauvais
 * mot de passe" confirmerait a un inconnu quelles adresses ont un
 * compte.
 *
 * Mais tout le reste n'a rien a voir avec le mot de passe, et le dire
 * pareil envoie chercher du cote du clavier. C'est arrive : le projet
 * Supabase avait depasse son quota et refusait tout — la page de
 * connexion annoncait "mot de passe incorrect" a des gens dont le mot
 * de passe etait juste, et personne ne pouvait le deviner.
 */

export type RefusDeConnexion = {
  /** Ce que lit la personne. */
  message: string;
  /** Code HTTP rendu par la route. */
  http: 401 | 429 | 503;
};

/**
 * Seuls ces codes disent "ces identifiants-la ne vont pas". GoTrue
 * refuse un couple email/mot de passe en 400, et une saisie malformee
 * en 422.
 */
const IDENTIFIANTS = new Set([400, 422]);

export function refusDeConnexion(status?: number): RefusDeConnexion {
  if (status !== undefined && IDENTIFIANTS.has(status)) {
    return { message: "Email ou mot de passe incorrect.", http: 401 };
  }
  if (status === 429) {
    return {
      message:
        "Trop de tentatives de connexion. Attendez une minute avant de reessayer.",
      http: 429,
    };
  }
  // 402 : quota depasse, le projet est bride. 5xx, 0 : la panne ou le
  // reseau. Dans tous ces cas le mot de passe n'y est pour rien.
  return {
    message:
      "Le service de connexion est indisponible. Votre mot de passe n'est pas en cause : reessayez dans un moment, et prevenez un administrateur si cela dure.",
    http: 503,
  };
}
