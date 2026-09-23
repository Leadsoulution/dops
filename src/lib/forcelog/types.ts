export type ForceLogResult = "SUCCESS" | "ERROR";

export type ForceLogResponse<T> = {
  RESULT: ForceLogResult;
  MESSAGE?: string;
} & Partial<T>;

export type ForceLogParcelStatus =
  | "NEW_PARCEL"
  | "WAITING_PICKUP"
  | "IN_PROGRESS"
  | "DELIVERED"
  | "RETURNED"
  | "CANCELLED";

export type ForceLogCity = {
  CODE: string;
  NAME: string;
  D_FEES: number;
  D_FEES_SAME_CITY: number;
};

export type ForceLogCities = Record<string, ForceLogCity>;

export type AddParcelParams = {
  ORDER_NUM: string;
  RECEIVER: string;
  PHONE: string;
  CITY: string;
  ADDRESS: string;
  COMMENT?: string;
  PRODUCT_NATURE?: string;
  COD?: number;
  CAN_OPEN?: boolean;
  STOCK?: string;
  FRAGILE?: boolean;
  CARTON?: string;
};

/** Le livreur charge du colis, tel que ForceLog le nomme. */
export type ForceLogDeliveryAgent = {
  NAME?: string;
  PHONE?: string;
};

export type ForceLogParcel = {
  TRACKING_NUMBER: string;
  ORDER_NUM?: string;
  /** Libelle francais du statut de livraison, ex. "En cours de livraison". */
  STATUS?: string;
  /** Code machine du statut, ex. "DISTRIBUTION", "DELIVERED". */
  STATUS_CODE?: string;
  /** Statut de paiement, ex. "Non Paye", "Facture". */
  SITUATION?: string;
  PRICE?: string;
  DELIVERY_FEES?: number | null;
  RECEIVER?: string;
  PHONE?: string;
  CITY_NAME?: string;
  ADDRESS?: string;
  COMMENT?: string;
  PRODUCT_NATURE?: string;
  CREATION_TIME?: string;
  /**
   * Presente seulement sur GetParcel, jamais sur GetParcels : c'est la
   * raison d'interroger les colis un par un.
   */
  DELIVERY_AGENT?: ForceLogDeliveryAgent;
  SECONDARY_STATUS?: string;
};

export type ForceLogTrackingEvent = {
  STATUS_CODE: string;
  STATUS_NAME: string;
  CITY_NAME?: string;
  TIME: string;
  TIMESTAMP: number;
};

/**
 * Une variante en stock chez ForceLog.
 * Cles en minuscules, contrairement au reste de l'API : forme verifiee
 * sur l'endpoint reel, la documentation decrit un format different.
 */
export type ForceLogStockVariant = {
  ref: string;
  name: string;
  barcode?: string;
  quantity: number;
  waiting_quantity?: number;
};

export type ForceLogStockProduct = {
  product_name: string;
  image?: string;
  note?: string;
  has_variants?: number;
  variants: ForceLogStockVariant[];
};

export type ForceLogStock = Record<string, ForceLogStockProduct>;

/** Ligne de stock choisie pour un colis de stock. */
export type StockLine = {
  ref: string;
  quantity: number;
};

export type RelaunchParams = {
  CODE: string;
  RECEIVER: string;
  PHONE: string;
  ADDRESS: string;
  COD?: number;
  COMMENT?: string;
};

export type RelaunchZoneParams = RelaunchParams & {
  CITY: string;
};

export class ForceLogApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForceLogApiError";
  }
}
