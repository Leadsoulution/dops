import { describe, expect, it } from "vitest";
import {
  orderFields,
  orderLines,
  sameLines,
  type CatalogueEntry,
} from "./order-lines";

const CATALOGUE: CatalogueEntry[] = [
  { name: "Collier Arjouane", forcelogRef: "1FKGUA", priceSale: 199 },
  { name: "Collier Perle", forcelogRef: "1FKT5H", priceSale: 229 },
  { name: "Parure Papillon", forcelogRef: "1FKNOG", priceSale: 189 },
  { name: "Bracelet cuir", priceSale: 120 },
];

describe("orderLines", () => {
  it("rend une ligne par reference prelevee, avec sa quantite", () => {
    const lignes = orderLines(
      {
        productName: "Collier Arjouane, Parure Papillon",
        itemCount: 2,
        stockItems: "1FKGUA:1,1FKNOG:3",
      },
      CATALOGUE
    );
    expect(lignes).toEqual([
      { ref: "1FKGUA", qty: 1, name: "Collier Arjouane", price: 199, image: undefined },
      { ref: "1FKNOG", qty: 3, name: "Parure Papillon", price: 189, image: undefined },
    ]);
  });

  it("nomme par le catalogue les references que la commande n'a pas nommees", () => {
    // Une commande de la boutique ne retient que le nom du premier
    // article, alors que ses references sont toutes la.
    const lignes = orderLines(
      {
        productName: "Collier Amira de luxe",
        itemCount: 2,
        stockItems: "1FKGUA:1,1FKT5H:1",
      },
      CATALOGUE
    );
    expect(lignes.map((l) => l.name)).toEqual([
      "Collier Amira de luxe",
      "Collier Perle",
    ]);
  });

  it("garde le nom enregistre plutot que celui du catalogue", () => {
    const [ligne] = orderLines(
      { productName: "Collier Amira", stockItems: "1FKGUA:1" },
      CATALOGUE
    );
    expect(ligne.name).toBe("Collier Amira");
    expect(ligne.price).toBe(199);
  });

  it("retombe sur la reference quand rien ne la nomme", () => {
    const [ligne] = orderLines({ stockItems: "9ZZZZZ:2" }, CATALOGUE);
    expect(ligne).toMatchObject({ ref: "9ZZZZZ", qty: 2, name: "9ZZZZZ" });
  });

  it("separe les noms d'une commande sans reference", () => {
    const lignes = orderLines(
      { productName: "Collier Arjouane, Bracelet cuir", itemCount: 2 },
      CATALOGUE
    );
    expect(lignes).toEqual([
      { name: "Collier Arjouane", qty: 1, ref: "1FKGUA", price: 199, image: undefined },
      { name: "Bracelet cuir", qty: 1, ref: undefined, price: 120, image: undefined },
    ]);
  });

  it("donne tout le compte d'articles au produit unique", () => {
    const lignes = orderLines({ productName: "Bracelet cuir", itemCount: 3 }, CATALOGUE);
    expect(lignes).toEqual([
      { name: "Bracelet cuir", qty: 3, ref: undefined, price: 120, image: undefined },
    ]);
  });

  it("ne perd pas un nom en trop par rapport aux references", () => {
    const lignes = orderLines(
      {
        productName: "Collier Arjouane, Bracelet cuir",
        stockItems: "1FKGUA:1",
      },
      CATALOGUE
    );
    expect(lignes.map((l) => l.name)).toEqual([
      "Collier Arjouane",
      "Bracelet cuir",
    ]);
    expect(lignes[1].ref).toBeUndefined();
  });

  it("rend une liste vide pour une commande sans produit", () => {
    expect(orderLines({}, CATALOGUE)).toEqual([]);
  });

  it("se passe de catalogue", () => {
    expect(orderLines({ productName: "A, B" })).toEqual([
      { name: "A", qty: 1, ref: undefined, price: undefined, image: undefined },
      { name: "B", qty: 1, ref: undefined, price: undefined, image: undefined },
    ]);
  });
});

describe("orderFields", () => {
  it("recompose les trois champs sans qu'ils se contredisent", () => {
    expect(
      orderFields([
        { name: "A", qty: 1, ref: "R1" },
        { name: "B", qty: 2, ref: "R2" },
      ])
    ).toEqual({
      productName: "A, B",
      itemCount: 3,
      parcelType: "stock",
      stockItems: "R1:1,R2:2",
    });
  });

  it("passe en colis simple des qu'un article ne se preleve pas", () => {
    expect(
      orderFields([
        { name: "A", qty: 1, ref: "R1" },
        { name: "B", qty: 1 },
      ])
    ).toEqual({
      productName: "A, B",
      itemCount: 2,
      parcelType: "simple",
      stockItems: null,
    });
  });

  it("ne rend pas un colis de stock vide", () => {
    expect(orderFields([])).toEqual({
      productName: "",
      itemCount: 0,
      parcelType: "simple",
      stockItems: null,
    });
  });

  it("fait l'aller-retour sans rien changer", () => {
    const commande = {
      productName: "Collier Arjouane, Parure Papillon",
      itemCount: 4,
      stockItems: "1FKGUA:1,1FKNOG:3",
    };
    const refait = orderFields(orderLines(commande, CATALOGUE));
    expect(refait.productName).toBe(commande.productName);
    expect(refait.itemCount).toBe(commande.itemCount);
    expect(refait.stockItems).toBe(commande.stockItems);
  });
});

describe("sameLines", () => {
  it("reconnait deux fois la meme commande", () => {
    const a = [{ name: "A", qty: 1, ref: "R1" }];
    expect(sameLines(a, [{ name: "A", qty: 1, ref: "R1" }])).toBe(true);
  });

  it("distingue une quantite, un nom ou une reference qui change", () => {
    const a = [{ name: "A", qty: 1, ref: "R1" }];
    expect(sameLines(a, [{ name: "A", qty: 2, ref: "R1" }])).toBe(false);
    expect(sameLines(a, [{ name: "B", qty: 1, ref: "R1" }])).toBe(false);
    expect(sameLines(a, [{ name: "A", qty: 1, ref: "R2" }])).toBe(false);
    expect(sameLines(a, [])).toBe(false);
  });
});
