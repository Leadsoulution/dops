import { describe, it, expect } from "vitest";
import { dispatchBlocker } from "./eligibility";

// Les formes acceptees d'une ville, telles que `deliverableCityKeys` les
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
