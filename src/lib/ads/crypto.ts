import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "node:crypto";

/**
 * Chiffrement des jetons publicitaires.
 *
 * Les identifiants WooCommerce et Google dorment en clair dans
 * `integration_settings` : qui lit la base lit les cles. Un jeton
 * publicitaire donne acces aux depenses et aux audiences d'un compte
 * Meta ou TikTok, et ne peut pas suivre le meme chemin.
 *
 * Il est donc chiffre avant d'etre ecrit, avec une cle qui vit hors de
 * la base — dans la variable ADS_TOKEN_KEY. Une copie de la base ne
 * suffit alors plus a s'en servir.
 *
 * AES-256-GCM plutot que CBC : il authentifie ce qu'il chiffre. Un
 * texte chiffre modifie est refuse au dechiffrement au lieu de rendre
 * des octets faux en silence.
 */

const ALGO = "aes-256-gcm";
/** Recommandation du NIST pour GCM : 96 bits. */
const IV_BYTES = 12;
const PREFIX = "v1";

/**
 * La cle de chiffrement, derivee de la variable d'environnement.
 *
 * Le hachage sert a obtenir 32 octets quelle que soit la longueur de la
 * variable : une cle trop courte ferait echouer AES au moment d'ecrire,
 * c'est-a-dire trop tard.
 */
function key(): Buffer {
  const secret = process.env.ADS_TOKEN_KEY;
  if (!secret || secret.length < 16) {
    throw new Error(
      "ADS_TOKEN_KEY absente ou trop courte : impossible de chiffrer un jeton."
    );
  }
  return createHash("sha256").update(secret).digest();
}

/** Cette instance peut-elle chiffrer ? Sert a l'afficher, pas a decider. */
export function canEncrypt(): boolean {
  return Boolean(process.env.ADS_TOKEN_KEY && process.env.ADS_TOKEN_KEY.length >= 16);
}

/**
 * Chiffre un jeton. Le resultat porte sa version, son vecteur
 * d'initialisation et son sceau : tout ce qu'il faut pour le relire, et
 * rien qui aide a le casser.
 */
export function encryptToken(plain: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    PREFIX,
    iv.toString("base64"),
    tag.toString("base64"),
    data.toString("base64"),
  ].join(".");
}

/**
 * Dechiffre un jeton. Rend `null` plutot que de lever quand le texte est
 * illisible : une cle changee ou une ligne abimee doit se traduire par
 * "ce compte est a reconnecter", pas par une page en erreur.
 */
export function decryptToken(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const parts = stored.split(".");
  if (parts.length !== 4 || parts[0] !== PREFIX) return null;
  try {
    const decipher = createDecipheriv(
      ALGO,
      key(),
      Buffer.from(parts[1], "base64")
    );
    decipher.setAuthTag(Buffer.from(parts[2], "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(parts[3], "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Les derniers caracteres d'un jeton, pour le reconnaitre sans le
 * reveler. C'est la seule forme qui a le droit d'atteindre le
 * navigateur.
 */
export function tokenHint(plain: string): string {
  return plain.length <= 4 ? "****" : `****${plain.slice(-4)}`;
}
