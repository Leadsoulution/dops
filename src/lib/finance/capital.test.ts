import { describe, it, expect } from "vitest";
import {
  capitalLines,
  capitalSummary,
  mouvementInvalide,
  type CapitalMovement,
} from "./capital";

function mouvement(o: Partial<CapitalMovement> = {}): CapitalMovement {
  return {
    id: "m1",
    direction: "sortie",
    label: "Achat cartons",
    amountMad: 1200,
    happenedOn: "2026-10-20",
    createdAt: "2026-10-20T10:00:00Z",
    ...o,
  };
}

const pub = (o: Partial<{ id: string; label: string; platform: string; amountMad: number; startDate: string }> = {}) => ({
  id: "p1",
  label: "Campagne montre",
  platform: "Facebook",
  amountMad: 500,
  startDate: "2026-10-21",
  ...o,
});

describe("capitalLines", () => {
  it("melange les mouvements saisis et les budgets publicitaires", () => {
    const lignes = capitalLines([mouvement()], [pub()], "2026-10-01");
    expect(lignes.map((l) => l.source)).toEqual(["publicite", "manuel"]);
    expect(lignes[0].direction).toBe("sortie");
  });

  /*
   * Une publicite sort de la banque en une fois le jour ou elle est
   * engagee ; le profit, lui, l'etale sur la campagne. Les deux
   * lectures sont justes, et c'est pour cela qu'elles sont separees.
   */
  it("date la publicite au jour de son engagement, pour son montant entier", () => {
    const [ligne] = capitalLines(
      [],
      [pub({ amountMad: 3000, startDate: "2026-10-01" })],
      "2026-10-01"
    );
    expect(ligne.date).toBe("2026-10-01");
    expect(ligne.amount).toBe(3000);
  });

  it("montre les sorties avant les entrees du meme jour", () => {
    const lignes = capitalLines(
      [
        mouvement({ id: "a", direction: "entree", happenedOn: "2026-10-20" }),
        mouvement({ id: "b", direction: "sortie", happenedOn: "2026-10-20" }),
      ],
      []
    );
    expect(lignes.map((l) => l.id)).toEqual(["a", "b"]);
  });
});

describe("publicites et date d'ouverture", () => {
  /*
   * Les budgets d'avant l'ouverture du carnet ont deja ete payes : ils
   * sont compris dans le solde saisi au depart, et les redescendre
   * viderait un compte qui ne l'est pas.
   */
  it("ignore les publicites engagees avant l'ouverture", () => {
    const lignes = capitalLines(
      [],
      [
        pub({ id: "vieille", startDate: "2026-10-01", amountMad: 9000 }),
        pub({ id: "nouvelle", startDate: "2026-10-24", amountMad: 500 }),
      ],
      "2026-10-24"
    );
    expect(lignes.map((l) => l.id)).toEqual(["pub:nouvelle"]);
    expect(capitalSummary(lignes).sortiesPublicite).toBe(500);
  });

  it("compte celle du jour meme de l'ouverture", () => {
    const lignes = capitalLines([], [pub({ startDate: "2026-10-24" })], "2026-10-24");
    expect(lignes).toHaveLength(1);
  });

  it("laisse les mouvements saisis en dehors de cette regle", () => {
    // Saisi a la main, donc voulu : une correction datee d'avant garde
    // sa place dans le carnet.
    const lignes = capitalLines(
      [mouvement({ happenedOn: "2026-09-01" })],
      [],
      "2026-10-24"
    );
    expect(lignes).toHaveLength(1);
  });
});

describe("capitalSummary", () => {
  it("fait le solde des entrees et des sorties", () => {
    const total = capitalSummary(
      capitalLines(
        [
          mouvement({ id: "a", direction: "entree", amountMad: 10000 }),
          mouvement({ id: "b", direction: "sortie", amountMad: 1200 }),
        ],
        [pub({ amountMad: 500 })],
        "2026-10-01"
      )
    );
    expect(total).toEqual({
      entrees: 10000,
      sorties: 1700,
      sortiesPublicite: 500,
      solde: 8300,
    });
  });

  it("rend un solde negatif plutot que de le cacher", () => {
    const total = capitalSummary(capitalLines([mouvement({ amountMad: 300 })], []));
    expect(total.solde).toBe(-300);
  });

  it("ne traine pas les centimes des flottants", () => {
    const total = capitalSummary(
      capitalLines(
        [
          mouvement({ id: "a", direction: "entree", amountMad: 0.1 }),
          mouvement({ id: "b", direction: "entree", amountMad: 0.2 }),
        ],
        []
      )
    );
    expect(total.entrees).toBe(0.3);
  });
});

describe("mouvementInvalide", () => {
  it("accepte un mouvement complet", () => {
    expect(
      mouvementInvalide({
        direction: "sortie",
        label: "Cartons",
        amountMad: 10,
        happenedOn: "2026-10-20",
      })
    ).toBeNull();
  });

  it("refuse un montant nul, negatif ou absent", () => {
    const base = {
      direction: "sortie" as const,
      label: "Cartons",
      happenedOn: "2026-10-20",
    };
    expect(mouvementInvalide({ ...base, amountMad: 0 })).toBe("Montant invalide.");
    expect(mouvementInvalide({ ...base, amountMad: -5 })).toBe("Montant invalide.");
    expect(mouvementInvalide(base)).toBe("Montant invalide.");
  });

  it("refuse un sens inconnu : il deciderait du signe du solde", () => {
    expect(
      mouvementInvalide({
        direction: "retrait" as never,
        label: "Cartons",
        amountMad: 10,
        happenedOn: "2026-10-20",
      })
    ).toBe("Sens du mouvement manquant.");
  });
});
