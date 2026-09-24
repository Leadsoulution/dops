import { describe, it, expect } from "vitest";
import {
  noticeFor,
  viewForStatus,
  stepDates,
  trackingUrl,
  publicHistory,
  STEPS,
} from "./tracking-steps";

describe("viewForStatus", () => {
  it("ne s'arrete jamais sur la premiere etape", () => {
    // "Colis cree" n'est la que pour montrer d'ou part le parcours :
    // des qu'un colis existe, elle est franchie.
    expect(viewForStatus("NEW_PARCEL").currentIndex).toBe(1);
    expect(viewForStatus("ATT_CONF").currentIndex).toBe(1);
    expect(viewForStatus("NEW_PARCEL").currentIndex).toBeGreaterThan(0);
  });

  it("place chaque etape au bon rang", () => {
    expect(viewForStatus("WAITING_PICKUP").currentIndex).toBe(2);
    expect(viewForStatus("SENT").currentIndex).toBe(2);
    expect(viewForStatus("RECEIVED").currentIndex).toBe(3);
    expect(viewForStatus("DISTRIBUTION").currentIndex).toBe(3);
    expect(viewForStatus("DELIVERED").currentIndex).toBe(4);
  });

  it("garde un colis reporte dans sa ville", () => {
    // Report, absence, injoignable : le colis est toujours sur place, et
    // reculer la ligne suggererait un retour en arriere qui n'a pas eu lieu.
    for (const c of ["POSTPONED", "NO_ANSWER", "UNREACHABLE", "RELAUNCH"])
      expect(viewForStatus(c).currentIndex).toBe(3);
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
    expect(viewForStatus("RECEIVED").headline.fr).toContain("votre ville");
    expect(viewForStatus("DELIVERED").headline.fr).toContain("livre");
    expect(viewForStatus("RECEIVED").headline.ar.length).toBeGreaterThan(0);
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
    // La premiere etape prend la plus ancienne date connue : le colis
    // existe forcement avant d'etre collecte.
    expect(d.created).toBe("2026-09-22 14:55");
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
  it("decrit les cinq etapes attendues", () => {
    expect(STEPS.map((s) => s.fr)).toEqual([
      "Colis cree", "Collecte", "En cours de livraison",
      "Dans votre ville", "Livre",
    ]);
  });

  it("donne chaque etape dans les deux langues", () => {
    // Nos clients lisent l'une ou l'autre, rarement les deux : une
    // etape sans traduction en laisse la moitie deviner.
    for (const step of STEPS) {
      expect(step.fr.length).toBeGreaterThan(0);
      expect(step.ar.length).toBeGreaterThan(0);
      expect(step.ar).not.toBe(step.fr);
    }
  });
});

describe("publicHistory", () => {
  it("remplace les mots du transporteur par les notres", () => {
    const h = publicHistory([
      { STATUS_CODE: "NEW_PARCEL", TIME: "1" },
      { STATUS_CODE: "WAITING_PICKUP", TIME: "2" },
    ]);
    // "Attente De Ramassage" ne dit rien a un client et laisse croire
    // que rien n'avance.
    expect(h.map((e) => e.label.fr)).toEqual([
      "Collecte",
      "En cours de livraison",
    ]);
    expect(JSON.stringify(h)).not.toContain("Ramassage");
    // Et chaque ligne porte sa traduction.
    for (const e of h) expect(e.label.ar.length).toBeGreaterThan(0);
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

describe("noticeFor", () => {
  it("demande de rester joignable tant que tout avance", () => {
    const n = noticeFor("DISTRIBUTION");
    expect(n?.kind).toBe("attente");
    expect(n?.text.fr).toContain("telephone");
    expect(n?.text.ar.length).toBeGreaterThan(0);
  });

  it("donne le numero du livreur quand il a deja essaye", () => {
    const n = noticeFor("NO_ANSWER", "0679138278");
    expect(n?.kind).toBe("rappel");
    expect(n?.text.fr).toContain("0679138278");
    expect(n?.text.ar).toContain("0679138278");
  });

  it("reste utile sans numero de livreur", () => {
    const n = noticeFor("UNREACHABLE");
    expect(n?.kind).toBe("rappel");
    expect(n?.text.fr).not.toContain("undefined");
  });

  it("ne dit rien quand il n'y a plus rien a faire", () => {
    // Colis livre, retourne ou annule : demander au client de rester
    // joignable n'aurait aucun sens.
    for (const c of ["DELIVERED", "RETURNED", "CANCELED", "REFUSE"])
      expect(noticeFor(c)).toBeNull();
  });
});
