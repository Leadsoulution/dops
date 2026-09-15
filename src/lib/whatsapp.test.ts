import { describe, it, expect } from "vitest";
import {
  MESSAGE_STATUSES,
  defaultTemplate,
  fillTemplate,
  templateFor,
  whatsappLink,
  whatsappNumber,
  type MessageOrder,
} from "./whatsapp";

const ORDER: MessageOrder = {
  reference: "WC-452",
  client: "Youssef Alaoui",
  phone: "0617553854",
  ville: "Casablanca",
  adresse: "12 rue des Orangers",
  quartier: "Maarif",
  productName: "Coffret bijoux",
  itemCount: 2,
  amount: "199 MAD",
};

describe("whatsappNumber", () => {
  it("passe un numero national au format international", () => {
    expect(whatsappNumber("0617553854")).toBe("212617553854");
  });

  it("accepte les espaces, tirets et le signe plus", () => {
    expect(whatsappNumber("06 17 55 38 54")).toBe("212617553854");
    expect(whatsappNumber("+212 617-553-854")).toBe("212617553854");
  });

  it("laisse un numero deja international tel quel", () => {
    expect(whatsappNumber("212617553854")).toBe("212617553854");
  });

  it("ne rend rien sans chiffres", () => {
    expect(whatsappNumber("")).toBe("");
    expect(whatsappNumber("indisponible")).toBe("");
  });
});

describe("fillTemplate", () => {
  it("remplace les champs par les valeurs de la commande", () => {
    const text = fillTemplate(
      "{prenom} / {client} / {telephone} / {produit} / {quantite} / {reference}",
      ORDER
    );
    expect(text).toBe(
      "Youssef / Youssef Alaoui / 0617553854 / Coffret bijoux / 2 / WC-452"
    );
  });

  it("donne le prix arrondi, celui que le livreur reclamera", () => {
    expect(fillTemplate("{prix}", ORDER)).toBe("200 MAD");
  });

  it("compose l'adresse complete", () => {
    expect(fillTemplate("{adresse}", ORDER)).toBe(
      "12 rue des Orangers, Maarif, Casablanca"
    );
  });

  it("laisse visible un champ inconnu plutot que de l'effacer", () => {
    // Efface en silence, la faute de frappe ne se verrait jamais.
    expect(fillTemplate("Bonjour {prenon}", ORDER)).toBe("Bonjour {prenon}");
  });

  it("rend une chaine vide pour un champ absent de la commande", () => {
    expect(fillTemplate("{suivi}", ORDER)).toBe("");
  });
});

describe("defaultTemplate", () => {
  it("donne un texte a chacun des statuts", () => {
    for (const status of MESSAGE_STATUSES) {
      expect(defaultTemplate(status).length).toBeGreaterThan(20);
    }
  });

  it("parle bien d'absence de reponse pour les statuts concernes", () => {
    for (const status of ["Pas de rep 1", "Pas de rep 5", "Injoignable 3"]) {
      expect(defaultTemplate(status)).toContain("essaye de vous joindre");
    }
  });

  it("annonce la livraison pour une commande confirmee", () => {
    expect(defaultTemplate("Confirme")).toContain("part en livraison");
    expect(defaultTemplate("EXPIDER")).toContain("part en livraison");
  });

  it("reprend toujours les informations de la commande", () => {
    for (const status of MESSAGE_STATUSES) {
      const text = defaultTemplate(status);
      for (const field of ["{produit}", "{prix}", "{adresse}", "{telephone}"]) {
        expect(text).toContain(field);
      }
    }
  });
});

describe("templateFor", () => {
  it("prefere le modele enregistre", () => {
    expect(templateFor("Confirme", { Confirme: "Mon texte" })).toBe("Mon texte");
  });

  it("retombe sur le texte propose quand rien n'est enregistre", () => {
    expect(templateFor("Confirme", {})).toBe(defaultTemplate("Confirme"));
    expect(templateFor("Confirme", undefined)).toBe(defaultTemplate("Confirme"));
  });

  it("ignore un modele vide ou blanc", () => {
    expect(templateFor("Confirme", { Confirme: "   " })).toBe(
      defaultTemplate("Confirme")
    );
  });
});

describe("whatsappLink", () => {
  it("compose un lien wa.me avec le message encode", () => {
    const link = whatsappLink(ORDER, "Bonjour {prenom}, {prix}");
    expect(link).toBe(
      "https://wa.me/212617553854?text=Bonjour%20Youssef%2C%20200%20MAD"
    );
  });

  it("encode les retours a la ligne du message", () => {
    const link = whatsappLink(ORDER, "Ligne 1\nLigne 2");
    expect(link).toContain("Ligne%201%0ALigne%202");
  });
});
