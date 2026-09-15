import { describe, it, expect } from "vitest";
import { mapOrderToParcel } from "./mapping";

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
});
