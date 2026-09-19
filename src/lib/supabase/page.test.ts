import { describe, it, expect, vi } from "vitest";
import { fetchAll } from "./page";

/**
 * Une table simulee qui repond par tranches, comme Supabase : jamais
 * plus de mille lignes a la fois, et une tranche incomplete signale la
 * fin.
 */
function table(total: number) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: i }));
  const range = vi.fn((from: number, to: number) =>
    Promise.resolve({ data: rows.slice(from, to + 1), error: null })
  );
  return { query: () => ({ range }), range };
}

describe("fetchAll", () => {
  it("rend tout d'une table plus petite que la tranche", async () => {
    const t = table(140);
    expect(await fetchAll(t.query)).toHaveLength(140);
    // Une seule tranche a suffi : la reponse etait incomplete.
    expect(t.range).toHaveBeenCalledTimes(1);
  });

  it("rend tout au-dela du plafond de mille lignes", async () => {
    // Le cas rencontre : 1252 evenements, dont 252 etaient invisibles.
    const t = table(1252);
    const rows = await fetchAll<{ id: number }>(t.query);
    expect(rows).toHaveLength(1252);
    expect(rows[1251].id).toBe(1251);
    expect(t.range).toHaveBeenCalledTimes(2);
  });

  it("ne perd rien quand le total tombe juste sur le plafond", async () => {
    // Mille lignes pile : la premiere tranche est pleine, il faut en
    // demander une seconde pour savoir qu'il n'y a plus rien.
    const t = table(1000);
    expect(await fetchAll(t.query)).toHaveLength(1000);
    expect(t.range).toHaveBeenCalledTimes(2);
  });

  it("rend une liste vide sur une table vide", async () => {
    expect(await fetchAll(table(0).query)).toEqual([]);
  });

  it("remonte une erreur au lieu de rendre une liste tronquee", async () => {
    const range = vi.fn(() =>
      Promise.resolve({ data: null, error: { message: "table absente" } })
    );
    await expect(fetchAll(() => ({ range }))).rejects.toThrow("table absente");
  });

  it("demande des tranches qui se suivent sans trou ni recouvrement", async () => {
    const t = table(2500);
    await fetchAll(t.query);
    expect(t.range.mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });
});
