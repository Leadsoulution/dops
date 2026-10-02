import { describe, expect, it } from "vitest";
import { coversDay, monthlyAmount, toMad, type Expense } from "./expense-types";

const base: Expense = {
  id: "1",
  type: "fixe",
  label: "Loyer",
  amount: 3000,
  currency: "MAD",
  exchangeRate: 1,
  amountMad: 3000,
  startDate: "2026-01-01",
  isActive: true,
  createdAt: "2026-01-01T00:00:00Z",
};

describe("toMad", () => {
  it("applique le taux saisi", () => {
    expect(toMad(100, 10)).toBe(1000);
  });

  it("arrondit au centime", () => {
    expect(toMad(33.333, 1)).toBe(33.33);
  });

  it("laisse un montant deja en dirhams intact", () => {
    expect(toMad(250.5, 1)).toBe(250.5);
  });
});

describe("monthlyAmount", () => {
  it("laisse une charge mensuelle telle quelle", () => {
    expect(monthlyAmount(3000, "mensuelle")).toBe(3000);
  });

  it("etale une charge annuelle sur douze mois", () => {
    // Une licence payee en janvier sert toute l'annee : la mettre
    // entierement sur janvier rendrait ce mois deficitaire pour rien.
    expect(monthlyAmount(1200, "annuelle")).toBe(100);
  });

  it("arrondit au centime", () => {
    expect(monthlyAmount(1000, "annuelle")).toBe(83.33);
  });
});

describe("coversDay", () => {
  it("couvre un jour dans sa plage", () => {
    expect(coversDay(base, "2026-06-15")).toBe(true);
  });

  it("ne couvre pas un jour anterieur au debut", () => {
    expect(coversDay(base, "2025-12-31")).toBe(false);
  });

  it("sans date de fin, couvre indefiniment", () => {
    expect(coversDay(base, "2030-01-01")).toBe(true);
  });

  it("s'arrete a la date de fin, celle-ci comprise", () => {
    const finie = { ...base, endDate: "2026-06-30" };
    expect(coversDay(finie, "2026-06-30")).toBe(true);
    expect(coversDay(finie, "2026-07-01")).toBe(false);
  });

  it("une charge desactivee ne couvre rien", () => {
    expect(coversDay({ ...base, isActive: false }, "2026-06-15")).toBe(false);
  });
});
