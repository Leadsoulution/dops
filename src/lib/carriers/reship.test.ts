import { describe, expect, it } from "vitest";
import { referenceRenvoi, refusDeRenvoi } from "./reship";

describe("refusDeRenvoi", () => {
  it("laisse repartir un colis retourne", () => {
    expect(
      refusDeRenvoi({ trackingNumber: "MA0206", deliveryStatusCode: "RETURNED" })
    ).toBeNull();
  });

  it("laisse repartir un colis refuse par le client", () => {
    expect(
      refusDeRenvoi({ trackingNumber: "MA0206", deliveryStatusCode: "REFUSE" })
    ).toBeNull();
  });

  it("retient un colis encore en cours de livraison", () => {
    // Le plus important : deux colis vivants, c'est la marchandise
    // partie deux fois et la livraison payee deux fois.
    expect(
      refusDeRenvoi({
        trackingNumber: "MA0206",
        deliveryStatusCode: "DISTRIBUTION",
      })
    ).toMatch(/encore chez le transporteur/);
  });

  it("retient un client injoignable : le colis est toujours chez le livreur", () => {
    expect(
      refusDeRenvoi({
        trackingNumber: "MA0206",
        deliveryStatusCode: "UNREACHABLE",
      })
    ).toMatch(/encore chez le transporteur/);
  });

  it("renvoie vers la duplication pour une commande livree", () => {
    expect(
      refusDeRenvoi({
        trackingNumber: "MA0206",
        deliveryStatusCode: "DELIVERED",
      })
    ).toMatch(/dupliquez/i);
  });

  it("refuse une commande jamais expediee", () => {
    expect(refusDeRenvoi({ deliveryStatusCode: "RETURNED" })).toMatch(
      /Jamais expediee/
    );
  });
});

describe("referenceRenvoi", () => {
  it("laisse la reference intacte au premier envoi", () => {
    expect(referenceRenvoi("MO-E8HQ7-0811", 1)).toBe("MO-E8HQ7-0811");
  });

  it("suffixe le deuxieme colis d'une commande", () => {
    expect(referenceRenvoi("WC-1947", 2)).toBe("WC-1947-R2");
    expect(referenceRenvoi("WC-1947", 3)).toBe("WC-1947-R3");
  });

  it("tient dans les seize caracteres de Speedaf", () => {
    const ref = referenceRenvoi("MO-E8HQ7-0811", 2);
    expect(ref).toBe("MO-E8HQ7-0811-R2");
    expect(ref.length).toBe(16);
  });

  it("raccourcit la reference plutot que de laisser Speedaf la couper", () => {
    // Coupee par Speedaf, "REFERENCE-TRES-LONGUE-R2" et sa suivante
    // finiraient identiques, donc sur le meme colis.
    const deux = referenceRenvoi("REFERENCE-TRES-LONGUE", 2);
    const trois = referenceRenvoi("REFERENCE-TRES-LONGUE", 3);
    expect(deux.length).toBeLessThanOrEqual(16);
    expect(trois.length).toBeLessThanOrEqual(16);
    expect(deux).not.toBe(trois);
  });
});
