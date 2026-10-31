import { describe, it, expect } from "vitest";
import {
  normalisePhone,
  phoneValide,
  receptionCommande,
  referenceWeb,
} from "./web-forms";

const LE_JOUR = new Date("2026-10-31T10:00:00Z");

describe("normalisePhone", () => {
  it("retire ce qui n'est pas un chiffre", () => {
    expect(normalisePhone("06 12-34.56 78")).toBe("0612345678");
  });

  /*
   * Le reste de l'application compare les numeros sous leur forme
   * locale : un client enregistre en +212 ne serait jamais reconnu
   * comme celui qui a deja commande hier.
   */
  it("ramene l'indicatif marocain a un zero", () => {
    expect(normalisePhone("+212612345678")).toBe("0612345678");
    expect(normalisePhone("00212612345678")).toBe("0612345678");
  });

  it("reconnait un numero marocain, et rien d'autre", () => {
    expect(phoneValide("0612345678")).toBe(true);
    expect(phoneValide("612345678")).toBe(false);
    expect(phoneValide("06123456789")).toBe(false);
  });
});

describe("receptionCommande", () => {
  it("accepte les noms de champs francais", () => {
    const r = receptionCommande(
      {
        nom: "Amine",
        telephone: "0612345678",
        ville: "Casablanca",
        adresse: "Rue 1",
        produit: "Collier",
        quantite: "2",
        prix: "299",
        message: "Livrer apres 19h",
      },
      LE_JOUR
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lead).toMatchObject({
      client: "Amine",
      phone: "0612345678",
      ville: "Casablanca",
      productName: "Collier",
      itemCount: 2,
      amount: "299 MAD",
      customerNote: "Livrer apres 19h",
      source: "Landing page",
      status: "Nouveau",
    });
  });

  it("accepte aussi les noms anglais", () => {
    const r = receptionCommande(
      { full_name: "Sara", phone: "0612345678", city: "Rabat", total: "150" },
      LE_JOUR
    );
    expect(r.ok && r.lead.client).toBe("Sara");
    expect(r.ok && r.lead.ville).toBe("Rabat");
    expect(r.ok && r.lead.amount).toBe("150 MAD");
  });

  /*
   * Celui qui a ecrit la page nomme ses champs comme il respire :
   * "Full Name", "full-name", "fullname". Les trois designent la meme
   * chose, et aucune commande ne doit se perdre sur un tiret.
   */
  it("ignore la casse, les espaces et les tirets des noms de champs", () => {
    const r = receptionCommande(
      { "Full Name": "Yassine", "Phone-Number": "0612345678" },
      LE_JOUR
    );
    expect(r.ok && r.lead.client).toBe("Yassine");
    expect(r.ok && r.lead.phone).toBe("0612345678");
  });

  it("exige un nom et un telephone, rien de plus", () => {
    expect(receptionCommande({ phone: "0612345678" }, LE_JOUR)).toEqual({
      ok: false,
      erreur: "Nom du client manquant.",
    });
    expect(receptionCommande({ nom: "Amine" }, LE_JOUR)).toEqual({
      ok: false,
      erreur: "Telephone manquant.",
    });
    // La ville manque, le produit aussi : un agent rappellera.
    const r = receptionCommande({ nom: "Amine", tel: "0612345678" }, LE_JOUR);
    expect(r.ok).toBe(true);
    expect(r.ok && r.lead.amount).toBe("0 MAD");
  });

  it("refuse un telephone qui ne pourrait pas etre appele", () => {
    const r = receptionCommande({ nom: "A", tel: "12345" }, LE_JOUR);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.erreur).toContain("12345");
  });

  it("garde la reference du site quand il en fournit une", () => {
    const r = receptionCommande(
      { nom: "A", tel: "0612345678", order_id: "LOORA-42" },
      LE_JOUR
    );
    expect(r.ok && r.lead.reference).toBe("LOORA-42");
  });

  it("en fabrique une sinon", () => {
    const r = receptionCommande({ nom: "A", tel: "0612345678" }, LE_JOUR);
    expect(r.ok && r.lead.reference).toMatch(/^WEB-[0-9A-Z]{8}$/);
  });
});

describe("referenceWeb", () => {
  /*
   * Speedaf coupe une reference a seize caracteres. Une reference
   * tronquee cesse d'etre unique, et deux commandes se confondraient
   * chez le transporteur.
   */
  it("tient sous la limite de seize caracteres", () => {
    expect(referenceWeb(Date.now()).length).toBeLessThanOrEqual(16);
  });

  it("separe deux commandes de la meme milliseconde", () => {
    const a = referenceWeb(1700000000000, () => 0.1);
    const b = referenceWeb(1700000000000, () => 0.9);
    expect(a).not.toBe(b);
  });
});
