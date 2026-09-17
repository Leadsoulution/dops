import { describe, it, expect, vi, beforeEach } from "vitest";

const insert = vi.fn().mockResolvedValue({ error: null });
const eq = vi.fn().mockResolvedValue({ error: null });
const update = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ insert, update }));

vi.mock("./server", () => ({ getSupabaseServerClient: () => ({ from }) }));

import { recordLeadChanges, recordLeadCreated } from "./lead-events";
import type { Lead } from "@/components/dashboard/leads-data";

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead-1",
    reference: "WC-1",
    productLabel: "",
    productName: "Produit",
    client: "Client",
    phone: "0600000000",
    source: "WooCommerce",
    assignedTo: "",
    amount: "199 MAD",
    status: "Nouveau",
    shipping: "En attente",
    date: "",
    ...overrides,
  } as Lead;
}

beforeEach(() => {
  insert.mockClear();
  update.mockClear();
  eq.mockClear();
});

describe("recordLeadChanges", () => {
  it("retient la personne qui a modifie la commande", async () => {
    await recordLeadChanges(lead(), lead({ status: "Confirme" }), {
      name: "Centrecall",
      id: "c1",
    });
    expect(insert).toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ last_modified_by: "Centrecall" })
    );
  });

  /*
   * Le cas qui effacait l'agent : ForceLog remonte un statut de livraison
   * quelques secondes apres chaque confirmation. Le journal doit le
   * garder, la colonne Assigne ne doit pas bouger.
   */
  it("n'attribue pas la commande a un automate", async () => {
    await recordLeadChanges(
      lead({ status: "Confirme" }),
      lead({ status: "Confirme", deliveryStatus: "Nouveau colis" }),
      { name: "ForceLog" }
    );
    expect(insert).toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("n'ecrit rien quand rien n'a change", async () => {
    await recordLeadChanges(lead(), lead(), { name: "Centrecall", id: "c1" });
    expect(insert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});

describe("recordLeadCreated", () => {
  it("journalise la creation sans attribuer la commande a l'automate", async () => {
    await recordLeadCreated("lead-1", { name: "WooCommerce" }, "Commande importee");
    expect(insert).toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("attribue une creation faite par une personne", async () => {
    await recordLeadCreated("lead-1", { name: "Amine", id: "a1" }, "Commande creee");
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ last_modified_by: "Amine" })
    );
  });
});
