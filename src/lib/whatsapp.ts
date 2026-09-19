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
  /** Lien public de la photo du produit, tel qu'il est stocke. */
  productImage?: string;
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
  /**
   * Le lien de la photo du produit.
   *
   * Absent des modeles proposes : WhatsApp ne fabrique pas d'apercu pour
   * ces adresses, et le client recevait donc une URL nue au bas du
   * message. Le champ reste offert a qui le veut quand meme ; la vraie
   * photo, elle, passe par le bouton de partage de la fiche.
   */
  {
    key: "photo",
    label: "Photo du produit (lien)",
    value: (o) => o.productImage ?? "",
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
 * Statuts de livraison du transporteur, pour lesquels un message existe
 * aussi. Ranges sous leur code machine et non sous leur libelle : le
 * transporteur renomme ses statuts — "Expedie vers la ville" est devenu
 * "Recu ville" — et un modele range sous l'ancien nom serait perdu.
 */
export const DELIVERY_STATUSES: { code: string; label: string }[] = [
  { code: "NEW_PARCEL", label: "Nouveau colis" },
  { code: "WAITING_PICKUP", label: "Attente de ramassage" },
  { code: "TSUIVI", label: "Traitement suivi en cours" },
  { code: "DISTRIBUTION", label: "En cours de livraison" },
  { code: "PROGRAMMED", label: "Programme" },
  { code: "POSTPONED", label: "Reporte" },
  { code: "NO_ANSWER", label: "Pas de reponse (livreur)" },
  { code: "UNREACHABLE", label: "Injoignable (livreur)" },
  { code: "UNREACHABLE_TEAM", label: "Injoignable (suivi)" },
  { code: "OUT_OF_AREA", label: "Hors zone" },
  { code: "RELAUNCH", label: "Relancer" },
  { code: "DELIVERED", label: "Livre" },
  { code: "RETURNED", label: "Retourne" },
  { code: "CANCELED", label: "Annule" },
];

/**
 * Prefixe des modeles de livraison dans les reglages. Il evite qu'un
 * code transporteur et un statut de confirmation ne se disputent la
 * meme entree.
 */
export const DELIVERY_PREFIX = "livraison:";

/** Statuts de confirmation apres lesquels la commande est partie. */
const CONFIRMED = new Set(["Confirme", "EXPIDER"]);

/**
 * De quoi parler au client : de sa confirmation, ou de sa livraison ?
 *
 * Tant que la commande n'est pas confirmee, le sujet est la commande
 * elle-meme. Une fois partie chez le transporteur, le client n'a plus
 * rien a confirmer : ce qui l'interesse est ou se trouve son colis.
 */
export function messageKeyFor(lead: {
  status: string;
  deliveryStatusCode?: string;
}): string {
  if (CONFIRMED.has(lead.status) && lead.deliveryStatusCode) {
    return DELIVERY_PREFIX + lead.deliveryStatusCode;
  }
  return lead.status;
}

/** L'intitule a porter sur le bouton, pour la cle retenue. */
export function messageLabelFor(key: string): string {
  if (!key.startsWith(DELIVERY_PREFIX)) return key;
  const code = key.slice(DELIVERY_PREFIX.length);
  return DELIVERY_STATUSES.find((s) => s.code === code)?.label ?? code;
}

/**
 * Le texte propose pour un statut de livraison.
 *
 * En arabe : passe l'expedition, le client est lu par le livreur comme
 * par sa famille, et c'est la langue dans laquelle il repond. Les champs
 * entre accolades restent en caracteres latins, le remplacement portant
 * sur le nom du champ et non sur la langue.
 *
 * La reference interne n'y figure plus : elle ne dit rien au client. A
 * sa place, la gratuite de la livraison, qui evite une question et un
 * malentendu au moment de payer.
 */
export function defaultDeliveryTemplate(code: string): string {
  const recap =
    "الطلب : {produit} (×{quantite})\n" +
    "الثمن عند التسليم : {prix}\n" +
    "العنوان : {adresse}\n" +
    "التوصيل : مجاني";
  const suivi = "\n\nرقم التتبع : {suivi}";
  const bonjour = "مرحبا {prenom}، ";

  switch (code) {
    case "NEW_PARCEL":
    case "WAITING_PICKUP":
    case "TSUIVI":
      return (
        bonjour +
        "طلبكم جاهز وتم تسليمه لشركة التوصيل.\n\n" +
        recap +
        "\n\nسنخبركم بمجرد خروج الطلب للتوصيل."
      );
    case "DISTRIBUTION":
      return (
        bonjour +
        "طلبكم في طريقه إليكم اليوم.\n\n" +
        recap +
        suivi +
        "\n\nالمرجو البقاء متاحين، سيتصل بكم عامل التوصيل."
      );
    case "PROGRAMMED":
      return (
        bonjour +
        "تم برمجة توصيل طلبكم.\n\n" +
        recap +
        suivi +
        "\n\nسيتصل بكم عامل التوصيل قبل المرور."
      );
    case "POSTPONED":
      return (
        bonjour +
        "تم تأجيل توصيل طلبكم.\n\n" +
        recap +
        "\n\nأي يوم يناسبكم لمحاولة جديدة؟"
      );
    case "NO_ANSWER":
    case "UNREACHABLE":
    case "UNREACHABLE_TEAM":
      return (
        bonjour +
        "حاول عامل التوصيل الاتصال بكم لتسليم الطلب ولم يتمكن من ذلك.\n\n" +
        recap +
        suivi +
        "\n\nالمرجو إخبارنا بالوقت المناسب لكم."
      );
    case "OUT_OF_AREA":
      return (
        bonjour +
        "عنوانكم خارج منطقة التوصيل المعتادة.\n\n" +
        recap +
        "\n\nهل يمكنكم إعطاؤنا عنوانا آخر للتوصيل؟"
      );
    case "RELAUNCH":
      return (
        bonjour +
        "نعيد محاولة توصيل طلبكم.\n\n" +
        recap +
        suivi
      );
    case "DELIVERED":
      return (
        bonjour +
        "تم تسليم طلبكم بنجاح. شكرا على ثقتكم!\n\n" +
        recap +
        "\n\nلا تترددوا في مراسلتنا إذا كان هناك أي إشكال."
      );
    case "RETURNED":
    case "CANCELED":
      return (
        bonjour +
        "رجع طلبكم إلينا دون أن يتم تسليمه.\n\n" +
        recap +
        "\n\nهل ترغبون في محاولة توصيل جديدة؟"
      );
    default:
      return (
        bonjour +
        "إليكم آخر أخبار طلبكم.\n\n" +
        recap +
        suivi
      );
  }
}

/**
 * Remplace les champs entre accolades par leurs valeurs. Un champ
 * inconnu est laisse tel quel : mieux vaut le voir dans le message que
 * de l'effacer en silence, l'agent comprend alors qu'il s'est trompe.
 */
export function fillTemplate(template: string, order: MessageOrder): string {
  const filled = template.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const field = PLACEHOLDERS.find((p) => p.key === key);
    return field ? field.value(order) : whole;
  });

  // Un champ vide laissait sa ligne derriere lui : un produit sans photo,
  // ou un colis sans code de suivi, ouvrait un trou au milieu du
  // message. On recoud donc les blancs, sans toucher aux sauts de ligne
  // voulus entre les paragraphes.
  return filled
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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

/**
 * Le modele enregistre pour cette cle, ou celui propose par defaut.
 * La cle est un statut de confirmation, ou un code de livraison prefixe.
 */
export function templateFor(
  key: string,
  saved: Record<string, string> | undefined
): string {
  const own = saved?.[key];
  if (own && own.trim()) return own;
  return key.startsWith(DELIVERY_PREFIX)
    ? defaultDeliveryTemplate(key.slice(DELIVERY_PREFIX.length))
    : defaultTemplate(key);
}
