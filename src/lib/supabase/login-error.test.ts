import { describe, expect, it } from "vitest";
import { refusDeConnexion } from "./login-error";

describe("refusDeConnexion", () => {
  it("reste vague quand les identifiants sont refuses", () => {
    expect(refusDeConnexion(400)).toEqual({
      message: "Email ou mot de passe incorrect.",
      http: 401,
    });
  });

  it("n'accuse pas le mot de passe quand le projet est bride", () => {
    // 402 : quota depasse cote Supabase. C'est le cas qui a fait
    // chercher un mot de passe pendant que l'application entiere etait
    // hors service.
    const refus = refusDeConnexion(402);
    expect(refus.http).toBe(503);
    expect(refus.message).toMatch(/mot de passe n'est pas en cause/);
  });

  it("nomme la limite de tentatives", () => {
    expect(refusDeConnexion(429).http).toBe(429);
    expect(refusDeConnexion(429).message).toMatch(/Trop de tentatives/);
  });

  it("traite une panne du service comme une panne, pas comme une faute", () => {
    for (const status of [500, 503, 0, undefined]) {
      expect(refusDeConnexion(status).http).toBe(503);
    }
  });
});
