import { describe, it, expect } from "vitest";
import { resolveAttribution } from "./attribution";

const ADMIN = new Set(["admin"]);
const AGENTS = new Set(["alice", "bob"]);

const at = (h: number) =>
  new Date(Date.parse("2026-09-17T08:00:00.000Z") + h * 3600_000).toISOString();

function event(lead_id: string, actor_id: string | null, hours: number) {
  return { lead_id, actor_id, created_at: at(hours) };
}

describe("resolveAttribution", () => {
  it("laisse un agent credite de son propre geste", () => {
    const e = event("1", "alice", 1);
    expect(resolveAttribution([e], ADMIN, AGENTS).get(e)).toBe("alice");
  });

  it("n'attribue rien a un automate", () => {
    const e = event("1", null, 1);
    expect(resolveAttribution([e], ADMIN, AGENTS).get(e)).toBeNull();
  });

  it("rend a l'agent la commande qu'il a travaillee", () => {
    // L'admin n'a fait que rectifier le statut d'une commande d'Alice.
    const agentTouch = event("1", "alice", 1);
    const adminTouch = event("1", "admin", 2);
    const map = resolveAttribution([agentTouch, adminTouch], ADMIN, AGENTS);
    expect(map.get(adminTouch)).toBe("alice");
  });

  it("choisit l'agent dont le geste est le plus proche dans le temps", () => {
    const loin = event("1", "alice", 0);
    const proche = event("1", "bob", 9);
    const adminTouch = event("1", "admin", 10);
    const map = resolveAttribution([loin, proche, adminTouch], ADMIN, AGENTS);
    expect(map.get(adminTouch)).toBe("bob");
  });

  it("donne au seul agent actif une commande que lui seul aurait pu traiter", () => {
    // Personne n'a touche la commande 2, mais Alice est la seule a
    // travailler sur la periode : c'est forcement son secteur.
    const ailleurs = event("1", "alice", 1);
    const adminSeul = event("2", "admin", 2);
    const map = resolveAttribution([ailleurs, adminSeul], ADMIN, AGENTS);
    expect(map.get(adminSeul)).toBe("alice");
  });

  it("n'attribue pas au hasard quand plusieurs agents travaillent", () => {
    const a = event("1", "alice", 1);
    const b = event("2", "bob", 1);
    const adminSeul = event("3", "admin", 2);
    const map = resolveAttribution([a, b, adminSeul], ADMIN, AGENTS);
    // Deux agents actifs, aucune trace sur la commande : on ne devine pas.
    expect(map.get(adminSeul)).toBeNull();
  });

  it("n'attribue rien quand aucun agent n'a travaille", () => {
    const adminSeul = event("1", "admin", 2);
    const map = resolveAttribution([adminSeul], ADMIN, AGENTS);
    expect(map.get(adminSeul)).toBeNull();
  });

  it("garde chaque geste de l'admin sur la commande qui lui correspond", () => {
    const aliceLead = event("1", "alice", 1);
    const bobLead = event("2", "bob", 1);
    const adminSurAlice = event("1", "admin", 3);
    const adminSurBob = event("2", "admin", 3);
    const map = resolveAttribution(
      [aliceLead, bobLead, adminSurAlice, adminSurBob],
      ADMIN,
      AGENTS
    );
    expect(map.get(adminSurAlice)).toBe("alice");
    expect(map.get(adminSurBob)).toBe("bob");
  });
});
