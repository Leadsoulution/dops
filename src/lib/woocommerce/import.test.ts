import { describe, it, expect, vi, beforeEach } from "vitest";
import type { WooOrder } from "./client";

/**
 * La reprise des commandes de la boutique.
 *
 * Deux pieges, tous deux silencieux, tous deux deja payes : la lecture
 * des commandes connues qui s'arrete a mille lignes, et le lot
 * d'insertion qu'un seul doublon fait echouer en entier.
 */

const from = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: () => ({ from }),
}));

let commandes: WooOrder[] = [];
vi.mock("./client", () => ({
  listRecentOrders: () => Promise.resolve(commandes),
}));

vi.mock("@/lib/push", () => ({ sendPushToAll: () => Promise.resolve() }));
vi.mock("@/lib/supabase/lead-events", () => ({
  recordLeadCreated: () => Promise.resolve(),
}));
vi.mock("@/lib/webhooks/send", () => ({ emit: () => Promise.resolve() }));

import { importWooOrders } from "./import";

const commande = (id: number): WooOrder => ({
  id,
  number: String(id),
  status: "processing",
  date_created: "2026-10-16T18:00:00",
  total: "199.00",
  billing: { first_name: "Client", last_name: String(id), phone: "0600000000" },
  line_items: [{ product_id: 1, name: "Collier", sku: "SKU1", quantity: 1, total: "199.00" }],
});

/** Les numeros demandes a la base, pour verifier qu'on ne lit pas tout. */
let demandes: number[] | null = null;
/** Lignes posees, une a une ou par lot. */
let posees: Record<string, unknown>[] = [];
/** Numeros que la base refuse comme deja presents. */
let dejaLa = new Set<number>();

function stub() {
  demandes = null;
  posees = [];
  from.mockImplementation((table: string) => {
    if (table === "products") {
      const chain = {
        select: () => chain,
        not: () => Promise.resolve({ data: [], error: null }),
      };
      return chain;
    }
    return {
      select: (colonnes: string) => ({
        in: (_col: string, valeurs: number[]) => {
          demandes = valeurs;
          return Promise.resolve({
            data: valeurs
              .filter((v) => dejaLa.has(v))
              .map((v) => ({ woo_order_id: v })),
            error: null,
          });
        },
        // Une lecture sans borne ne doit plus exister dans ce chemin.
        not: () => {
          throw new Error(`lecture non bornee de ${colonnes}`);
        },
      }),
      insert: (rows: Record<string, unknown> | Record<string, unknown>[]) => {
        const lot = Array.isArray(rows) ? rows : [rows];
        const conflit = lot.find((r) => dejaLa.has(r.woo_order_id as number));
        const reponse = conflit
          ? { data: null, error: { code: "23505", message: "doublon" } }
          : {
              data: lot.map((r, i) => {
                posees.push(r);
                return { id: `id-${i}`, reference: r.reference as string };
              }),
              error: null,
            };
        return {
          select: () => ({
            ...Promise.resolve(reponse),
            then: (f: (v: unknown) => unknown) => Promise.resolve(reponse).then(f),
            single: () =>
              Promise.resolve(
                conflit
                  ? { data: null, error: { code: "23505", message: "doublon" } }
                  : {
                      data: { id: "id-1", reference: lot[0].reference as string },
                      error: null,
                    }
              ),
          }),
        };
      },
    };
  });
}

beforeEach(() => {
  from.mockReset();
  dejaLa = new Set();
  commandes = [];
});

describe("importWooOrders", () => {
  it("ne demande que les numeros des commandes lues", async () => {
    // La lecture de toutes les commandes connues s'arretait a mille
    // lignes : passe ce seuil, les plus recentes repassaient pour
    // nouvelles et l'insertion echouait en entier.
    commandes = [commande(1801), commande(1802)];
    stub();
    await importWooOrders();
    expect(demandes).toEqual([1801, 1802]);
  });

  it("n'importe pas deux fois une commande deja reprise", async () => {
    commandes = [commande(1801), commande(1802)];
    dejaLa = new Set([1801]);
    stub();
    const r = await importWooOrders();
    expect(r.importees).toBe(1);
    expect(posees.map((p) => p.woo_order_id)).toEqual([1802]);
  });

  it("laisse entrer les autres quand un doublon fait echouer le lot", async () => {
    // Deux notifications simultanees lisent la meme liste : la seconde
    // trouve une commande deja posee par la premiere. Sans reprise
    // ligne a ligne, tout le lot etait perdu.
    commandes = [commande(1801), commande(1802)];
    stub();
    dejaLa = new Set([1801]);
    // La base ne l'annonce pas comme connue a la lecture, mais la
    // refuse a l'insertion : c'est la course entre deux imports.
    from.mockImplementation(((table: string) => {
      if (table === "products") {
        const chain = { select: () => chain, not: () => Promise.resolve({ data: [], error: null }) };
        return chain;
      }
      return {
        select: () => ({
          in: () => Promise.resolve({ data: [], error: null }),
        }),
        insert: (rows: Record<string, unknown> | Record<string, unknown>[]) => {
          const lot = Array.isArray(rows) ? rows : [rows];
          const conflit = lot.some((r) => dejaLa.has(r.woo_order_id as number));
          return {
            select: () => ({
              then: (f: (v: unknown) => unknown) =>
                Promise.resolve(
                  conflit
                    ? { data: null, error: { code: "23505", message: "doublon" } }
                    : { data: lot.map((r) => ({ id: "x", reference: r.reference })), error: null }
                ).then(f),
              single: () => {
                const seul = lot[0];
                if (dejaLa.has(seul.woo_order_id as number)) {
                  return Promise.resolve({ data: null, error: { code: "23505", message: "doublon" } });
                }
                posees.push(seul);
                return Promise.resolve({
                  data: { id: "y", reference: seul.reference },
                  error: null,
                });
              },
            }),
          };
        },
      };
    }) as never);

    const r = await importWooOrders();
    expect(posees.map((p) => p.woo_order_id)).toEqual([1802]);
    expect(r.importees).toBe(1);
  });

  it("ecarte les commandes annulees", async () => {
    commandes = [{ ...commande(1801), status: "cancelled" }];
    stub();
    const r = await importWooOrders();
    expect(r.importees).toBe(0);
    expect(posees).toEqual([]);
  });
});
