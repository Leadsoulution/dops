import { describe, it, expect, vi, beforeEach } from "vitest";

const from = vi.fn();
vi.mock("./server", () => ({ getSupabaseServerClient: () => ({ from }) }));

import { getCarrierFloat, daysSince } from "./carrier-float";

type Row = {
  amount: string | null;
  payment_status: string | null;
  delivery_status_code: string | null;
  delivery_date: string | null;
};

const MAINTENANT = new Date("2026-09-27T12:00:00.000Z");

const livree = (o: Partial<Row>): Row => ({
  amount: "199 MAD",
  payment_status: "En cours de facturation",
  delivery_status_code: "DELIVERED",
  delivery_date: "2026-09-26 10:00",
  ...o,
});

function stub(rows: Row[]) {
  from.mockImplementation(() => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      range: (a: number, b: number) =>
        Promise.resolve({ data: rows.slice(a, b + 1), error: null }),
    };
    return chain;
  });
}

beforeEach(() => from.mockReset());

describe("getCarrierFloat", () => {
  it("compte l'argent encaisse et pas encore verse", async () => {
    stub([livree({}), livree({}), livree({ payment_status: "Facture" })]);
    const f = await getCarrierFloat(MAINTENANT);
    // 199 s'arrondit a 200 : c'est ce que le livreur reclame.
    expect(f.amount).toBe(600);
    expect(f.orders).toBe(3);
    expect(f.pendingInvoice).toEqual({ amount: 400, orders: 2 });
    expect(f.invoiced).toEqual({ amount: 200, orders: 1 });
  });

  it("sort du compte un virement constate", async () => {
    stub([livree({ payment_status: "Paye" }), livree({ payment_status: "Payé" })]);
    const f = await getCarrierFloat(MAINTENANT);
    expect(f.amount).toBe(0);
    expect(f.orders).toBe(0);
  });

  it("ne confond pas 'Non Paye' avec un versement recu", async () => {
    // "Non Paye" contient "paye" : le piege a deja coute cher ailleurs.
    stub([livree({ payment_status: "Non Paye" })]);
    const f = await getCarrierFloat(MAINTENANT);
    expect(f.orders).toBe(1);
    expect(f.pendingInvoice.orders).toBe(1);
  });

  it("ne confond pas 'En cours de facturation' avec 'Facture'", async () => {
    stub([livree({ payment_status: "En cours de facturation" })]);
    const f = await getCarrierFloat(MAINTENANT);
    expect(f.invoiced.orders).toBe(0);
    expect(f.pendingInvoice.orders).toBe(1);
  });

  it("donne l'age de la plus ancienne somme due", async () => {
    stub([
      livree({ delivery_date: "2026-09-17 13:51" }),
      livree({ delivery_date: "2026-09-26 16:36" }),
    ]);
    const f = await getCarrierFloat(MAINTENANT);
    expect(f.oldestDate).toBe("2026-09-17 13:51");
    expect(f.oldestDays).toBe(9);
    // Une seule depasse la semaine.
    expect(f.overWeek).toBe(1);
  });

  it("supporte une livraison sans date", async () => {
    stub([livree({ delivery_date: null })]);
    const f = await getCarrierFloat(MAINTENANT);
    expect(f.oldestDays).toBeNull();
    expect(f.overWeek).toBe(0);
    // La somme reste due, meme sans date.
    expect(f.amount).toBe(200);
  });

  it("rend des zeros quand rien n'est du", async () => {
    stub([]);
    const f = await getCarrierFloat(MAINTENANT);
    expect(f.amount).toBe(0);
    expect(f.oldestDays).toBeNull();
  });
});

describe("daysSince", () => {
  it("compte les jours entiers ecoules", () => {
    // 20/09 12:00 heure du Maroc = 11:00 UTC ; il s'est ecoule 7 jours
    // et une heure jusqu'au 27/09 12:00 UTC.
    expect(daysSince("2026-09-20 12:00", MAINTENANT)).toBe(7);
    expect(daysSince("2026-09-27 11:00", MAINTENANT)).toBe(0);
  });

  it("lit la date a l'heure du Maroc, pas celle de la machine", () => {
    // Sans fuseau explicite, le meme colis affichait un age different
    // selon qu'on le regardait du serveur ou d'un poste au Maroc.
    const t = Date.parse("2026-09-27T11:00:00+01:00");
    expect(daysSince("2026-09-27 11:00", new Date(t))).toBe(0);
    expect(daysSince("2026-09-26 11:00", new Date(t))).toBe(1);
  });

  it("respecte un fuseau deja present", () => {
    expect(daysSince("2026-09-26T12:00:00Z", MAINTENANT)).toBe(1);
  });

  it("rend null sur une date absente ou illisible", () => {
    expect(daysSince(null, MAINTENANT)).toBeNull();
    expect(daysSince("pas une date", MAINTENANT)).toBeNull();
  });
});
