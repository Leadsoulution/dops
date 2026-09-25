import { describe, it, expect } from "vitest";
import { parseStockItems, totalUnits } from "./stock-items";

describe("parseStockItems", () => {
  it("lit une reference seule", () => {
    expect([...parseStockItems("1FKGUA:1")]).toEqual([["1FKGUA", 1]]);
  });

  it("lit une quantite superieure a un", () => {
    // WC-503 : deux exemplaires du meme produit dans un seul colis.
    expect([...parseStockItems("1FKGUA:2")]).toEqual([["1FKGUA", 2]]);
  });

  it("repartit un colis contenant deux produits differents", () => {
    // MO-DFPEI-0923 : sans cette repartition, les deux unites etaient
    // attribuees au premier produit et le second n'en recevait aucune.
    expect([...parseStockItems("1FKT5H:1,1FL5NX:1")]).toEqual([
      ["1FKT5H", 1],
      ["1FL5NX", 1],
    ]);
  });

  it("additionne une reference citee deux fois", () => {
    expect(parseStockItems("1FKGUA:1,1FKGUA:2").get("1FKGUA")).toBe(3);
  });

  it("compte une unite quand la quantite est omise", () => {
    expect(parseStockItems("1FKGUA").get("1FKGUA")).toBe(1);
    expect(parseStockItems("1FKGUA:").get("1FKGUA")).toBe(1);
  });

  it("ignore une quantite illisible plutot que de rendre NaN", () => {
    expect(parseStockItems("1FKGUA:abc").get("1FKGUA")).toBe(1);
    expect(parseStockItems("1FKGUA:-3").get("1FKGUA")).toBe(1);
  });

  it("supporte les espaces et les morceaux vides", () => {
    expect([...parseStockItems(" 1FKGUA:2 , ,1FKT5H:1 ")]).toEqual([
      ["1FKGUA", 2],
      ["1FKT5H", 1],
    ]);
  });

  it("rend une carte vide sans detail", () => {
    for (const v of [null, undefined, ""]) expect(parseStockItems(v).size).toBe(0);
  });
});

describe("totalUnits", () => {
  it("compte toutes les unites du colis", () => {
    expect(totalUnits("1FKT5H:1,1FL5NX:1")).toBe(2);
    expect(totalUnits("1FKGUA:2")).toBe(2);
    expect(totalUnits(null)).toBe(0);
  });
});
