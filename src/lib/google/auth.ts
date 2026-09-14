import "server-only";
import { createSign } from "node:crypto";

/**
 * Jeton d'acces Google, obtenu depuis un compte de service.
 *
 * Google propose une bibliotheque officielle, volumineuse et qui fait
 * cent choses dont nous n'avons besoin d'aucune. Le protocole tient en
 * vingt lignes : on signe un jeton avec la cle privee du compte de
 * service, on l'echange contre un jeton d'acces.
 *
 * Un compte de service plutot qu'un compte utilisateur : personne n'a a
 * se reconnecter, et la feuille est partagee avec lui comme avec un
 * collegue.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets";

export type ServiceAccount = {
  client_email: string;
  private_key: string;
};

export class GoogleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleError";
  }
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Les jetons durent une heure ; on les garde le temps de leur validite. */
let cached: { token: string; expiresAt: number; email: string } | null = null;

export async function getAccessToken(account: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  // Une marge de trente secondes : un jeton qui expire pendant l'appel
  // echouerait au pire moment, en pleine ecriture.
  if (cached && cached.email === account.client_email && cached.expiresAt > now + 30) {
    return cached.token;
  }

  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: account.client_email,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    })
  );

  let signature: string;
  try {
    const signer = createSign("RSA-SHA256");
    signer.update(`${header}.${claims}`);
    // La cle privee arrive souvent avec des \n litteraux, selon la facon
    // dont le fichier JSON a ete copie.
    signature = base64url(
      signer.sign(account.private_key.replace(/\\n/g, "\n"))
    );
  } catch {
    throw new GoogleError(
      "Cle privee du compte de service illisible. Collez le fichier JSON entier, sans le modifier."
    );
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${signature}`,
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new GoogleError(
      data.error_description ??
        "Google a refuse le compte de service. Verifiez que l'API Google Sheets est activee sur le projet."
    );
  }

  cached = {
    token: data.access_token,
    expiresAt: now + (Number(data.expires_in) || 3600),
    email: account.client_email,
  };
  return cached.token;
}
