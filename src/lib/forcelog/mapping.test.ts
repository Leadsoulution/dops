import { describe, it, expect } from "vitest";
import { mapOrderToParcel } from "./mapping";
import { resolveParcelType } from "./parcel-type";
import { orderFields, orderLines } from "@/lib/order-lines";

describe("mapOrderToParcel", () => {
  it("maps the core order fields to ForceLog's AddParcel shape", () => {
    const parcel = mapOrderToParcel({
      reference: "spc-1003",
      client: "soufiane imil",
      phone: "0660164362",
      ville: "Oujda",
      adresse: "11 Rue Example",
      amount: "500 MAD",
      productName: "SAC LO",
    });

    expect(parcel).toEqual({
      ORDER_NUM: "spc-1003",
      RECEIVER: "soufiane imil",
      PHONE: "0660164362",
      CITY: "Oujda",
      ADDRESS: "11 Rue Example",
      PRODUCT_NATURE: "SAC LO",
      COD: 500,
    });
  });

  it("falls back to the city when no address is set", () => {
    const parcel = mapOrderToParcel({
      reference: "spc-1002",
      client: "soufiane imil",
      phone: "0660164361",
      ville: "Sale",
      amount: "200 MAD",
      productName: "Diffuseur Atlas Zen",
    });
    expect(parcel.ADDRESS).toBe("Sale");
  });

  it("arrondit le montant a encaisser a la dizaine", () => {
    // Le livreur reclame le compte rond annonce au client, pas 199.
    const parcel = mapOrderToParcel({
      reference: "spc-1005",
      client: "Hind",
      phone: "0713935915",
      ville: "Casablanca",
      amount: "199 MAD",
      productName: "SAC LO",
    });
    expect(parcel.COD).toBe(200);
  });

  it("leaves COD undefined when the amount can't be parsed", () => {
    const parcel = mapOrderToParcel({
      reference: "spc-1004",
      client: "soufiane imil",
      phone: "0660164361",
      amount: "Sans tarif",
      productName: "Diffuseur Atlas Zen",
    });
    expect(parcel.COD).toBeUndefined();
  });

  it("envoie le code transporteur comme ville, en gardant le nom lisible pour l'adresse", () => {
    const parcel = mapOrderToParcel({
      reference: "spc-1006",
      client: "Ahmed",
      phone: "0681341881",
      ville: "Oulad berhil (Ouled Berhil)",
      carrierCity: "ODB",
      amount: "200 MAD",
      productName: "SAC LO",
    });
    // La parenthese du nom fait echouer leur recherche de ville.
    expect(parcel.CITY).toBe("ODB");
    expect(parcel.ADDRESS).toBe("Oulad berhil (Ouled Berhil)");
  });

  it("truncates fields to ForceLog's documented max lengths", () => {
    const parcel = mapOrderToParcel({
      reference: "x".repeat(30),
      client: "y".repeat(60),
      phone: "0".repeat(20),
      amount: "100 MAD",
      productName: "z".repeat(150),
    });
    expect(parcel.ORDER_NUM.length).toBe(20);
    expect(parcel.RECEIVER.length).toBe(50);
    expect(parcel.PHONE.length).toBe(14);
    expect(parcel.PRODUCT_NATURE?.length).toBe(100);
  });
  it("transmet la note du client dans le COMMENT du colis", () => {
    const parcel = mapOrderToParcel({
      reference: "WC-1",
      client: "Client",
      phone: "0600000000",
      carrierCity: "MRK",
      amount: "200 MAD",
      productName: "SAC",
      customerNote: "  livrer apres 19H  ",
    });
    // C'est le seul champ que le livreur lira : la note y arrive nettoyee.
    expect(parcel.COMMENT).toBe("livrer apres 19H");
  });

  it("n'envoie pas de COMMENT quand il n'y a pas de note", () => {
    const sans = mapOrderToParcel({
      reference: "WC-2",
      client: "Client",
      phone: "0600000000",
      amount: "200 MAD",
      productName: "SAC",
    });
    const vide = mapOrderToParcel({
      reference: "WC-3",
      client: "Client",
      phone: "0600000000",
      amount: "200 MAD",
      productName: "SAC",
      customerNote: "   ",
    });
    // Un champ absent vaut mieux qu'un champ blanc : ForceLog imprimerait
    // une ligne de commentaire vide sur le bordereau.
    expect("COMMENT" in sans).toBe(false);
    expect("COMMENT" in vide).toBe(false);
  });
});

describe("une commande de plusieurs produits, de bout en bout", () => {
  /*
   * Le trajet complet d'une commande saisie a la main : quatre produits
   * coches, un total ecrit par l'agent, et ce que le transporteur en
   * recoit. C'est le chemin qui se cassait — les quatre articles
   * arrivaient comme un seul, en quatre exemplaires.
   */
  const CATALOGUE = [
    { name: "Collier A", forcelogRef: "R1", defaultParcelType: "stock" as const },
    { name: "Collier B", forcelogRef: "R2", defaultParcelType: "stock" as const },
    { name: "Collier C", forcelogRef: "R3", defaultParcelType: "stock" as const },
    { name: "Collier D", forcelogRef: "R4", defaultParcelType: "stock" as const },
  ];

  const champs = orderFields([
    { name: "Collier A", qty: 1, ref: "R1" },
    { name: "Collier B", qty: 2, ref: "R2" },
    { name: "Collier C", qty: 1, ref: "R3" },
    { name: "Collier D", qty: 1, ref: "R4" },
  ]);

  it("garde les quatre references et leurs quantites", () => {
    expect(champs.stockItems).toBe("R1:1,R2:2,R3:1,R4:1");
    expect(champs.itemCount).toBe(5);
  });

  it("ne les ramene pas a un seul article avant l'envoi", () => {
    const choix = resolveParcelType(
      {
        productName: champs.productName,
        itemCount: champs.itemCount,
        parcelType: champs.parcelType,
        stockItems: champs.stockItems ?? undefined,
      },
      CATALOGUE
    );
    expect(choix).toEqual({
      parcelType: "stock",
      stockItems: "R1:1,R2:2,R3:1,R4:1",
    });
  });

  it("envoie au transporteur les quatre produits et le montant ecrit", () => {
    const parcel = mapOrderToParcel({
      reference: "MO-TEST-1013",
      client: "Farida",
      phone: "0600000000",
      ville: "Rabat",
      amount: "300 MAD",
      productName: champs.productName,
      parcelType: champs.parcelType,
      stockItems: champs.stockItems ?? undefined,
    });
    expect(parcel.STOCK).toBe("R1:1,R2:2,R3:1,R4:1");
    expect(parcel.PRODUCT_NATURE).toBe(
      "Collier A, Collier B, Collier C, Collier D"
    );
    expect(parcel.COD).toBe(300);
  });

  it("relit la commande enregistree comme quatre produits", () => {
    const lignes = orderLines({
      productName: champs.productName,
      itemCount: champs.itemCount,
      stockItems: champs.stockItems ?? undefined,
    });
    expect(lignes.map((l) => `${l.name} x${l.qty}`)).toEqual([
      "Collier A x1",
      "Collier B x2",
      "Collier C x1",
      "Collier D x1",
    ]);
  });
});
