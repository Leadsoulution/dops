import type { Lead } from "@/components/dashboard/leads-data";

/**
 * Les commandes qui arrivent d'un site fait a la main.
 *
 * Une page HTML n'a ni API ni format : chacun nomme ses champs comme
 * il veut, et celui qui l'a ecrite n'a pas envie de la reecrire pour
 * nous. On accepte donc les noms courants, en francais comme en
 * anglais, plutot que d'imposer les notres — le vendeur colle un bout
 * de code et ca marche, ou il garde son formulaire tel quel.
 *
 * Module pur : ni reseau ni base, pour que la correspondance des
 * champs se verifie sans rien brancher.
 */

export const WEB_FORMS_SETTINGS_ID = "web-forms";

/** Les noms acceptes pour chaque champ, du plus precis au plus vague. */
const ALIAS = {
  client: ["client", "name", "nom", "fullname", "full_name", "customer", "nom_complet"],
  phone: ["phone", "tel", "telephone", "gsm", "mobile", "numero", "phone_number"],
  ville: ["ville", "city", "town"],
  adresse: ["adresse", "address", "address1", "address_1", "rue"],
  productName: ["product", "produit", "productname", "product_name", "article", "offre"],
  quantite: ["quantity", "qty", "quantite", "qte", "nombre"],
  montant: ["amount", "montant", "price", "prix", "total", "cod"],
  note: ["note", "notes", "message", "remarque", "commentaire", "comment"],
  reference: ["reference", "ref", "order_id", "orderid", "commande"],
  quartier: ["quartier", "district", "zone"],
} as const;

function lire(corps: Record<string, unknown>, noms: readonly string[]): string {
  // La casse et les tirets ne doivent pas decider du sort d'une
  // commande : "Full Name", "full-name" et "fullname" sont le meme
  // champ pour celui qui a ecrit la page.
  const normalise = (s: string) => s.toLowerCase().replace(/[\s_-]/g, "");
  const index = new Map<string, unknown>();
  for (const [cle, valeur] of Object.entries(corps)) {
    index.set(normalise(cle), valeur);
  }
  for (const nom of noms) {
    const valeur = index.get(normalise(nom));
    if (typeof valeur === "string" && valeur.trim()) return valeur.trim();
    if (typeof valeur === "number") return String(valeur);
  }
  return "";
}

/**
 * Le telephone, debarrasse de ce qui n'est pas un chiffre.
 *
 * Les gens ecrivent "06 12-34.56 78" ou "+212612345678". Le
 * transporteur, lui, veut une suite de chiffres, et un espace de trop
 * fait echouer un colis a la creation. L'indicatif marocain redevient
 * un zero, parce que c'est sous cette forme que le reste de
 * l'application compare deux numeros.
 */
export function normalisePhone(brut: string): string {
  const chiffres = brut.replace(/\D/g, "");
  if (chiffres.startsWith("212")) return "0" + chiffres.slice(3);
  if (chiffres.startsWith("00212")) return "0" + chiffres.slice(5);
  return chiffres;
}

/** Un numero marocain tient en dix chiffres et commence par zero. */
export function phoneValide(phone: string): boolean {
  return /^0\d{9}$/.test(phone);
}

/**
 * Une reference qui ne peut pas entrer en collision.
 *
 * L'horodatage en base 36 suffirait presque ; le hasard final couvre
 * deux commandes passees dans la meme milliseconde, ce qui arrive des
 * qu'une publicite tourne. Douze caracteres au total, sous la limite
 * de seize que Speedaf impose a une reference.
 */
export function referenceWeb(now = Date.now(), alea = Math.random): string {
  const temps = now.toString(36).toUpperCase().slice(-6);
  const suffixe = Math.floor(alea() * 1296)
    .toString(36)
    .toUpperCase()
    .padStart(2, "0");
  return `WEB-${temps}${suffixe}`;
}

function etiquette(nom: string): string {
  const propre = nom.replace(/[^\p{L}\p{N} ]/gu, "").trim();
  return propre.slice(0, 4).toUpperCase() || "WEB";
}

function quand(date: Date): string {
  const jour = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Africa/Casablanca",
  }).format(date);
  const heure = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Africa/Casablanca",
  }).format(date);
  return `${jour}, ${heure}`;
}

export type Reception =
  | { ok: true; lead: Partial<Lead> }
  | { ok: false; erreur: string };

/**
 * Ce qui arrive du formulaire, transforme en commande.
 *
 * Deux champs seulement sont exiges : un nom et un telephone. Tout le
 * reste peut manquer — un agent rappellera. Refuser une commande
 * parce que la ville est vide reviendrait a jeter un client qui a
 * pris la peine de laisser son numero.
 */
export function receptionCommande(
  corps: Record<string, unknown>,
  maintenant = new Date(),
  alea = Math.random
): Reception {
  const client = lire(corps, ALIAS.client);
  const phoneBrut = lire(corps, ALIAS.phone);
  if (!client) return { ok: false, erreur: "Nom du client manquant." };
  if (!phoneBrut) return { ok: false, erreur: "Telephone manquant." };

  const phone = normalisePhone(phoneBrut);
  if (!phoneValide(phone)) {
    return {
      ok: false,
      erreur: `Telephone invalide : "${phoneBrut}". Attendu dix chiffres.`,
    };
  }

  const productName = lire(corps, ALIAS.productName);
  const quantite = Number(lire(corps, ALIAS.quantite)) || undefined;
  const montant = Number(lire(corps, ALIAS.montant).replace(",", ".")) || 0;

  return {
    ok: true,
    lead: {
      reference: lire(corps, ALIAS.reference) || referenceWeb(+maintenant, alea),
      client,
      phone,
      source: "Landing page",
      productName,
      productLabel: etiquette(productName),
      itemCount: quantite,
      // Zero dirham reste zero : une commande sans prix se rattrape a
      // l'appel, et inventer un montant fausserait le chiffre du jour.
      amount: `${Math.round(montant)} MAD`,
      status: "Nouveau",
      shipping: "En attente",
      assignedTo: "",
      date: quand(maintenant),
      ville: lire(corps, ALIAS.ville) || undefined,
      quartier: lire(corps, ALIAS.quartier) || undefined,
      adresse: lire(corps, ALIAS.adresse) || undefined,
      customerNote: lire(corps, ALIAS.note) || undefined,
    },
  };
}
