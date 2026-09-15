import { describe, it, expect, vi, afterEach } from "vitest";
import { isStale, STALE_DAYS, type LeadStatus } from "./leads-data";

/** Une date au format que portent les commandes importees. */
function ilYA(jours: number): string {
  const d = new Date(Date.now() - jours * 86400000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

describe("isStale", () => {
  afterEach(() => vi.useRealTimers());

  it("retient une commande ouverte plus vieille que le delai", () => {
    expect(isStale({ status: "Pas de rep 2", date: ilYA(STALE_DAYS + 1) })).toBe(true);
  });

  it("ignore une commande recente", () => {
    expect(isStale({ status: "Pas de rep 2", date: ilYA(1) })).toBe(false);
  });

  // Une commande confirmee suit son cours chez le transporteur : elle
  // n'attend plus de decision, meme vieille de trois semaines.
  it.each<LeadStatus>([
    "Confirme",
    "Annulee",
    "Non commandee",
    "Expiree",
    "Faux numero",
    "En double",
    "TESTE",
  ])("ignore une commande close (%s)", (status) => {
    expect(isStale({ status, date: ilYA(30) })).toBe(false);
  });

  it("ignore une date illisible plutot que de la croire ancienne", () => {
    expect(isStale({ status: "Nouveau", date: "pas une date" })).toBe(false);
    expect(isStale({ status: "Nouveau", date: "" })).toBe(false);
  });

  it("comprend les dates ecrites en francais", () => {
    const vieux = new Date(Date.now() - (STALE_DAYS + 2) * 86400000);
    const mois = new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(vieux);
    const date = `${vieux.getDate()} ${mois} ${vieux.getFullYear()}, 10:00`;
    expect(isStale({ status: "Nouveau", date })).toBe(true);
  });
});
