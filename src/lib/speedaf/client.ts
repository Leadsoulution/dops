import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Client Speedaf (Open API v2).
 *
 * Trois choses a savoir avant de lire :
 *
 * 1. L'authentification passe par l'adresse, pas par un en-tete :
 *    `?appCode=...&timestamp=...`, l'horodatage en millisecondes et
 *    perime au bout de quelques minutes. Il est donc calcule a chaque
 *    appel, jamais garde.
 * 2. Le corps est toujours `{"data": ...}` envoye en `text/plain` —
 *    c'est ce que fait leur propre exemple curl, et le serveur refuse
 *    certaines requetes en `application/json`.
 * 3. Rien n'est jamais vrai parce que la reponse est 200 : le succes se
 *    lit dans `success`, et l'erreur dans `error.code` / `error.message`.
 *    Meme piege que chez ForceLog.
 *
 * Les identifiants ne quittent pas le serveur : ce module ne doit
 * jamais etre importe depuis un composant client.
 */

export class SpeedafError extends Error {
  readonly code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "SpeedafError";
    this.code = code;
  }
}

export type SpeedafConfig = {
  /** Adresse de base, production ou UAT. */
  baseUrl: string;
  appCode: string;
  customerCode: string;
  /** Nom de la plateforme, fourni par Speedaf. */
  platformSource: string;
  /** Cle de signature des notifications, fournie par Speedaf. */
  secretKey?: string;
  /**
   * L'entrepot Speedaf ou dort notre marchandise, fourni par eux.
   *
   * Absent : aucun colis de stock n'est possible, puisqu'il n'y a
   * nulle part ou prelever.
   */
  warehouseCode?: string;
};

export const SPEEDAF_PROD = "https://apis.speedaf.com";
export const SPEEDAF_UAT = "https://uat-api.speedaf.com";

/** La configuration lue dans l'environnement, si elle y est complete. */
export function speedafConfig(): SpeedafConfig | null {
  const appCode = process.env.SPEEDAF_APP_CODE;
  const customerCode = process.env.SPEEDAF_CUSTOMER_CODE;
  if (!appCode || !customerCode) return null;
  return {
    baseUrl: process.env.SPEEDAF_BASE_URL || SPEEDAF_PROD,
    appCode,
    customerCode,
    platformSource: process.env.SPEEDAF_PLATFORM_SOURCE || "Orderly",
    secretKey: process.env.SPEEDAF_SECRET_KEY,
  };
}

async function call<T>(
  config: SpeedafConfig,
  path: string,
  data: unknown
): Promise<T> {
  const url = new URL(path, config.baseUrl);
  url.searchParams.set("appCode", config.appCode);
  url.searchParams.set("timestamp", String(Date.now()));

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ data }),
    });
  } catch {
    throw new SpeedafError("Impossible de joindre Speedaf (erreur reseau).");
  }

  let corps: { success?: boolean; error?: { code?: string; message?: string }; data?: T };
  try {
    corps = await res.json();
  } catch {
    throw new SpeedafError(`Reponse Speedaf invalide (HTTP ${res.status}).`);
  }

  if (!corps.success) {
    throw new SpeedafError(
      corps.error?.message ?? `Erreur Speedaf (HTTP ${res.status}).`,
      corps.error?.code
    );
  }
  return deballe(corps.data, res.status) as T;
}

/**
 * Certaines reponses sont emballees deux fois.
 *
 * La liste des regions revient en `{success, data: {success, data: [...]}}`
 * alors que la creation d'un colis revient en `{success, data: {...}}`.
 * Rien dans la documentation ne le dit ; c'est verifie sur leur
 * environnement de test. Prendre `data` sans regarder rendait donc
 * l'enveloppe au lieu du contenu, et la liste paraissait vide.
 *
 * On ne deballe que ce qui est reconnaissable comme une enveloppe —
 * un objet qui porte `success` et `data` — pour ne pas eventrer une
 * reponse qui contiendrait ces noms par hasard.
 */
function deballe(data: unknown, status: number): unknown {
  if (
    data &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    "success" in data &&
    "data" in data
  ) {
    const interne = data as { success?: boolean; data?: unknown; message?: string };
    if (interne.success === false) {
      throw new SpeedafError(
        interne.message ?? `Erreur Speedaf (HTTP ${status}).`
      );
    }
    return interne.data;
  }
  return data;
}

/* ------------------------------------------------------------------ */
/* Colis                                                               */
/* ------------------------------------------------------------------ */

/** L'expediteur : notre depot. Speedaf l'exige a chaque colis. */
export type SpeedafSender = {
  name: string;
  mobile: string;
  address: string;
  provinceName: string;
  cityName: string;
  districtName: string;
};

export type SpeedafOrder = {
  /** Notre reference, pour retrouver la commande. */
  customOrderNo: string;
  acceptName: string;
  acceptMobile: string;
  acceptAddress: string;
  acceptProvinceName: string;
  acceptCityName: string;
  acceptDistrictName: string;
  /** Montant a encaisser, en dirhams. */
  codFee: number;
  /** Poids total du colis, en kilos. */
  parcelWeight: number;
  remark?: string;
  /** Le client peut-il ouvrir le colis avant de payer ? */
  allowOpen?: boolean;
  items: {
    sku: string;
    goodsName: string;
    goodsQTY: number;
    goodsValue: number;
  }[];
};

export type SpeedafParcel = {
  billCode: string;
  labelUrl?: string | null;
  customerOrderNo?: string;
};

/**
 * Cree un colis et rend son numero de bordereau.
 *
 * Les codes figes viennent des annexes de la documentation :
 * PT01 express, DE01 livraison a domicile, TT01 route, ST01 expedition
 * locale, PA02 reglement mensuel. Ils ne varient pas d'une commande a
 * l'autre pour une livraison nationale en paiement a la livraison.
 */
export async function createOrder(
  config: SpeedafConfig,
  sender: SpeedafSender,
  order: SpeedafOrder
): Promise<SpeedafParcel> {
  const data = {
    customOrderNo: order.customOrderNo,
    billCode: "",
    customerCode: config.customerCode,
    platformSource: config.platformSource,
    parcelType: "PT01",
    deliveryType: "DE01",
    transportType: "TT01",
    shipType: "ST01",
    payMethod: "PA02",
    isAllowOpen: order.allowOpen ? 1 : 0,
    acceptName: order.acceptName.slice(0, 100),
    acceptMobile: order.acceptMobile.slice(0, 20),
    acceptAddress: order.acceptAddress.slice(0, 500),
    acceptCountryCode: "MA",
    acceptCountryName: "Morocco",
    acceptProvinceName: order.acceptProvinceName,
    acceptCityName: order.acceptCityName,
    acceptDistrictName: order.acceptDistrictName,
    sendName: sender.name,
    sendAddress: sender.address,
    sendMobile: sender.mobile,
    sendCountryCode: "MA",
    sendCountryName: "Morocco",
    sendProvinceName: sender.provinceName,
    sendCityName: sender.cityName,
    sendDistrictName: sender.districtName,
    parcelWeight: order.parcelWeight,
    piece: 1,
    goodsQTY: order.items.reduce((s, i) => s + i.goodsQTY, 0),
    codFee: order.codFee,
    currencyType: "MAD",
    pickUpAging: 1,
    remark: (order.remark ?? "").slice(0, 200),
    itemList: order.items.map((i) => ({
      sku: i.sku.slice(0, 50),
      goodsName: i.goodsName.slice(0, 100),
      goodsQTY: i.goodsQTY,
      goodsValue: i.goodsValue,
      currencyType: "MAD",
      goodsType: "IT01",
      blInsure: 0,
      battery: 0,
    })),
  };

  const reponse = await call<{
    billCode?: string;
    labelUrl?: string | null;
    customerOrderNo?: string;
    success?: boolean;
    message?: string | null;
  }>(config, "/open-api/express/order/v2/createOrder", data);

  if (!reponse?.billCode) {
    throw new SpeedafError(reponse?.message ?? "Colis refuse par Speedaf.");
  }
  return {
    billCode: reponse.billCode,
    labelUrl: reponse.labelUrl,
    customerOrderNo: reponse.customerOrderNo,
  };
}

/** Annule un colis. Speedaf repond colis par colis. */
export async function cancelOrder(
  config: SpeedafConfig,
  billCode: string,
  reason: string
): Promise<void> {
  const reponse = await call<
    { billCode: string; success: boolean; message?: string }[]
  >(config, "/open-api/express/order/v2/cancelOrder", [
    { customerCode: config.customerCode, billCode, cancelReason: reason },
  ]);
  const ligne = reponse?.find((r) => r.billCode === billCode) ?? reponse?.[0];
  if (ligne && !ligne.success) {
    throw new SpeedafError(ligne.message ?? "Annulation refusee.");
  }
}

/* ------------------------------------------------------------------ */
/* OMS : les colis preleves sur notre stock chez Speedaf               */
/* ------------------------------------------------------------------ */

/**
 * Un colis de stock.
 *
 * Rien a voir avec le colis express : pas d'expediteur, pas de poids,
 * pas de codes de service. C'est logique — la marchandise est deja
 * chez eux, ils la prelevent, l'emballent et la pesent. Nous ne
 * disons que trois choses : quel entrepot, pour qui, et quelles
 * references en quelle quantite.
 *
 * Le chemin n'a pas de `/v2/` : c'est une autre famille d'API, celle
 * de leur systeme de commandes, et non celle de l'express.
 */
export type SpeedafStockOrder = {
  /** Notre reference. Speedaf la limite a 16 caracteres. */
  customOrderNo: string;
  acceptName: string;
  acceptMobile: string;
  acceptAddress: string;
  acceptProvinceName: string;
  acceptCityName: string;
  acceptDistrictName?: string;
  /** Montant a encaisser, en dirhams. 0 pour un colis deja paye. */
  codFee: number;
  remark?: string;
  allowOpen?: boolean;
  /** Une ligne par reference : Speedaf refuse deux fois la meme. */
  items: { sku: string; quantity: number }[];
};

export async function createStockOrder(
  config: SpeedafConfig,
  order: SpeedafStockOrder
): Promise<SpeedafParcel> {
  if (!config.warehouseCode) {
    throw new SpeedafError("Code d'entrepot Speedaf non configure.");
  }

  const data = {
    // Leur documentation se contredit : le tableau des champs dit
    // `customerCode`, tous leurs exemples envoient `customCode`. Les
    // deux partent, et celui qui sert est le leur.
    customCode: config.customerCode,
    customerCode: config.customerCode,
    customOrderNo: order.customOrderNo.slice(0, 16),
    warehouseCode: config.warehouseCode,
    isAllowOpen: order.allowOpen ? 1 : 0,
    acceptName: order.acceptName.slice(0, 100),
    acceptMobile: order.acceptMobile.slice(0, 20),
    acceptAddress: order.acceptAddress.slice(0, 500),
    acceptCountryName: "Morocco",
    acceptCountryCode: "MA",
    acceptProvinceName: order.acceptProvinceName,
    acceptProvinceCode: "",
    acceptCityName: order.acceptCityName,
    acceptCityCode: "",
    acceptDistrictName: order.acceptDistrictName ?? "",
    acceptDistrictCode: "",
    codFee: order.codFee,
    remark: (order.remark ?? "").slice(0, 200),
    // Ni prix ni devise : laisses de cote, Speedaf reprend ceux de sa
    // fiche d'entrepot. Les envoyer ferait diverger deux verites sur
    // la valeur d'un meme article, et la leur est celle qui compte au
    // moment du prelevement.
    productList: order.items.map((i) => ({
      sku: i.sku.slice(0, 64),
      quantity: i.quantity,
    })),
  };

  const reponse = await call<{
    billCode?: string;
    customerOrderNo?: string;
    message?: string | null;
  }>(config, "/open-api/oms/express/order/createOrder", data);

  if (!reponse?.billCode) {
    throw new SpeedafError(
      reponse?.message ?? "Colis de stock refuse par Speedaf."
    );
  }
  return {
    billCode: reponse.billCode,
    labelUrl: null,
    customerOrderNo: reponse.customerOrderNo,
  };
}

export type SpeedafStockItem = {
  productCode: string;
  sku: string;
  name: string;
  unitPrice: number;
  /** Quantite disponible dans l'entrepot. */
  stockNum: number;
  currency: string;
};

/** L'etat du stock que Speedaf detient pour nous. */
export async function inventoryInquiry(
  config: SpeedafConfig
): Promise<SpeedafStockItem[]> {
  if (!config.warehouseCode) {
    throw new SpeedafError("Code d'entrepot Speedaf non configure.");
  }
  const lignes = await call<SpeedafStockItem[]>(
    config,
    "/open-api/oms/express/inventory/inquiry",
    { customCode: config.customerCode, warehouseCode: config.warehouseCode }
  );
  return (lignes ?? []).map((l) => ({
    ...l,
    stockNum: Number(l.stockNum) || 0,
    unitPrice: Number(l.unitPrice) || 0,
  }));
}

export type SpeedafTrack = {
  mailNo: string;
  action: string;
  subAction?: string;
  actionName?: string;
  msgEng?: string;
  msgLoc?: string;
  message?: string;
  time: string;
  /** Photo de la remise, quand le livreur en depose une. */
  pictureUrl?: string;
};

/**
 * Le suivi de plusieurs colis d'un coup.
 *
 * C'est l'avantage de Speedaf sur ForceLog, qui ne repond que d'un
 * colis a la fois : une synchronisation de cinquante colis tient en un
 * appel. La taille maximale de la liste n'etant pas documentee, on la
 * decoupe par precaution.
 */
export async function trackParcels(
  config: SpeedafConfig,
  billCodes: string[],
  tranche = 50
): Promise<Map<string, SpeedafTrack[]>> {
  const out = new Map<string, SpeedafTrack[]>();
  for (let i = 0; i < billCodes.length; i += tranche) {
    const lot = billCodes.slice(i, i + tranche);
    const reponse = await call<{ mailNo: string; tracks: SpeedafTrack[] }[]>(
      config,
      "/open-api/express/track/v2/query",
      { mailNoList: lot }
    );
    for (const colis of reponse ?? []) {
      out.set(colis.mailNo, colis.tracks ?? []);
    }
  }
  return out;
}

/**
 * L'etiquette d'un colis, au format marocain.
 *
 * `labelType: 46` est le bordereau 10x10 propre au Maroc ; les deux
 * autres formats sont des doubles feuilles qui ne tiennent pas sur les
 * imprimantes d'etiquettes.
 */
export async function printLabels(
  config: SpeedafConfig,
  billCodes: string[]
): Promise<{ waybillNo: string; labelUrl?: string; labelBase64?: string }[]> {
  const reponse = await call<{
    orderLabels?: { waybillNo: string; labelUrl?: string; labelBase64?: string }[];
  }>(config, "/open-api/express/order/v2/print", {
    waybillNoList: billCodes,
    labelType: 46,
    withLogo: true,
  });
  return reponse?.orderLabels ?? [];
}

/** Les regions du pays : 1 province, 2 ville, 3 district. */
export function getArea(
  config: SpeedafConfig,
  type: 1 | 2 | 3,
  parentCode = ""
): Promise<{ code: string; name: string }[]> {
  return call(config, "/open-api/common/area/v2/new/getArea", {
    countryCode: "MA",
    parentCode,
    type,
  });
}

/** L'arbre complet province / ville / district d'un pays. */
export function getAreaTree(config: SpeedafConfig): Promise<
  { code: string; name: string; type: number; children?: unknown[] }[]
> {
  return call(config, "/open-api/common/area/v2/getTreeByCountryCode", {
    countryCode: "MA",
  });
}

/** Abonne l'application aux notifications de suivi. */
export function subscribeWebhook(
  config: SpeedafConfig,
  callbackUrl: string
): Promise<unknown> {
  return call(config, "/open-api/express/track/webhook/subscribe", {
    customerCode: config.customerCode,
    callbackUrl,
    appCode: config.appCode,
  });
}

/* ------------------------------------------------------------------ */
/* Notifications                                                       */
/* ------------------------------------------------------------------ */

/**
 * La notification vient-elle bien de Speedaf ?
 *
 * Ils signent `timestamp + "\n" + corps` en HMAC-SHA256 avec la cle du
 * compte. La verification porte sur le corps **brut** : reformater le
 * JSON avant de signer donne une autre signature, et la notification
 * serait rejetee a tort.
 *
 * La comparaison est a temps constant : comparer deux signatures avec
 * `===` laisse fuir, par la duree, de quoi en fabriquer une.
 */
export function verifyWebhook(
  secretKey: string,
  timestamp: string,
  rawBody: string,
  signature: string
): boolean {
  const attendu = createHmac("sha256", secretKey)
    .update(`${timestamp}\n${rawBody}`)
    .digest("hex");
  const recu = signature.replace(/^hmac-sha256=/i, "").trim().toLowerCase();
  if (recu.length !== attendu.length) return false;
  return timingSafeEqual(Buffer.from(recu), Buffer.from(attendu));
}
