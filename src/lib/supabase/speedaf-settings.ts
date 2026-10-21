import "server-only";
import {
  getIntegrationSettings,
  saveIntegrationSettings,
} from "./integrations";
import { decryptToken, encryptToken, canEncrypt } from "@/lib/ads/crypto";
import {
  SPEEDAF_PROD,
  SPEEDAF_UAT,
  type SpeedafConfig,
  type SpeedafSender,
} from "@/lib/speedaf/client";

/**
 * Les identifiants Speedaf, saisis depuis l'application.
 *
 * Ils etaient attendus dans l'environnement du serveur, ce qui
 * obligeait a redeployer pour brancher un transporteur. Ils se
 * saisissent desormais dans l'ecran des integrations, et
 * l'environnement sert de secours : une installation deja configuree
 * continue de marcher sans rien saisir.
 *
 * La cle de signature est chiffree avant d'etre posee en base, comme
 * les jetons publicitaires. Les autres champs sont des identifiants de
 * compte, pas des secrets : ils voyagent en clair, comme le nom de la
 * boutique.
 *
 * Aucun mot de passe nulle part : l'API de Speedaf ne connait que le
 * couple appCode / customerCode. Le compte du portail ne sert qu'a
 * lire ces valeurs, et n'a rien a faire ici.
 */

const CLE = "speedaf";

export type SpeedafSettings = SpeedafConfig & {
  sender: SpeedafSender;
  /** Poids par defaut d'un colis, en kilos. */
  weight: number;
  /** Les quatre derniers caracteres de la cle, pour la reconnaitre. */
  secretHint?: string;
};

export type SpeedafSettingsInput = {
  environment?: "production" | "uat";
  appCode: string;
  customerCode: string;
  platformSource?: string;
  /** Vide : la cle deja enregistree est conservee. */
  secretKey?: string;
  senderName: string;
  senderMobile: string;
  senderAddress: string;
  senderCity: string;
  senderProvince?: string;
  senderDistrict?: string;
  weight?: number;
};

type Stocke = Record<string, string>;

const env = (nom: string) => process.env[nom]?.trim() || "";

/**
 * La configuration effective : ce qui a ete saisi, complete par
 * l'environnement. Rend `null` tant qu'il manque de quoi appeler
 * Speedaf — l'appelant affiche alors l'erreur plutot que d'essayer.
 */
export async function getSpeedafSettings(): Promise<SpeedafSettings | null> {
  const s = (await getIntegrationSettings<Stocke>(CLE).catch(() => ({}))) as Stocke;

  const appCode = s.appCode || env("SPEEDAF_APP_CODE");
  const customerCode = s.customerCode || env("SPEEDAF_CUSTOMER_CODE");
  if (!appCode || !customerCode) return null;

  const chiffre = s.secretKeyCipher;
  const secretKey =
    (chiffre ? decryptToken(chiffre) : null) || env("SPEEDAF_SECRET_KEY") || undefined;

  const senderCity = s.senderCity || env("SPEEDAF_SENDER_CITY");

  return {
    baseUrl:
      s.baseUrl ||
      env("SPEEDAF_BASE_URL") ||
      (s.environment === "uat" ? SPEEDAF_UAT : SPEEDAF_PROD),
    appCode,
    customerCode,
    platformSource:
      s.platformSource || env("SPEEDAF_PLATFORM_SOURCE") || "Orderly",
    secretKey,
    sender: {
      name: s.senderName || env("SPEEDAF_SENDER_NAME"),
      mobile: s.senderMobile || env("SPEEDAF_SENDER_MOBILE"),
      address: s.senderAddress || env("SPEEDAF_SENDER_ADDRESS"),
      cityName: senderCity,
      provinceName: s.senderProvince || env("SPEEDAF_SENDER_PROVINCE") || senderCity,
      districtName: s.senderDistrict || env("SPEEDAF_SENDER_DISTRICT") || senderCity,
    },
    weight: Number(s.weight) || Number(env("SPEEDAF_DEFAULT_WEIGHT")) || 0.5,
    secretHint: secretKey ? `****${secretKey.slice(-4)}` : undefined,
  };
}

/** L'expedition est-elle possible, ou manque-t-il encore quelque chose ? */
export function manquePourExpedier(s: SpeedafSettings | null): string | null {
  if (!s) return "Identifiants Speedaf non configures.";
  const { sender } = s;
  if (!sender.name || !sender.mobile || !sender.address || !sender.cityName) {
    return "Adresse d'expedition Speedaf incomplete.";
  }
  return null;
}

export async function saveSpeedafSettings(
  input: SpeedafSettingsInput
): Promise<void> {
  const ancien = (await getIntegrationSettings<Stocke>(CLE).catch(
    () => ({})
  )) as Stocke;

  const settings: Stocke = {
    environment: input.environment ?? "production",
    baseUrl: input.environment === "uat" ? SPEEDAF_UAT : SPEEDAF_PROD,
    appCode: input.appCode.trim(),
    customerCode: input.customerCode.trim(),
    platformSource: (input.platformSource ?? "Orderly").trim(),
    senderName: input.senderName.trim(),
    senderMobile: input.senderMobile.trim(),
    senderAddress: input.senderAddress.trim(),
    senderCity: input.senderCity.trim(),
    senderProvince: (input.senderProvince || input.senderCity).trim(),
    senderDistrict: (input.senderDistrict || input.senderCity).trim(),
    weight: String(input.weight && input.weight > 0 ? input.weight : 0.5),
  };

  // Une cle laissee vide ne vide pas la cle : on ne redemande pas un
  // secret a chaque correction d'adresse.
  const nouvelle = input.secretKey?.trim();
  if (nouvelle) {
    if (!canEncrypt()) {
      throw new Error(
        "ADS_TOKEN_KEY absente : impossible de chiffrer la cle Speedaf."
      );
    }
    settings.secretKeyCipher = encryptToken(nouvelle);
  } else if (ancien.secretKeyCipher) {
    settings.secretKeyCipher = ancien.secretKeyCipher;
  }

  await saveIntegrationSettings(CLE, settings);
}
