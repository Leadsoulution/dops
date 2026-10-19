import { describe, expect, it } from "vitest";
import { imageOfOrder, productImageIndex, type PhotoProduit } from "./product-image";

/**
 * Le nom ne designe pas un produit : deux articles peuvent porter le
 * meme intitule, et un produit renomme laisse derriere lui des
 * commandes au nom perime. C'est le code preleve qui tranche.
 */
const CATALOGUE: PhotoProduit[] = [
  { name: "Collier Rose", image: "rose-doree.jpg", forcelogRef: "1FL5NX" },
  { name: "Collier Rose", image: "rose-violette.jpg", forcelogRef: "180ZEI" },
  { name: "Collier Perle", image: "perle.jpg", forcelogRef: "1FKT5H" },
  { name: "Bracelet cuir", image: "bracelet.jpg" },
];

describe("imageOfOrder", () => {
  const index = productImageIndex(CATALOGUE);

  it("prend la photo du code article preleve", () => {
    expect(
      imageOfOrder(index, { productName: "Collier Rose", stockItems: "180ZEI:1" })
    ).toBe("rose-violette.jpg");
    expect(
      imageOfOrder(index, { productName: "Collier Rose", stockItems: "1FL5NX:1" })
    ).toBe("rose-doree.jpg");
  });

  it("ne montre aucune photo quand deux produits partagent le nom", () => {
    // Montrer l'une des deux ferait croire a l'agent qu'il expedie
    // l'autre : mieux vaut une case vide.
    expect(imageOfOrder(index, { productName: "Collier Rose" })).toBeUndefined();
  });

  it("accepte le nom quand il ne designe qu'un produit", () => {
    expect(imageOfOrder(index, { productName: "Collier Perle" })).toBe("perle.jpg");
    expect(imageOfOrder(index, { productName: " bracelet CUIR " })).toBe(
      "bracelet.jpg"
    );
  });

  it("prend le premier article connu d'un colis a plusieurs references", () => {
    expect(
      imageOfOrder(index, {
        productName: "Collier Rose",
        stockItems: "9ZZZZZ:1,1FKT5H:2",
      })
    ).toBe("perle.jpg");
  });

  it("retombe sur le nom quand la reference est inconnue", () => {
    expect(
      imageOfOrder(index, { productName: "Collier Perle", stockItems: "9ZZZZZ:1" })
    ).toBe("perle.jpg");
  });

  it("ne rend rien sans produit reconnaissable", () => {
    expect(imageOfOrder(index, {})).toBeUndefined();
    expect(imageOfOrder(index, { productName: "Inconnu" })).toBeUndefined();
  });
});
