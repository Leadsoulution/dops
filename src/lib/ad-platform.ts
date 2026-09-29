/**
 * D'ou vient une commande, avant la boutique.
 *
 * WooCommerce sait deja repondre : depuis la version 8.5 il enregistre
 * l'origine de chaque commande dans `_wc_order_attribution_utm_source`,
 * et c'est la colonne "Origin" de son tableau. La valeur y est brute et
 * abregee — "fb", "ig" — parce qu'elle vient telle quelle du lien
 * publicitaire.
 *
 * On la range ici dans une liste fermee. Afficher "fb" a l'ecran
 * obligerait chacun a traduire de tete, et deux campagnes ecrites "FB"
 * et "facebook" passeraient pour deux sources differentes.
 */

export type AdPlatformKey =
  | "facebook"
  | "instagram"
  | "tiktok"
  | "snapchat"
  | "google"
  | "youtube"
  | "whatsapp"
  | "direct";

export type AdPlatformInfo = {
  key: AdPlatformKey;
  label: string;
  /** Couleur de la marque, pour le logo. */
  color: string;
};

export const AD_PLATFORMS: Record<AdPlatformKey, AdPlatformInfo> = {
  facebook: { key: "facebook", label: "Facebook", color: "#1877F2" },
  instagram: { key: "instagram", label: "Instagram", color: "#E4405F" },
  tiktok: { key: "tiktok", label: "TikTok", color: "#010101" },
  snapchat: { key: "snapchat", label: "Snapchat", color: "#FFFC00" },
  google: { key: "google", label: "Google", color: "#4285F4" },
  youtube: { key: "youtube", label: "YouTube", color: "#FF0000" },
  whatsapp: { key: "whatsapp", label: "WhatsApp", color: "#25D366" },
  direct: { key: "direct", label: "Direct", color: "#6B7280" },
};

/**
 * Les ecritures rencontrees pour une meme plateforme.
 *
 * La liste est volontairement large : le parametre du lien est tape a
 * la main dans le gestionnaire de publicites, et personne ne l'ecrit
 * deux fois pareil.
 */
const ALIASES: Record<string, AdPlatformKey> = {
  fb: "facebook",
  facebook: "facebook",
  "facebook.com": "facebook",
  "m.facebook.com": "facebook",
  "l.facebook.com": "facebook",
  meta: "facebook",
  fbads: "facebook",

  ig: "instagram",
  insta: "instagram",
  instagram: "instagram",
  "instagram.com": "instagram",
  "l.instagram.com": "instagram",

  tt: "tiktok",
  tiktok: "tiktok",
  "tiktok.com": "tiktok",
  tiktokads: "tiktok",

  sc: "snapchat",
  snap: "snapchat",
  snapchat: "snapchat",
  "snapchat.com": "snapchat",

  google: "google",
  "google.com": "google",
  adwords: "google",
  googleads: "google",
  gads: "google",

  youtube: "youtube",
  "youtube.com": "youtube",
  yt: "youtube",

  whatsapp: "whatsapp",
  "whatsapp.com": "whatsapp",
  wa: "whatsapp",

  direct: "direct",
  "(direct)": "direct",
  typein: "direct",
};

/**
 * La plateforme derriere une valeur d'attribution.
 *
 * Rend `null` plutot qu'une valeur par defaut : une source inconnue
 * doit rester visible comme telle, pas se deguiser en trafic direct.
 * Une case vide se remarque et se corrige ; un mauvais rangement ne se
 * voit jamais.
 */
export function adPlatformOf(
  utmSource: string | null | undefined
): AdPlatformInfo | null {
  const brut = (utmSource ?? "").trim().toLowerCase();
  if (!brut) return null;

  const direct = ALIASES[brut];
  if (direct) return AD_PLATFORMS[direct];

  // "www.facebook.com", "ads.tiktok.com" : le referent porte le nom de
  // la plateforme sans lui etre egal.
  const sansWww = brut.replace(/^www\./, "");
  if (ALIASES[sansWww]) return AD_PLATFORMS[ALIASES[sansWww]];

  for (const [alias, key] of Object.entries(ALIASES)) {
    if (alias.includes(".") && sansWww.endsWith(alias)) return AD_PLATFORMS[key];
  }

  return null;
}
