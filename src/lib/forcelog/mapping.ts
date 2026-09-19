import type { AddParcelParams } from "./types";
import { roundToTen } from "@/lib/amount";

/**
 * Minimal shape this mapping needs from a Lead2Door lead/order — kept
 * decoupled from the full `Lead` type in `leads-data.ts` so this module
 * has no dependency on the dashboard component tree and stays easy to
 * unit test in isolation.
 */
export type MappableOrder = {
  reference: string;
  client: string;
  phone: string;
  ville?: string;
  /**
   * Ville telle que le transporteur la designe — son code. Resolue par
   * l'appelant ; `ville` reste le nom lisible, qui sert a l'adresse.
   */
  carrierCity?: string;
  adresse?: string;
  amount: string;
  productName: string;
  /** "stock" preleve la marchandise chez ForceLog, "simple" part de notre depot. */
  parcelType?: "simple" | "stock";
  /** References a prelever pour un colis de stock, format "ref:qte,ref:qte". */
  stockItems?: string;
  /** Consigne du client, reprise telle quelle dans le COMMENT du colis. */
  customerNote?: string;
};

/**
 * Montant a encaisser, arrondi a la dizaine comme celui affiche dans
 * l'application : le livreur doit reclamer exactement la somme que
 * l'agent a annoncee au client.
 */
function parseAmount(amount: string): number | undefined {
  const digits = amount.replace(/[^\d.,-]/g, "").replace(",", ".");
  const value = Number.parseFloat(digits);
  return Number.isFinite(value) ? roundToTen(value) : undefined;
}

/**
 * Maps a Lead2Door order to ForceLog's `AddParcel` payload.
 *
 * - COD (cash to collect) comes from the order's `amount`.
 * - CITY/ADDRESS fall back to placeholders when missing on the order so
 *   the request still has the required fields — callers should prefer
 *   validating those are present before calling this in production.
 */
export function mapOrderToParcel(order: MappableOrder): AddParcelParams {
  const params: AddParcelParams = {
    ORDER_NUM: order.reference.slice(0, 20),
    RECEIVER: order.client.slice(0, 50),
    PHONE: order.phone.slice(0, 14),
    CITY: (order.carrierCity || order.ville || "").slice(0, 50),
    ADDRESS: (order.adresse ?? order.ville ?? "").slice(0, 100),
    PRODUCT_NATURE: order.productName.slice(0, 100),
    COD: parseAmount(order.amount),
  };

  // La consigne du client est ce que le livreur lira sur le bordereau :
  // c'est le seul canal par lequel un "livrer apres 19H" l'atteint.
  // Vide, le champ est omis plutot qu'envoye a blanc.
  const note = order.customerNote?.trim();
  if (note) params.COMMENT = note.slice(0, 255);

  // Le champ STOCK est ce qui fait d'un colis un colis de stock : ForceLog
  // preleve alors les references indiquees dans son propre depot. Sans lui,
  // le colis est simple et part de notre depot.
  if (order.parcelType === "stock" && order.stockItems) {
    params.STOCK = order.stockItems;
  }

  return params;
}
