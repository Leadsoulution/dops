import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { collectStatusUpdates, deliveryTimestamp } from "./dispatch";
import type { Lead } from "@/components/dashboard/leads-data";

const AUTH_OK = { RESULT: "SUCCESS", MESSAGE: "Customer Authenticated" };

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead-1",
    reference: "MO-1",
    productLabel: "",
    productName: "",
    client: "Client",
    phone: "0600000000",
    source: "ForceLog",
    assignedTo: "",
    amount: "170 MAD",
    status: "Confirme",
    shipping: "En attente",
    date: "",
    trackingNumber: "F-AAA",
    ...overrides,
  };
}

function parcelsResponse(parcels: unknown[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      AUTH: AUTH_OK,
      "GET-PARCELS": { RESULT: "SUCCESS", PARCELS: parcels },
    }),
  } as Response;
}

describe("collectStatusUpdates", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.stubEnv("FORCELOG_API_KEY", "test-key");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("updates delivery and payment status", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      parcelsResponse([
        {
          TRACKING_NUMBER: "F-AAA",
          STATUS: "En cours de livraison",
          STATUS_CODE: "DISTRIBUTION",
          SITUATION: "Non Paye",
        },
      ])
    );

    const { updates } = await collectStatusUpdates([lead()]);
    expect(updates.get("lead-1")).toEqual({
      deliveryStatus: "En cours de livraison",
      deliveryStatusCode: "DISTRIBUTION",
      paymentStatus: "Non Paye",
    });
  });

  // Le statut de confirmation appartient a l'equipe de confirmation : un
  // colis annule, refuse ou retourne par le transporteur ne doit pas
  // rouvrir ni annuler la commande cote application.
  it.each([
    ["CANCELED", "Annule"],
    ["REFUSE", "Refuse"],
    ["RETURNED", "Retourne"],
    ["NO_ANSWER", "Pas de reponse"],
  ])("never touches the confirmation status (%s)", async (code, label) => {
    vi.mocked(fetch).mockResolvedValueOnce(
      parcelsResponse([
        {
          TRACKING_NUMBER: "F-AAA",
          STATUS: label,
          STATUS_CODE: code,
          SITUATION: "Non Paye",
        },
      ])
    );

    const { updates } = await collectStatusUpdates([lead({ status: "Confirme" })]);
    const changes = updates.get("lead-1")!;
    expect(changes).not.toHaveProperty("status");
    expect(Object.keys(changes).sort()).toEqual([
      "deliveryStatus",
      "deliveryStatusCode",
      "paymentStatus",
    ]);
  });

  it("skips orders whose statuses are already up to date", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      parcelsResponse([
        {
          TRACKING_NUMBER: "F-AAA",
          STATUS: "Livre",
          STATUS_CODE: "DELIVERED",
          SITUATION: "Facture",
        },
      ])
    );

    const { updates } = await collectStatusUpdates([
      lead({
        deliveryStatus: "Livre",
        deliveryStatusCode: "DELIVERED",
        paymentStatus: "Facture",
        deliveryDate: "2026-09-10 11:30",
      }),
    ]);
    expect(updates.size).toBe(0);
  });

  // ForceLog ne renvoie aucune date de livraison, meme sur un colis livre :
  // l'application horodate donc elle-meme le passage a "Livre".
  it("stamps the delivery date the first time a parcel is seen delivered", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      parcelsResponse([
        {
          TRACKING_NUMBER: "F-AAA",
          STATUS: "Livre",
          STATUS_CODE: "DELIVERED",
          SITUATION: "En cours de facturation",
        },
      ])
    );

    const { updates } = await collectStatusUpdates([lead()]);
    expect(updates.get("lead-1")!.deliveryDate).toMatch(
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/
    );
  });

  it("never moves a delivery date that is already set", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      parcelsResponse([
        {
          TRACKING_NUMBER: "F-AAA",
          STATUS: "Livre",
          STATUS_CODE: "DELIVERED",
          SITUATION: "Facture",
        },
      ])
    );

    const { updates } = await collectStatusUpdates([
      lead({
        deliveryStatus: "Livre",
        deliveryStatusCode: "DELIVERED",
        paymentStatus: "Non Paye",
        deliveryDate: "2026-09-10 11:30",
      }),
    ]);
    expect(updates.get("lead-1")).not.toHaveProperty("deliveryDate");
  });

  it("leaves the delivery date empty while the parcel is not delivered", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      parcelsResponse([
        {
          TRACKING_NUMBER: "F-AAA",
          STATUS: "Expedie vers la ville",
          STATUS_CODE: "SENT",
          SITUATION: "Non Paye",
        },
      ])
    );

    const { updates } = await collectStatusUpdates([lead()]);
    expect(updates.get("lead-1")).not.toHaveProperty("deliveryDate");
  });

  it("ignores orders that were never dispatched", async () => {
    const { updates, checked } = await collectStatusUpdates([
      lead({ trackingNumber: undefined }),
    ]);
    expect(checked).toBe(0);
    expect(updates.size).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("deliveryTimestamp", () => {
  it("formats a date at Morocco time, not UTC", () => {
    // 2026-09-11T23:30Z tombe le 12 a 00:30 a Casablanca (UTC+1).
    expect(deliveryTimestamp(new Date("2026-09-11T23:30:00Z"))).toBe(
      "2026-09-12 00:30"
    );
  });
});

describe("colis clos", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.stubEnv("FORCELOG_API_KEY", "test-key");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("cesse d'interroger un colis livre et facture", async () => {
    // Rien a apprendre de plus : aucun appel ne doit partir.
    const { updates, checked } = await collectStatusUpdates([
      lead({
        deliveryStatus: "Livre",
        deliveryStatusCode: "DELIVERED",
        paymentStatus: "Facture",
      }),
    ]);
    expect(checked).toBe(0);
    expect(updates.size).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("continue d'interroger un colis livre mais pas encore facture", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      parcelsResponse([
        {
          TRACKING_NUMBER: "F-AAA",
          STATUS: "Livre",
          STATUS_CODE: "DELIVERED",
          SITUATION: "Facture",
        },
      ])
    );
    const { checked } = await collectStatusUpdates([
      lead({
        deliveryStatus: "Livre",
        deliveryStatusCode: "DELIVERED",
        // "Non Paye" contient "paye" : le piege que la regle doit eviter.
        paymentStatus: "Non Paye",
      }),
    ]);
    expect(checked).toBe(1);
  });

  it("continue d'interroger un colis encore en route", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      parcelsResponse([
        {
          TRACKING_NUMBER: "F-AAA",
          STATUS: "En cours de livraison",
          STATUS_CODE: "DISTRIBUTION",
          SITUATION: "Non Paye",
        },
      ])
    );
    const { checked } = await collectStatusUpdates([
      lead({ deliveryStatusCode: "DISTRIBUTION", paymentStatus: "Non Paye" }),
    ]);
    expect(checked).toBe(1);
  });
});
