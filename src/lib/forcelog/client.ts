import {
  ForceLogApiError,
  type AddParcelParams,
  type ForceLogCities,
  type ForceLogParcel,
  type ForceLogStock,
  type ForceLogTrackingEvent,
  type StockLine,
  type RelaunchParams,
  type RelaunchZoneParams,
} from "./types";

const HEALTH_URL = "https://api.forcelog.ma/health";
const BASE_URL = "https://api.forcelog.ma/customer";

type RequestOptions = {
  method?: "GET" | "POST";
  path?: string;
  url?: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
};

type RawObject = Record<string, unknown>;

function isResultObject(value: unknown): value is { RESULT: string; MESSAGE?: string } & RawObject {
  return (
    typeof value === "object" &&
    value !== null &&
    "RESULT" in (value as RawObject)
  );
}

/**
 * Low-level ForceLog request helper.
 *
 * ForceLog always answers with HTTP 200, even for business errors, so the
 * HTTP status is never a reliable success signal. In practice (verified
 * against the live API, since the written docs simplify this) each
 * response nests two things at the top level:
 *   - `AUTH: { RESULT, MESSAGE }` — whether the API key itself was valid.
 *   - one operation-specific key (its name varies per endpoint, e.g.
 *     `GET-PARCELS`) holding that call's own `RESULT`/`MESSAGE` plus the
 *     actual payload fields. A few endpoints (e.g. `/Cities`) have no such
 *     wrapper and just return their data next to `AUTH`.
 *
 * This helper checks `AUTH` first, then locates the operation block by
 * scanning for the first other key whose value carries its own `RESULT`,
 * rather than hard-coding each endpoint's wrapper key name.
 */
async function forceLogRequest<T>(
  apiKey: string,
  { method = "GET", path, url, query, body }: RequestOptions
): Promise<T> {
  const target = new URL(url ?? `${BASE_URL}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) target.searchParams.set(key, String(value));
    }
  }

  let res: Response;
  try {
    res = await fetch(target, {
      method,
      headers: {
        "X-API-Key": apiKey,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ForceLogApiError(
      "Impossible de joindre ForceLog (erreur reseau)."
    );
  }

  let data: RawObject;
  try {
    data = await res.json();
  } catch {
    throw new ForceLogApiError(
      `Reponse ForceLog invalide (HTTP ${res.status}).`
    );
  }

  const auth = data.AUTH;
  if (isResultObject(auth) && auth.RESULT !== "SUCCESS") {
    throw new ForceLogApiError(
      auth.MESSAGE ?? "Authentification ForceLog echouee."
    );
  }

  const operationEntry = Object.entries(data).find(
    ([key, value]) => key !== "AUTH" && isResultObject(value)
  );

  if (operationEntry) {
    const operation = operationEntry[1] as { RESULT: string; MESSAGE?: string } & RawObject;
    if (operation.RESULT !== "SUCCESS") {
      throw new ForceLogApiError(operation.MESSAGE ?? "Erreur ForceLog inconnue.");
    }
    return operation as unknown as T;
  }

  // No per-operation wrapper (e.g. /Cities) — AUTH already validated above,
  // so the rest of the payload is the data itself.
  const rest = { ...data };
  delete rest.AUTH;
  return rest as unknown as T;
}

export async function checkHealth(apiKey: string): Promise<boolean> {
  try {
    const res = await fetch(HEALTH_URL, {
      headers: { "X-API-Key": apiKey },
    });
    if (!res.ok) return false;
    const data = await res.json().catch(() => null);
    if (data && typeof data === "object" && "RESULT" in data) {
      return (data as { RESULT: string }).RESULT === "SUCCESS";
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Produits disponibles dans le depot ForceLog, pour les colis de stock.
 * Comme `/Cities`, la reponse n'a pas de bloc d'operation : les donnees
 * sont directement sous la cle `Stock`.
 */
export async function getStock(apiKey: string): Promise<ForceLogStock> {
  const data = await forceLogRequest<{ Stock: ForceLogStock }>(apiKey, {
    path: "/Stock",
  });
  return data.Stock ?? {};
}

/** Formate des lignes de stock au format attendu par AddParcel : "ref:qte,ref:qte". */
export function formatStockParam(lines: StockLine[]): string {
  return lines
    .filter((line) => line.ref && line.quantity > 0)
    .map((line) => `${line.ref}:${line.quantity}`)
    .join(",");
}

export async function getCities(apiKey: string): Promise<ForceLogCities> {
  const data = await forceLogRequest<{ Cities: ForceLogCities }>(apiKey, {
    path: "/Cities",
  });
  return data.Cities;
}

/**
 * Cree un colis et renvoie le colis cree.
 *
 * Verifie sur l'API reelle : la reponse imbrique le colis sous
 * `ADD-PARCEL.NEW-PARCEL`, et non a plat dans le bloc d'operation comme
 * les autres endpoints — d'ou le deballage explicite ici.
 */
export async function addParcel(
  apiKey: string,
  params: AddParcelParams
): Promise<ForceLogParcel> {
  const data = await forceLogRequest<{ "NEW-PARCEL"?: ForceLogParcel }>(apiKey, {
    method: "POST",
    path: "/Parcels/AddParcel",
    body: params,
  });
  const parcel = data["NEW-PARCEL"];
  if (!parcel?.TRACKING_NUMBER) {
    throw new ForceLogApiError(
      "ForceLog n'a pas renvoye de numero de suivi pour ce colis."
    );
  }
  return parcel;
}

export function getParcel(apiKey: string, code: string): Promise<ForceLogParcel> {
  return forceLogRequest<ForceLogParcel>(apiKey, {
    path: "/Parcels/GetParcel",
    query: { Code: code },
  });
}

export function getTracking(
  apiKey: string,
  code: string
): Promise<{ TRACKING: ForceLogTrackingEvent[] }> {
  return forceLogRequest<{ TRACKING: ForceLogTrackingEvent[] }>(apiKey, {
    path: "/Parcels/GetTracking",
    query: { Code: code },
  });
}

export function getParcelLabel(
  apiKey: string,
  code: string
): Promise<{ FILE_BASE64: string }> {
  return forceLogRequest<{ FILE_BASE64: string }>(apiKey, {
    path: "/Parcels/GetParcelLabel",
    query: { Code: code },
  });
}

/**
 * Liste les colis recents.
 *
 * Important, verifie sur l'API reelle : tous les filtres documentes
 * (CODE, ORDER_NUM, PHONE, STATUS) ainsi que PAGE et LIMIT sont
 * **ignores** par ForceLog. L'endpoint renvoie invariablement les 20
 * colis les plus recents. Les parametres sont tout de meme transmis au
 * cas ou ForceLog les implementerait plus tard, mais aucun appelant ne
 * doit compter dessus : la correspondance se fait cote application, par
 * numero de suivi.
 */
export function getParcels(
  apiKey: string,
  filters: {
    page?: number;
    limit?: number;
    status?: string;
    orderNum?: string;
    code?: string;
    phone?: string;
    dateFrom?: string;
    dateTo?: string;
  } = {}
): Promise<{ PARCELS: ForceLogParcel[]; TOTAL?: number }> {
  return forceLogRequest<{ PARCELS: ForceLogParcel[]; TOTAL?: number }>(
    apiKey,
    {
      path: "/Parcels/GetParcels",
      query: {
        PAGE: filters.page,
        LIMIT: filters.limit,
        STATUS: filters.status,
        ORDER_NUM: filters.orderNum,
        CODE: filters.code,
        PHONE: filters.phone,
        DATE_FROM: filters.dateFrom,
        DATE_TO: filters.dateTo,
      },
    }
  );
}

/**
 * Renvoie, pour les colis recents, le statut de livraison et le statut de
 * paiement, indexes par numero de suivi.
 */
/** Plafond constate de LIMIT : au-dela, la reponse reste a cent colis. */
const MAX_PARCELS_PER_CALL = 100;

type ParcelStatus = { status: string; statusCode: string; situation: string };

function toStatus(parcel: ForceLogParcel): ParcelStatus {
  return {
    status: parcel.STATUS ?? "",
    statusCode: parcel.STATUS_CODE ?? "",
    situation: parcel.SITUATION ?? "",
  };
}

/**
 * Statuts des colis suivis.
 *
 * Un seul appel ramene les cent derniers, ce qui couvre largement une
 * semaine d'activite. Les numeros qui n'y figurent pas — un colis ancien
 * encore en cours, ou un volume superieur a cent sur la periode — sont
 * demandes un par un : `CODE` rend exactement ce colis, quel que soit son
 * age.
 *
 * Cette recherche individuelle n'existait pas avant le 18 septembre
 * 2026 : l'API ne rendait alors que vingt colis, sans pagination ni
 * recherche, et les statuts plus anciens etaient irrattrapables.
 */
export async function getRecentParcelStatuses(
  apiKey: string,
  trackingNumbers: string[] = []
): Promise<Map<string, ParcelStatus>> {
  const { PARCELS } = await getParcels(apiKey, { limit: MAX_PARCELS_PER_CALL });

  const map = new Map<string, ParcelStatus>();
  for (const parcel of PARCELS ?? []) {
    if (!parcel.TRACKING_NUMBER) continue;
    map.set(parcel.TRACKING_NUMBER, toStatus(parcel));
  }

  const missing = trackingNumbers.filter((code) => code && !map.has(code));
  if (missing.length === 0) return map;

  // Un colis introuvable ou une erreur ponctuelle ne doit pas emporter
  // la synchronisation des autres.
  await Promise.all(
    missing.map(async (code) => {
      try {
        const single = await getParcels(apiKey, { code });
        const parcel = single.PARCELS?.[0];
        if (parcel?.TRACKING_NUMBER) {
          map.set(parcel.TRACKING_NUMBER, toStatus(parcel));
        }
      } catch {
        /* Ce colis restera sur son dernier statut connu. */
      }
    })
  );

  return map;
}

export function relaunch(
  apiKey: string,
  params: RelaunchParams
): Promise<ForceLogParcel> {
  return forceLogRequest<ForceLogParcel>(apiKey, {
    method: "POST",
    path: "/Parcels/Relaunch",
    body: params,
  });
}

export function relaunchZone(
  apiKey: string,
  params: RelaunchZoneParams
): Promise<ForceLogParcel> {
  return forceLogRequest<ForceLogParcel>(apiKey, {
    method: "POST",
    path: "/Parcels/RelaunchZone",
    body: params,
  });
}

export function deleteParcel(apiKey: string, code: string): Promise<void> {
  return forceLogRequest<void>(apiKey, {
    method: "POST",
    path: "/Parcels/DeleteParcel",
    body: { CODE: code },
  });
}
