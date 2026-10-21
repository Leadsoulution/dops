import "server-only";
import type { Lead } from "@/components/dashboard/leads-data";
import { amountValue, roundToTen } from "@/lib/amount";
import { orderLines } from "@/lib/order-lines";
import { speedafCityFor } from "@/lib/supabase/carrier-cities";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createOrder, SpeedafError } from "./client";
import {
  getSpeedafSettings,
  manquePourExpedier,
} from "@/lib/supabase/speedaf-settings";
import { NOUVEAU } from "./status";

/**
 * Remettre une commande a Speedaf.
 *
 * Deux differences avec ForceLog decident de tout ce qui suit.
 *
 * Speedaf ne detient pas notre marchandise : il n'y a pas de colis de
 * stock, pas de reference a prelever, et c'est notre depot qui emballe.
 * La liste des articles qu'on lui envoie est donc descriptive — elle
 * sert au bordereau et a la douane interne, pas au prelevement.
 *
 * Et il exige l'expediteur a chaque colis, la ou ForceLog le connait
 * d'avance. Ces coordonnees viennent de l'environnement : elles ne
 * changent pas d'une commande a l'autre, et les laisser saisir
 * garantirait qu'un jour un colis parte avec l'adresse d'un autre.
 */

/**
 * Envoie la commande et rend les champs de suivi a enregistrer.
 *
 * N'echoue jamais : une erreur part dans `trackingError` pour
 * s'afficher dans la colonne Code suivi, comme pour ForceLog. Un
 * probleme transporteur ne doit pas bloquer un changement de statut.
 */
export async function dispatchToSpeedaf(
  lead: Pick<
    Lead,
    | "reference"
    | "client"
    | "phone"
    | "ville"
    | "quartier"
    | "adresse"
    | "amount"
    | "productName"
    | "itemCount"
    | "stockItems"
    | "customerNote"
  >
): Promise<Partial<Lead>> {
  const config = await getSpeedafSettings();
  const manque = manquePourExpedier(config);
  if (!config || manque) {
    return { trackingError: manque ?? "Identifiants Speedaf non configures." };
  }
  const expediteur = config.sender;
  if (!lead.ville?.trim()) {
    return { trackingError: "Ville manquante : Speedaf la refuserait." };
  }

  /*
   * La ville, telle que Speedaf l'ecrit.
   *
   * Leur liste n'est pas la notre : ils desservent huit cent treize
   * localites, dont la moitie nous est inconnue, et ignorent la moitie
   * des notres. Envoyer notre orthographe ferait refuser le colis a
   * l'adresse, ou pire, le ferait partir ailleurs. Une ville qu'ils
   * ne connaissent pas est donc refusee ici, pas chez eux.
   */
  const villeSpeedaf = await speedafCityFor(lead.ville).catch(() => null);
  if (!villeSpeedaf) {
    return {
      trackingError: `Speedaf ne dessert pas "${lead.ville}".`,
    };
  }

  /*
   * Les articles, un par ligne.
   *
   * Le code article sert de `sku` : c'est ce que le preparateur lit sur
   * le bordereau, et le seul identifiant stable du produit. Une
   * commande sans ligne reconnue part avec une ligne unique portant le
   * nom enregistre — mieux vaut un bordereau approximatif qu'un colis
   * refuse.
   */
  /*
   * Le catalogue, avec sa propre reference.
   *
   * Le `sku` envoye a Speedaf est celui que porte le produit dans
   * l'application — le meme que celui saisi dans leur entrepot. Le
   * code ForceLog ne leur dirait rien.
   */
  const { data: produits } = await getSupabaseServerClient()
    .from("products")
    .select("ref,name,forcelog_ref,default_parcel_type");
  const catalogue = ((produits ?? []) as {
    ref: string;
    name: string;
    forcelog_ref: string | null;
    default_parcel_type: string;
  }[]).map((p) => ({
    name: p.name,
    forcelogRef: p.forcelog_ref ?? undefined,
    defaultParcelType: (p.default_parcel_type === "stock" ? "stock" : "simple") as
      | "stock"
      | "simple",
    ref: p.ref,
  }));

  let lignes = orderLines(lead, catalogue);
  if (lignes.length === 0) {
    lignes = [{ name: lead.productName || "Commande", qty: lead.itemCount ?? 1 }];
  }

  const skuDe = (ligne: { name: string; ref?: string }) => {
    const produit =
      catalogue.find((p) => p.forcelogRef && p.forcelogRef === ligne.ref) ??
      catalogue.find(
        (p) => p.name.trim().toLowerCase() === ligne.name.trim().toLowerCase()
      );
    return produit?.ref ?? ligne.ref ?? ligne.name;
  };

  const montant = roundToTen(amountValue(lead.amount) ?? 0);
  const unites = lignes.reduce((s, l) => s + l.qty, 0) || 1;

  try {
    const colis = await createOrder(config, expediteur, {
      customOrderNo: lead.reference,
      acceptName: lead.client,
      acceptMobile: lead.phone,
      acceptAddress: lead.adresse?.trim() || lead.ville,
      acceptProvinceName: villeSpeedaf.parentName ?? villeSpeedaf.name,
      acceptCityName: villeSpeedaf.name,
      // Speedaf exige un district : le quartier quand on l'a, leur nom
      // de ville sinon — il refuse un champ vide.
      acceptDistrictName: lead.quartier?.trim() || villeSpeedaf.name,
      codFee: montant,
      parcelWeight: config.weight,
      remark: lead.customerNote?.trim() || undefined,
      items: lignes.map((l) => ({
        sku: skuDe(l),
        goodsName: l.name,
        goodsQTY: l.qty,
        // Valeur unitaire declaree : le montant reparti sur les unites.
        goodsValue: Math.round((montant / unites) * 100) / 100,
      })),
    });

    return {
      carrier: "speedaf",
      trackingNumber: colis.billCode,
      trackingError: null,
      // Speedaf ne gere pas de colis de stock : la marchandise part de
      // notre depot, quoi qu'ait dit le catalogue.
      parcelType: "simple",
      deliveryStatus: NOUVEAU.label,
      deliveryStatusCode: NOUVEAU.code,
      // Il ne dit rien du reglement : tant qu'il n'a pas verse, la
      // somme est due, comme chez ForceLog avant facturation.
      paymentStatus: "Non Paye",
    };
  } catch (error) {
    return {
      trackingError:
        error instanceof SpeedafError
          ? error.message
          : "Erreur inattendue lors de la creation du colis Speedaf.",
    };
  }
}
