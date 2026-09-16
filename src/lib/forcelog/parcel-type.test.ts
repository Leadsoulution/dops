import { describe, it, expect } from "vitest";
import { resolveParcelType, type CatalogueProduct } from "./parcel-type";

const CATALOGUE: CatalogueProduct[] = [
  { name: "قلادة أميرة الأرجوان الفاخرة", forcelogRef: "1FKGUA", defaultParcelType: "stock" },
  { name: "عقد اللؤلؤ الفاخر 2026", forcelogRef: "1FKT5H", defaultParcelType: "stock" },
  { name: "Bracelet simple", forcelogRef: "1ABCDE", defaultParcelType: "simple" },
  // Passe en colis de stock, mais sans reference chez le transporteur :
  // rien a prelever, donc rien a promettre.
  { name: "Produit sans reference", defaultParcelType: "stock" },
];

describe("resolveParcelType", () => {
  it("passe en colis de stock une commande figee en simple", () => {
    // Le cas vecu : la commande est arrivee avant que le produit passe
    // en colis de stock.
    expect(
      resolveParcelType(
        {
          productName: "قلادة أميرة الأرجوان الفاخرة",
          itemCount: 1,
          parcelType: "simple",
        },
        CATALOGUE
      )
    ).toEqual({ parcelType: "stock", stockItems: "1FKGUA:1" });
  });

  it("reporte la quantite commandee sur la ligne de prelevement", () => {
    expect(
      resolveParcelType(
        { productName: "عقد اللؤلؤ الفاخر 2026", itemCount: 2 },
        CATALOGUE
      )
    ).toEqual({ parcelType: "stock", stockItems: "1FKT5H:2" });
  });

  it("compte un article quand la quantite est absente", () => {
    expect(
      resolveParcelType({ productName: "Bracelet simple" }, CATALOGUE)
    ).toEqual({ parcelType: "simple", stockItems: undefined });
  });

  it("ramene en colis simple un produit sorti du stock", () => {
    // Prelever une reference qui n'est plus au depot ferait echouer l'envoi.
    expect(
      resolveParcelType(
        { productName: "Bracelet simple", parcelType: "stock", stockItems: "1ABCDE:1" },
        CATALOGUE
      )
    ).toEqual({ parcelType: "simple", stockItems: undefined });
  });

  it("refuse le colis de stock sans reference transporteur", () => {
    expect(
      resolveParcelType({ productName: "Produit sans reference" }, CATALOGUE)
    ).toEqual({ parcelType: "simple", stockItems: undefined });
  });

  it("ignore la casse et les espaces autour du nom", () => {
    expect(
      resolveParcelType({ productName: "  BRACELET SIMPLE  " }, CATALOGUE)
        .parcelType
    ).toBe("simple");
  });

  it("garde ce qui est enregistre pour un produit inconnu", () => {
    expect(
      resolveParcelType(
        { productName: "Produit absent du catalogue", parcelType: "stock", stockItems: "XXX:1" },
        CATALOGUE
      )
    ).toEqual({ parcelType: "stock", stockItems: "XXX:1" });
  });

  it("garde ce qui est enregistre pour une commande a plusieurs references", () => {
    // Composee a l'import depuis ses lignes d'origine, elle ne peut pas
    // etre recomposee ici : la commande ne retient qu'un nom de produit.
    expect(
      resolveParcelType(
        {
          productName: "قلادة أميرة الأرجوان الفاخرة",
          itemCount: 3,
          parcelType: "stock",
          stockItems: "1FKGUA:1,1FKT5H:2",
        },
        CATALOGUE
      )
    ).toEqual({ parcelType: "stock", stockItems: "1FKGUA:1,1FKT5H:2" });
  });

  it("n'arbitre pas entre deux produits de meme nom", () => {
    const ambigu: CatalogueProduct[] = [
      { name: "Doublon", forcelogRef: "AAA", defaultParcelType: "stock" },
      { name: "Doublon", forcelogRef: "BBB", defaultParcelType: "stock" },
    ];
    expect(
      resolveParcelType({ productName: "Doublon", parcelType: "simple" }, ambigu)
    ).toEqual({ parcelType: "simple", stockItems: undefined });
  });

  it("garde ce qui est enregistre quand le catalogue est vide", () => {
    expect(
      resolveParcelType(
        { productName: "Quelque chose", parcelType: "stock", stockItems: "ZZZ:1" },
        []
      )
    ).toEqual({ parcelType: "stock", stockItems: "ZZZ:1" });
  });
});
