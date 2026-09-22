import { describe, it, expect } from "vitest";
import { buildPayload, subscribes, retryDelayMinutes } from "./payload";
import type { Lead } from "@/components/dashboard/leads-data";

const LEAD = {
  id: "1",
  reference: "WC-794",
  productLabel: "P1",
  productName: "قلادة أميرة الأرجوان",
  productImage: "https://cdn.forcelog.ma/bague.jpg",
  itemCount: 2,
  client: "Rachid Hsnwoui",
  phone: "0631347483",
  source: "WooCommerce",
  assignedTo: "",
  amount: "199 MAD",
  status: "Confirme",
  shipping: "",
  date: "2026-09-22",
  ville: "Bni Mellal",
  quartier: "Centre",
  adresse: "Rue 12",
  trackingNumber: "F-MRK1ABCD",
  deliveryStatus: "En cours de livraison",
  deliveryStatusCode: "DISTRIBUTION",
  customerNote: "livrer apres 19H",
} as unknown as Lead;

const QUAND = new Date("2026-09-22T10:15:00.000Z");

describe("buildPayload", () => {
  it("donne le telephone au format que WhatsApp exige", () => {
    const p = buildPayload("lead.status_changed", LEAD, undefined, QUAND);
    // n8n n'a pas de fonction pour convertir "06..." en "2126..." :
    // le faire ici evite une manipulation dans chaque scenario.
    expect(p.order.phone).toBe("0631347483");
    expect(p.order.phone_international).toBe("212631347483");
  });

  it("donne le montant arrondi, celui que le livreur reclame", () => {
    const p = buildPayload("lead.created", LEAD, undefined, QUAND);
    expect(p.order.amount).toBe("199 MAD");
    expect(p.order.amount_value).toBe(200);
  });

  it("transporte de quoi ecrire au client", () => {
    const p = buildPayload("lead.status_changed", LEAD, undefined, QUAND);
    const o = p.order;
    for (const champ of [o.client, o.ville, o.adresse, o.product_name, o.tracking_number])
      expect(champ).toBeTruthy();
    expect(o.customer_note).toBe("livrer apres 19H");
    expect(o.product_image).toContain("https://");
    expect(p.sent_at).toBe("2026-09-22T10:15:00.000Z");
  });

  it("dit d'ou vient le statut, pour savoir ce qui a change", () => {
    const p = buildPayload("lead.status_changed", LEAD, { status: "Nouveau" }, QUAND);
    expect(p.order.status_previous).toBe("Nouveau");
    expect(p.order.status).toBe("Confirme");
  });

  it("laisse le statut precedent vide a la creation", () => {
    const p = buildPayload("lead.created", LEAD, undefined, QUAND);
    expect(p.order.status_previous).toBeNull();
  });

  it("rend null plutot qu'absent sur un champ manquant", () => {
    const nu = { ...LEAD, ville: undefined, adresse: undefined, customerNote: undefined };
    const o = buildPayload("lead.created", nu as Lead, undefined, QUAND).order;
    // n8n distingue mal une cle absente d'une cle nulle : toujours
    // presente, la cle rend les scenarios plus simples a ecrire.
    expect(o.ville).toBeNull();
    expect(o.adresse).toBeNull();
    expect("customer_note" in o).toBe(true);
  });
});

describe("subscribes", () => {
  it("prend tout quand rien n'est precise", () => {
    expect(subscribes([], "lead.created")).toBe(true);
  });

  it("ne prend que les evenements demandes", () => {
    expect(subscribes(["lead.delivery_status_changed"], "lead.created")).toBe(false);
    expect(subscribes(["lead.created"], "lead.created")).toBe(true);
  });
});

describe("retryDelayMinutes", () => {
  it("double a chaque echec, puis plafonne", () => {
    // Un service qui redemarre a besoin d'un instant ; un service en
    // panne n'a pas besoin qu'on le harcele.
    expect(retryDelayMinutes(1)).toBe(1);
    expect(retryDelayMinutes(2)).toBe(2);
    expect(retryDelayMinutes(3)).toBe(4);
    expect(retryDelayMinutes(10)).toBe(60);
  });
});
