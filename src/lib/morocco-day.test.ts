import { describe, expect, it } from "vitest";
import {
  moroccoDate,
  moroccoDateShift,
  moroccoDayEnd,
  moroccoDayStart,
  moroccoMonthStart,
  moroccoOffsetMinutes,
  moroccoSpan,
} from "./morocco-day";

describe("moroccoOffsetMinutes", () => {
  it("rend une heure d'avance sur UTC", () => {
    expect(moroccoOffsetMinutes(new Date("2026-10-05T12:00:00Z"))).toBe(60);
  });

  it("mesure le decalage au lieu de le supposer", () => {
    // Le Maroc repasse a UTC+0 pendant le ramadan. Une constante
    // aurait fausse un mois par an sans que personne ne comprenne.
    const hiver = moroccoOffsetMinutes(new Date("2026-01-15T12:00:00Z"));
    expect([0, 60]).toContain(hiver);
  });
});

describe("moroccoDate", () => {
  it("donne la date marocaine, pas celle d'UTC", () => {
    // 23h30 a Casablanca le 5, mais deja 22h30 UTC le meme jour.
    expect(moroccoDate(new Date("2026-10-05T22:30:00Z"))).toBe("2026-10-05");
  });

  it("bascule au bon moment, pas une heure trop tot", () => {
    // 23h59 UTC, c'est deja 00h59 le lendemain au Maroc.
    expect(moroccoDate(new Date("2026-10-05T23:59:00Z"))).toBe("2026-10-06");
    // 22h59 UTC, c'est encore le 5 au Maroc.
    expect(moroccoDate(new Date("2026-10-05T22:59:00Z"))).toBe("2026-10-05");
  });
});

describe("moroccoDayStart / moroccoDayEnd", () => {
  it("fait commencer la journee a minuit a Casablanca", () => {
    // Minuit au Maroc, c'est 23h00 UTC la veille.
    expect(moroccoDayStart("2026-10-05").toISOString()).toBe(
      "2026-10-04T23:00:00.000Z"
    );
  });

  it("la termine juste avant le minuit suivant", () => {
    expect(moroccoDayEnd("2026-10-05").toISOString()).toBe(
      "2026-10-05T22:59:59.999Z"
    );
  });

  it("couvre la journee entiere, sans trou ni recouvrement", () => {
    const fin = moroccoDayEnd("2026-10-05").getTime();
    const debutSuivant = moroccoDayStart("2026-10-06").getTime();
    expect(debutSuivant - fin).toBe(1);
  });

  it("une commande de 23h30 au Maroc tombe le bon jour", () => {
    // C'est le cas qui se voyait : passee a 23h30 a Casablanca, elle
    // apparaissait le lendemain parce qu'on comptait en UTC.
    const commande = new Date("2026-10-05T22:30:00Z");
    expect(commande >= moroccoDayStart("2026-10-05")).toBe(true);
    expect(commande <= moroccoDayEnd("2026-10-05")).toBe(true);
  });
});

describe("moroccoDateShift", () => {
  it("recule d'un jour", () => {
    expect(moroccoDateShift("2026-10-05", -1)).toBe("2026-10-04");
  });

  it("passe les debuts de mois et d'annee", () => {
    expect(moroccoDateShift("2026-10-01", -1)).toBe("2026-09-30");
    expect(moroccoDateShift("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("recule de six jours pour une semaine qui compte aujourd'hui", () => {
    expect(moroccoDateShift("2026-10-05", -6)).toBe("2026-09-29");
  });
});

describe("moroccoMonthStart", () => {
  it("rend le premier du mois", () => {
    expect(moroccoMonthStart("2026-10-05")).toBe("2026-10-01");
  });
});

describe("moroccoSpan", () => {
  it("couvre du premier minuit au dernier instant", () => {
    expect(moroccoSpan("2026-10-01", "2026-10-05")).toEqual({
      from: "2026-09-30T23:00:00.000Z",
      to: "2026-10-05T22:59:59.999Z",
    });
  });
});
