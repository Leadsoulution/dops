import { describe, it, expect } from "vitest";
import { carrierCity, dispatchBlocker } from "./eligibility";

// Les formes acceptees d'une ville, telles que `deliverableCities` les
// produit : cle canonique, nom normalise et alias normalises.
const CITIES = new Set(["casablanca", "rabat", "beni_mellal", "casa"]);

const VALID = {
  client: "Hind Alaoui",
  phone: "0713935915",
  ville: "Casablanca",
};

describe("dispatchBlocker", () => {
  it("laisse partir une commande complete", () => {
    expect(dispatchBlocker(VALID, CITIES)).toBeNull();
  });

  it("accepte une ville ecrite autrement que dans la liste", () => {
    // Accents, casse et tirets ne font pas une ville differente.
    expect(dispatchBlocker({ ...VALID, ville: "BENI-MELLAL" }, CITIES)).toBeNull();
    expect(dispatchBlocker({ ...VALID, ville: "  rabat " }, CITIES)).toBeNull();
  });

  it("accepte un alias de ville", () => {
    expect(dispatchBlocker({ ...VALID, ville: "Casa" }, CITIES)).toBeNull();
  });

  it("refuse une ville absente de la liste", () => {
    const blocker = dispatchBlocker({ ...VALID, ville: "الدارالبيضاء" }, CITIES);
    expect(blocker).toContain("saisir la ville exacte");
    // La ville fautive est citee, sinon on ne sait pas quoi corriger.
    expect(blocker).toContain("الدارالبيضاء");
  });

  it("refuse une ville mal orthographiee", () => {
    expect(dispatchBlocker({ ...VALID, ville: "Casablnca" }, CITIES)).toContain(
      "saisir la ville exacte"
    );
  });

  it("refuse une commande sans ville", () => {
    expect(dispatchBlocker({ ...VALID, ville: undefined }, CITIES)).toBe(
      "Saisir la ville exacte"
    );
    expect(dispatchBlocker({ ...VALID, ville: "   " }, CITIES)).toBe(
      "Saisir la ville exacte"
    );
  });

  it("refuse une commande sans nom de client", () => {
    expect(dispatchBlocker({ ...VALID, client: "" }, CITIES)).toBe(
      "Saisir le nom du client"
    );
    expect(dispatchBlocker({ ...VALID, client: "  " }, CITIES)).toBe(
      "Saisir le nom du client"
    );
  });

  it("refuse un telephone absent ou trop court", () => {
    expect(dispatchBlocker({ ...VALID, phone: "" }, CITIES)).toBe(
      "Numero de telephone indisponible"
    );
    expect(dispatchBlocker({ ...VALID, phone: "06123" }, CITIES)).toBe(
      "Numero de telephone indisponible"
    );
  });

  it("accepte un telephone ecrit avec espaces ou indicatif", () => {
    expect(dispatchBlocker({ ...VALID, phone: "06 13 93 59 15" }, CITIES)).toBeNull();
    expect(dispatchBlocker({ ...VALID, phone: "+212 713 935 915" }, CITIES)).toBeNull();
  });

  it("signale le nom avant la ville : on corrige dans l'ordre du formulaire", () => {
    expect(
      dispatchBlocker({ client: "", phone: "", ville: "Nulle part" }, CITIES)
    ).toBe("Saisir le nom du client");
  });

  it("refuse tout quand aucune ville n'est livrable", () => {
    expect(dispatchBlocker(VALID, new Set())).toContain("saisir la ville exacte");
  });
});

describe("carrierCity", () => {
  const CITIES = new Map([
    ["oulad_berhil_ouled_berhil", { name: "Oulad berhil (Ouled Berhil)", carrierCode: "ODB" }],
    ["ouled_berhil", { name: "Oulad berhil (Ouled Berhil)", carrierCode: "ODB" }],
    ["oulad_berhili", { name: "Oulad berhili", carrierCode: "BER" }],
    ["casablanca", { name: "Casablanca", carrierCode: "CSA" }],
    ["ville_sans_code", { name: "Ville sans code" }],
  ]);

  it("traduit la ville en code transporteur", () => {
    expect(carrierCity("Casablanca", CITIES)).toBe("CSA");
  });

  it("resout par alias comme par nom", () => {
    // Le nom a parenthese est justement celui que ForceLog refuse.
    expect(carrierCity("Oulad berhil (Ouled Berhil)", CITIES)).toBe("ODB");
    expect(carrierCity("Ouled Berhil", CITIES)).toBe("ODB");
  });

  it("ne confond pas deux villes de nom voisin", () => {
    expect(carrierCity("Oulad berhili", CITIES)).toBe("BER");
  });

  it("ignore la casse et les espaces", () => {
    expect(carrierCity("  CASABLANCA  ", CITIES)).toBe("CSA");
  });

  it("envoie le nom quand aucun code n'est connu", () => {
    expect(carrierCity("Ville sans code", CITIES)).toBe("Ville sans code");
    expect(carrierCity("Ville absente", CITIES)).toBe("Ville absente");
  });

  it("ne rend rien sans ville", () => {
    expect(carrierCity(undefined, CITIES)).toBe("");
    expect(carrierCity("   ", CITIES)).toBe("");
  });
});
