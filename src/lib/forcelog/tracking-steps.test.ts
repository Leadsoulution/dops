import { describe, it, expect } from "vitest";
import {
  viewForStatus,
  stepDates,
  trackingUrl,
  publicHistory,
  STEPS,
} from "./tracking-steps";

describe("viewForStatus", () => {
  it("annonce un colis a peine cree comme deja collecte", () => {
    // Entre notre enregistrement et le passage du ramasseur il s'ecoule
    // quelques heures : afficher "en attente" pendant ce temps inquiete
    // sans rien apprendre.
    expect(viewForStatus("NEW_PARCEL").currentIndex).toBe(0);
    expect(viewForStatus("ATT_CONF").currentIndex).toBe(0);
  });

  it("place chaque etape au bon rang", () => {
    expect(viewForStatus("WAITING_PICKUP").currentIndex).toBe(1);
    expect(viewForStatus("SENT").currentIndex).toBe(1);
    expect(viewForStatus("RECEIVED").currentIndex).toBe(2);
    expect(viewForStatus("DISTRIBUTION").currentIndex).toBe(2);
    expect(viewForStatus("DELIVERED").currentIndex).toBe(3);
  });

  it("garde un colis reporte dans sa ville", () => {
    // Report, absence, injoignable : le colis est toujours sur place, et
    // reculer la ligne suggererait un retour en arriere qui n'a pas eu lieu.
    for (const c of ["POSTPONED", "NO_ANSWER", "UNREACHABLE", "RELAUNCH"])
      expect(viewForStatus(c).currentIndex).toBe(2);
  });

  it("sort du chemin les colis qui ne seront pas livres", () => {
    for (const code of ["RETURNED", "REFUSE", "CANCELED"]) {
      const v = viewForStatus(code);
      expect(v.currentIndex).toBe(-1);
      expect(v.stopped).toBeTruthy();
      expect(v.done).toBe(false);
    }
  });

  it("ne tombe pas sur un code inconnu", () => {
    const v = viewForStatus("CODE_QUI_NEXISTE_PAS_ENCORE");
    expect(v.currentIndex).toBeGreaterThanOrEqual(0);
    expect(v.stopped).toBeUndefined();
  });

  it("parle au client de son colis, pas d'un entrepot", () => {
    expect(viewForStatus("RECEIVED").headline).toContain("votre ville");
    expect(viewForStatus("DELIVERED").headline).toContain("livre");
  });
});

describe("stepDates", () => {
  it("retient la premiere fois qu'une etape est atteinte", () => {
    const d = stepDates([
      { STATUS_CODE: "NEW_PARCEL", TIME: "2026-09-22 14:55" },
      { STATUS_CODE: "DISTRIBUTION", TIME: "2026-09-23 09:31" },
      { STATUS_CODE: "POSTPONED", TIME: "2026-09-23 18:00" },
      // Retour en livraison le lendemain : la date d'origine doit rester.
      { STATUS_CODE: "DISTRIBUTION", TIME: "2026-09-24 10:00" },
    ]);
    expect(d.collected).toBe("2026-09-22 14:55");
    expect(d.in_city).toBe("2026-09-23 09:31");
  });

  it("ignore un historique vide sans se plaindre", () => {
    expect(stepDates([])).toEqual({});
  });
});

describe("trackingUrl", () => {
  it("compose l'adresse envoyee au client", () => {
    expect(trackingUrl("F-ALR26MY1QM91", "https://orderly.host")).toBe(
      "https://orderly.host/suivi-F-ALR26MY1QM91"
    );
  });

  it("ne double pas la barre oblique", () => {
    expect(trackingUrl("F-1", "https://orderly.host/")).toBe(
      "https://orderly.host/suivi-F-1"
    );
  });
});

describe("STEPS", () => {
  it("decrit les quatre etapes attendues", () => {
    expect(STEPS.map((s) => s.label)).toEqual([
      "Collecte", "En cours de livraison", "Dans votre ville", "Livre",
    ]);
  });
});

describe("publicHistory", () => {
  it("remplace les mots du transporteur par les notres", () => {
    const h = publicHistory([
      { STATUS_CODE: "NEW_PARCEL", STATUS_NAME: "Nouveau Colis", TIME: "1" },
      { STATUS_CODE: "WAITING_PICKUP", STATUS_NAME: "Attente De Ramassage", TIME: "2" },
    ]);
    // "Attente De Ramassage" ne dit rien a un client et laisse croire
    // que rien n'avance.
    expect(h.map((e) => e.label)).toEqual(["Collecte", "En cours de livraison"]);
    expect(JSON.stringify(h)).not.toContain("Ramassage");
  });

  it("ne repete pas deux fois la meme etape", () => {
    const h = publicHistory([
      { STATUS_CODE: "SENT", TIME: "1" },
      { STATUS_CODE: "TSUIVI", TIME: "2" },
      { STATUS_CODE: "DISTRIBUTION", TIME: "3" },
    ]);
    // SENT et TSUIVI tombent dans la meme etape : une ligne suffit.
    expect(h).toHaveLength(2);
  });
});
