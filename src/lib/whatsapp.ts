import { LEAD_STATUSES } from "@/components/dashboard/leads-data";
import { displayAmount } from "@/lib/amount";

/**
 * Messages WhatsApp preremplis, un par statut.
 *
 * Apres un appel sans reponse, l'agent ecrit toujours a peu pres la meme
 * chose. L'ecrire a la main vingt fois par jour coute du temps et finit
 * par produire vingt versions differentes. Le message est donc compose
 * ici a partir du statut de la commande, et reste modifiable dans les
 * parametres.
 *
 * Module sans dependance serveur : la fiche de commande s'en sert dans
 * le navigateur, la page des parametres aussi.
 */

/** Ce qu'un modele peut reprendre de la commande. */
export type MessageOrder = {
  reference: string;
  client: string;
  phone: string;
  ville?: string;
  adresse?: string;
  quartier?: string;
  productName: string;
  itemCount?: number;
  amount: string;
  trackingNumber?: string;
  deliveryDate?: string;
};

/**
 * Les champs disponibles dans un modele, avec ce qu'ils valent pour une
 * commande donnee. Sert aussi a l'aide affichee dans les parametres.
 */
export const PLACEHOLDERS: {
  key: string;
  label: string;
  value: (order: MessageOrder) => string;
}[] = [
  { key: "client", label: "Nom du client", value: (o) => o.client },
  {
    key: "prenom",
    label: "Prenom seul",
    value: (o) => o.client.trim().split(/\s+/)[0] ?? o.client,
  },
  { key: "telephone", label: "Telephone", value: (o) => o.phone },
  { key: "reference", label: "Reference", value: (o) => o.reference },
  { key: "produit", label: "Produit", value: (o) => o.productName },
  { key: "quantite", label: "Quantite", value: (o) => String(o.itemCount ?? 1) },
  // Le prix arrondi, celui que le livreur reclamera reellement.
  { key: "prix", label: "Prix a payer", value: (o) => displayAmount(o.amount) },
  { key: "ville", label: "Ville", value: (o) => o.ville ?? "" },
  {
    key: "adresse",
    label: "Adresse complete",
    value: (o) => [o.adresse, o.quartier, o.ville].filter(Boolean).join(", "),
  },
  { key: "suivi", label: "Code de suivi", value: (o) => o.trackingNumber ?? "" },
  {
    key: "date_livraison",
    label: "Date de livraison",
    value: (o) => o.deliveryDate ?? "",
  },
];

/**
 * Le modele propose quand aucun n'a ete enregistre pour un statut.
 *
 * Les familles numerotees partagent le meme texte : "Pas de rep 1" et
 * "Pas de rep 4" appellent le meme message, seul le nombre de tentatives
 * change et il n'interesse pas le client.
 */
export function defaultTemplate(status: string): string {
  const recap =
    "Commande : {produit} (x{quantite})\n" +
    "Prix a payer a la livraison : {prix}\n" +
    "Adresse : {adresse}\n" +
    "Telephone : {telephone}\n" +
    "Reference : {reference}";

  if (status.startsWith("Pas de rep") || status.startsWith("Injoignable")) {
    return (
      "Bonjour {prenom}, nous avons essaye de vous joindre au sujet de " +
      "votre commande, sans succes.\n\n" +
      recap +
      "\n\nMerci de nous confirmer si vous souhaitez toujours la recevoir."
    );
  }

  switch (status) {
    case "Confirme":
    case "EXPIDER":
      return (
        "Bonjour {prenom}, votre commande est confirmee et part en " +
        "livraison.\n\n" +
        recap +
        "\n\nLe livreur vous appellera avant de passer."
      );
    case "Rappel":
    case "Reportee":
      return (
        "Bonjour {prenom}, comme convenu nous vous recontactons au sujet " +
        "de votre commande.\n\n" +
        recap +
        "\n\nQuel moment vous conviendrait pour la livraison ?"
      );
    case "En attente":
    case "Whatsapp":
      return (
        "Bonjour {prenom}, nous attendons votre confirmation pour lancer " +
        "la livraison.\n\n" +
        recap +
        "\n\nSouhaitez-vous confirmer cette commande ?"
      );
    case "Annulee":
    case "Non commandee":
      return (
        "Bonjour {prenom}, votre commande a bien ete annulee.\n\n" +
        recap +
        "\n\nN'hesitez pas a nous ecrire si c'est une erreur."
      );
    case "+3 jours":
      return (
        "Bonjour {prenom}, votre commande est en attente depuis plusieurs " +
        "jours.\n\n" +
        recap +
        "\n\nSouhaitez-vous toujours la recevoir ?"
      );
    default:
      return (
        "Bonjour {prenom}, nous vous contactons au sujet de votre " +
        "commande.\n\n" +
        recap
      );
  }
}

/** Tous les statuts, dans l'ordre ou la page des parametres les montre. */
export const MESSAGE_STATUSES = LEAD_STATUSES.map((s) => s.label as string);

/**
 * Remplace les champs entre accolades par leurs valeurs. Un champ
 * inconnu est laisse tel quel : mieux vaut le voir dans le message que
 * de l'effacer en silence, l'agent comprend alors qu'il s'est trompe.
 */
export function fillTemplate(template: string, order: MessageOrder): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const field = PLACEHOLDERS.find((p) => p.key === key);
    return field ? field.value(order) : whole;
  });
}

/**
 * Numero au format international attendu par WhatsApp : chiffres seuls,
 * indicatif pays compris.
 *
 * Les numeros marocains sont saisis en "06...", "06...", "+212 6..." ou
 * "212...". WhatsApp n'accepte que la derniere forme, sans signe ni
 * espace.
 */
export function whatsappNumber(phone: string, countryCode = "212"): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith(countryCode)) return digits;
  // Un zero initial est la notation nationale : il disparait derriere
  // l'indicatif.
  if (digits.startsWith("0")) return countryCode + digits.slice(1);
  return digits;
}

/**
 * Lien d'ouverture de la conversation, message deja ecrit. `wa.me`
 * fonctionne aussi bien avec l'application installee qu'avec WhatsApp Web.
 */
export function whatsappLink(order: MessageOrder, template: string): string {
  const number = whatsappNumber(order.phone);
  const text = encodeURIComponent(fillTemplate(template, order));
  return `https://wa.me/${number}?text=${text}`;
}

/** Le modele enregistre pour ce statut, ou celui propose par defaut. */
export function templateFor(
  status: string,
  saved: Record<string, string> | undefined
): string {
  const own = saved?.[status];
  return own && own.trim() ? own : defaultTemplate(status);
}
