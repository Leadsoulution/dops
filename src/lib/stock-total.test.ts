import { describe, it, expect } from "vitest";
import { stockTotal, refsSansPrix, PRIX_UNITAIRE_MANUEL } from "./stock-total";

const CATALOGUE = [
  { ref: "1FKGUA", price: 200 },
  { ref: "1FKNOG", price: 199 },
  { ref: "1FKT5H", price: 199 },
  { ref: "18BWTD", price: null },
];

describe("stockTotal", () => {
  it("additionne tous les articles choisis, pas seulement le premier", () => {
    expect(stockTotal({ "1FKGUA": 1 }, CATALOGUE)).toBe(200);
    expect(stockTotal({ "1FKGUA": 1, "1FKNOG": 1 }, CATALOGUE)).toBe(399);
    expect(stockTotal({ "1FKGUA": 1, "1FKNOG": 1, "1FKT5H": 1 }, CATALOGUE)).toBe(598);
  });

  it("compte les quantites, pas seulement les lignes", () => {
    expect(stockTotal({ "1FKGUA": 3 }, CATALOGUE)).toBe(600);
    expect(stockTotal({ "1FKGUA": 2, "1FKNOG": 2 }, CATALOGUE)).toBe(798);
  });

  it("retire un article quand on le decoche", () => {
    const avant = stockTotal({ "1FKGUA": 1, "1FKNOG": 1 }, CATALOGUE);
    const apres = stockTotal({ "1FKGUA": 1 }, CATALOGUE);
    expect(avant - apres).toBe(199);
  });

  it("compte pour zero un article sans prix", () => {
    // Inventer un montant serait pire : le total paraitrait juste, et le
    // client se verrait reclamer une somme que personne n'a decidee.
    expect(stockTotal({ "18BWTD": 4 }, CATALOGUE)).toBe(0);
    expect(stockTotal({ "1FKGUA": 1, "18BWTD": 1 }, CATALOGUE)).toBe(200);
  });

  it("ignore une reference inconnue du catalogue", () => {
    expect(stockTotal({ "REF_FANTOME": 2 }, CATALOGUE)).toBe(0);
  });

  it("rend zero sans selection", () => {
    expect(stockTotal({}, CATALOGUE)).toBe(0);
  });

  it("ne compte pas une quantite negative", () => {
    expect(stockTotal({ "1FKGUA": -2 }, CATALOGUE)).toBe(0);
  });
});

describe("refsSansPrix", () => {
  it("nomme les articles choisis qui n'ont pas de prix", () => {
    expect(refsSansPrix({ "1FKGUA": 1, "18BWTD": 1 }, CATALOGUE)).toEqual(["18BWTD"]);
  });

  it("ne signale rien quand tout est tarife", () => {
    expect(refsSansPrix({ "1FKGUA": 1, "1FKNOG": 2 }, CATALOGUE)).toEqual([]);
  });
});

describe("tarif unique des commandes manuelles", () => {
  it("applique le meme prix a chaque article, catalogue ignore", () => {
    // Une vente par telephone se fait au meme tarif quel que soit
    // l'article : 1FKNOG vaut 199 au catalogue, 200 ici comme les autres.
    const t = stockTotal(
      { "1FKGUA": 1, "1FKNOG": 1, "1FKT5H": 1 },
      CATALOGUE,
      PRIX_UNITAIRE_MANUEL
    );
    expect(t).toBe(3 * PRIX_UNITAIRE_MANUEL);
  });

  it("tarife aussi les articles que le catalogue ignore", () => {
    // 18BWTD n'a aucun prix de vente enregistre : sans tarif unique il
    // comptait pour zero, et le total ne bougeait pas quand on le
    // choisissait.
    expect(stockTotal({ "18BWTD": 2 }, CATALOGUE, PRIX_UNITAIRE_MANUEL)).toBe(
      2 * PRIX_UNITAIRE_MANUEL
    );
  });

  it("compte les quantites au tarif unique", () => {
    expect(stockTotal({ "1FKGUA": 3 }, CATALOGUE, PRIX_UNITAIRE_MANUEL)).toBe(600);
  });

  it("laisse le prix du catalogue quand aucun tarif n'est impose", () => {
    // Le calcul sert aussi ailleurs : sans tarif, il garde l'ancien
    // comportement.
    expect(stockTotal({ "1FKNOG": 1 }, CATALOGUE)).toBe(199);
  });
});
