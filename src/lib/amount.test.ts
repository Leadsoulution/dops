import { describe, it, expect } from "vitest";
import { roundToTen, amountValue, displayAmount } from "./amount";

describe("roundToTen", () => {
  it("arrondit a la dizaine la plus proche", () => {
    expect(roundToTen(199)).toBe(200);
    expect(roundToTen(189)).toBe(190);
    expect(roundToTen(299)).toBe(300);
    expect(roundToTen(192)).toBe(190);
    expect(roundToTen(195)).toBe(200);
  });

  it("laisse intact un montant deja rond", () => {
    expect(roundToTen(200)).toBe(200);
    expect(roundToTen(0)).toBe(0);
  });
});

describe("amountValue", () => {
  it("lit le nombre d'un montant ecrit", () => {
    expect(amountValue("199 MAD")).toBe(199);
    expect(amountValue("1 250 MAD")).toBe(1250);
    expect(amountValue("199,50 MAD")).toBe(199.5);
  });

  it("ne rend rien quand il n'y a pas de nombre", () => {
    expect(amountValue("Sans tarif")).toBeUndefined();
    expect(amountValue("")).toBeUndefined();
    expect(amountValue(undefined)).toBeUndefined();
  });
});

describe("displayAmount", () => {
  it("arrondit en gardant l'unite", () => {
    expect(displayAmount("199 MAD")).toBe("200 MAD");
    expect(displayAmount("189 MAD")).toBe("190 MAD");
    expect(displayAmount("299 dh")).toBe("300 dh");
  });

  it("laisse passer ce qui n'est pas un montant", () => {
    // Arrondir une absence de prix n'aurait pas de sens.
    expect(displayAmount("Sans tarif")).toBe("Sans tarif");
    expect(displayAmount(undefined)).toBe("");
  });

  it("rend un nombre nu quand il n'y a pas d'unite", () => {
    expect(displayAmount("199")).toBe("200");
  });
});
