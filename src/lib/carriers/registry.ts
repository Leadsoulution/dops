/**
 * Les transporteurs que l'application sait piloter.
 *
 * ForceLog detient la marchandise et la preleve lui-meme a partir du
 * code article ; Speedaf ne fait que transporter ce qu'on lui remet.
 * La difference n'est pas un detail d'integration : elle decide de ce
 * que l'ecran peut promettre — un colis de stock, un inventaire reel —
 * et c'est pour cela qu'elle est declaree ici plutot que devinee.
 */

export type CarrierId = "forcelog" | "speedaf";

export type CarrierInfo = {
  id: CarrierId;
  name: string;
  subtitle: string;
  /** Le transporteur heberge-t-il notre stock et le preleve-t-il ? */
  holdsStock: boolean;
  logo: { letter: string; bg: string; fg: string };
};

export const CARRIERS: CarrierInfo[] = [
  {
    id: "forcelog",
    name: "ForceLog",
    subtitle: "Transporteur ForceLog Maroc",
    holdsStock: true,
    logo: { letter: "FL", bg: "bg-orange-50", fg: "text-orange-600" },
  },
  {
    id: "speedaf",
    name: "Speedaf",
    subtitle: "Speedaf Express Maroc",
    holdsStock: false,
    logo: { letter: "SP", bg: "bg-sky-50", fg: "text-sky-600" },
  },
];

export const CARRIER_PAR_DEFAUT: CarrierId = "forcelog";

export function carrierInfo(id: string | null | undefined): CarrierInfo {
  return (
    CARRIERS.find((c) => c.id === id) ??
    CARRIERS.find((c) => c.id === CARRIER_PAR_DEFAUT)!
  );
}

/**
 * Le transporteur d'une commande.
 *
 * Une commande sans transporteur enregistre est partie chez ForceLog :
 * c'etait le seul avant, et il reste celui par defaut. Lire la colonne
 * vide comme "aucun" ferait disparaitre tout l'historique des
 * comptages.
 */
export function carrierOfLead(carrier: string | null | undefined): CarrierId {
  return carrier === "speedaf" ? "speedaf" : CARRIER_PAR_DEFAUT;
}

/**
 * Le transporteur qui facturera une commande.
 *
 * Ce n'est pas tout a fait celui de `carrierOfLead`. La colonne vide
 * ne dit pas la meme chose avant et apres l'expedition : apres, elle
 * dit ForceLog, qui etait seul et a bien facture ; avant, elle ne dit
 * rien, le transporteur se choisissant a la confirmation. C'est alors
 * le defaut regle qui prendra le colis, et c'est son tarif qu'il faut
 * annoncer — sinon une commande neuve affiche trente-trois dirhams
 * pour une livraison que Speedaf fera a vingt-cinq.
 */
export function carrierFacturant(
  lead: { carrier?: string | null; trackingNumber?: string | null },
  defaut: CarrierId
): CarrierId {
  if (lead.carrier) return carrierOfLead(lead.carrier);
  return lead.trackingNumber ? carrierOfLead(null) : defaut;
}
