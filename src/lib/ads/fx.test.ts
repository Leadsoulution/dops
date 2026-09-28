import { describe, expect, it } from "vitest";
import { fxRate, toMad } from "./fx";

describe("fxRate", () => {
  it("connait le dirham, le dollar et le dollar canadien", () => {
    expect(fxRate("MAD")).toBe(1);
    expect(fxRate("USD")).toBe(10);
    expect(fxRate("CAD")).toBe(7);
  });

  it("ignore la casse et les espaces", () => {
    expect(fxRate(" usd ")).toBe(10);
  });

  it("rend null sur une devise inconnue, jamais 1", () => {
    // 1 ferait passer mille euros pour mille dirhams, sans un mot.
    expect(fxRate("EUR")).toBeNull();
    expect(fxRate("")).toBeNull();
  });

  it("se laisse corriger par l'environnement", () => {
    process.env.ADS_FX_EUR_MAD = "11.2";
    try {
      expect(fxRate("EUR")).toBe(11.2);
    } finally {
      delete process.env.ADS_FX_EUR_MAD;
    }
  });
});

describe("toMad", () => {
  it("convertit et garde le taux applique", () => {
    expect(toMad(12.5, "USD")).toEqual({
      mad: 125,
      rate: 10,
      unknownCurrency: false,
    });
  });

  it("laisse le montant intact et le signale quand la devise est inconnue", () => {
    expect(toMad(100, "JPY")).toEqual({
      mad: 100,
      rate: 1,
      unknownCurrency: true,
    });
  });
});
