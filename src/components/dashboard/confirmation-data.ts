/**
 * Statistiques reelles d'un agent, calculees par le serveur a partir du
 * journal des modifications. Les types vivent ici, hors du module
 * serveur, pour que les composants du navigateur puissent les importer
 * sans entrainer la cle secrete avec eux.
 */
export type AgentAction = {
  reference: string;
  phone: string;
  when: string;
  field: string;
  from: string | null;
  to: string;
};

/**
 * Suite d'une commande confirmee chez le transporteur.
 *
 * Ne portent que sur les commandes que l'agent a lui-meme confirmees :
 * on mesure ce que devient son travail, pas celui de l'equipe entiere.
 */
export type DeliveryStats = {
  /** Commandes confirmees effectivement parties chez le transporteur. */
  shipped: number;
  /** Remises au client. */
  delivered: number;
  /** Retournees, refusees, annulees ou hors zone. */
  returned: number;
  /** Parties, ni livrees ni retournees a ce jour. */
  inTransit: number;
  /** Confirmees mais jamais expediees. */
  notShipped: number;
  /** Livrees rapportees aux expediees. */
  rate: number;
  /**
   * Colis dont le sort est fixe : livres, retournes, refuses, annules.
   * Ceux qui roulent encore n'y sont pas.
   */
  settled: number;
  /**
   * Livrees rapportees aux seuls colis arrives au bout.
   *
   * Le taux ordinaire compte dans son denominateur des colis partis ce
   * matin, qui n'ont pas encore eu l'occasion d'echouer : il s'effondre
   * les jours de forte expedition sans que rien n'aille mal. Celui-ci
   * ne regarde que les colis dont l'histoire est finie.
   */
  rateFinal: number;
};

export type AgentStats = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  avatarColor: string;
  /** Commandes distinctes touchees par l'agent sur la periode. */
  treated: number;
  /** Commandes ou l'agent a pose un statut supposant un client joint. */
  contacted: number;
  /** Commandes que l'agent a lui-meme passees en Confirme ou EXPIDER. */
  confirmed: number;
  /** Commandes touchees par l'agent et encore ouvertes aujourd'hui. */
  pending: number;
  /** Parmi elles, celles qui attendent un rappel a une heure convenue. */
  rappels: number;
  /** Parmi elles, celles ou le client n'a pas decroche. */
  sansReponse: number;
  confirmRate: number;
  /** Delai moyen entre l'arrivee d'une commande et le premier geste. */
  avgFirstTouch: string;
  /** Duree moyenne entre le premier et le dernier geste sur une commande. */
  avgHandling: string;
  /** Non mesure : l'application ne passe pas les appels. */
  avgCallDuration: string;
  actions: number;
  history: AgentAction[];
  delivery: DeliveryStats;
};

/**
 * Ce qu'un produit donne, de la confirmation a la livraison.
 *
 * Deux produits ne se confirment pas au meme rythme et ne se livrent pas
 * aussi bien : un taux global les confond, alors que c'est la comparaison
 * entre eux qui dit lequel vaut la peine d'etre pousse.
 */
export type ProductStats = {
  product: string;
  image?: string;
  treated: number;
  contacted: number;
  confirmed: number;
  confirmRate: number;
  delivery: DeliveryStats;
};

export type TeamStats = {
  agents: AgentStats[];
  /** Du plus traite au moins traite. */
  products: ProductStats[];
  team: {
    treated: number;
    contacted: number;
    confirmed: number;
    confirmRate: number;
    /**
     * Commandes dont le traitement est termine : confirmees, annulees,
     * faux numero, non commandees, expirees, en double, test.
     */
    closed: number;
    /**
     * Confirmees rapportees aux seules commandes tranchees.
     *
     * Le taux ordinaire compte les commandes encore en cours — un
     * rappel prevu demain, un client qui n'a pas decroche ce matin.
     * Elles ne sont pas des echecs, seulement des dossiers ouverts, et
     * les compter comme tels punit les journees ou beaucoup de
     * commandes arrivent.
     */
    confirmRateFinal: number;
    avgHandling: string;
    avgFirstTouch: string;
  };
  delivery: DeliveryStats;
};


export type AgentPerformance = {
  name: string;
  email: string;
  active: boolean;
  avatarColor: string;
  confirmRate: number;
  avgResponseTime: string;
  firstResponseTime: string;
  avgCallDuration: string;
  assigned: number;
  contacted: number;
  confirmed: number;
  pending: number;
};

export const agentPerformance: AgentPerformance[] = [
  {
    name: "Fatima Zahra",
    email: "agent@lead2door.com",
    active: true,
    avatarColor: "bg-emerald-500",
    confirmRate: 83,
    avgResponseTime: "17h 8m",
    firstResponseTime: "53m",
    avgCallDuration: "54s",
    assigned: 8437,
    contacted: 7917,
    confirmed: 6577,
    pending: 174,
  },
  {
    name: "Hamza Berrada",
    email: "agent@lead2door.com",
    active: true,
    avatarColor: "bg-blue-500",
    confirmRate: 77,
    avgResponseTime: "13h 6m",
    firstResponseTime: "21m",
    avgCallDuration: "8m 57s",
    assigned: 5623,
    contacted: 5272,
    confirmed: 4075,
    pending: 581,
  },
  {
    name: "Imane Lahlou",
    email: "agent@lead2door.com",
    active: true,
    avatarColor: "bg-violet-500",
    confirmRate: 74,
    avgResponseTime: "5h 44m",
    firstResponseTime: "26m",
    avgCallDuration: "6m 12s",
    assigned: 5635,
    contacted: 5276,
    confirmed: 3903,
    pending: 91,
  },
  {
    name: "Karim El Mansouri",
    email: "agent@lead2door.com",
    active: true,
    avatarColor: "bg-orange-500",
    confirmRate: 66,
    avgResponseTime: "9h 3m",
    firstResponseTime: "34m",
    avgCallDuration: "5m 30s",
    assigned: 3724,
    contacted: 3503,
    confirmed: 2312,
    pending: 66,
  },
  {
    name: "Nadia El Fassi",
    email: "agent@lead2door.com",
    active: false,
    avatarColor: "bg-pink-500",
    confirmRate: 48,
    avgResponseTime: "8h 44m",
    firstResponseTime: "48m",
    avgCallDuration: "3m 40s",
    assigned: 3512,
    contacted: 3512,
    confirmed: 1671,
    pending: 48,
  },
  {
    name: "Omar Tazi",
    email: "agent@lead2door.com",
    active: true,
    avatarColor: "bg-cyan-500",
    confirmRate: 82,
    avgResponseTime: "7h 1m",
    firstResponseTime: "17m",
    avgCallDuration: "7h 1m",
    assigned: 6140,
    contacted: 6140,
    confirmed: 5035,
    pending: 82,
  },
  {
    name: "Salma Bennani",
    email: "agent@lead2door.com",
    active: true,
    avatarColor: "bg-rose-500",
    confirmRate: 70,
    avgResponseTime: "6h 21m",
    firstResponseTime: "44m",
    avgCallDuration: "4m 12s",
    assigned: 5613,
    contacted: 5275,
    confirmed: 3693,
    pending: 70,
  },
  {
    name: "soufiane imil",
    email: "agent@lead2door.com",
    active: false,
    avatarColor: "bg-gray-400",
    confirmRate: 0,
    avgResponseTime: "—",
    firstResponseTime: "—",
    avgCallDuration: "—",
    assigned: 0,
    contacted: 0,
    confirmed: 0,
    pending: 0,
  },
  {
    name: "Youssef Idrissi",
    email: "agent@lead2door.com",
    active: true,
    avatarColor: "bg-indigo-500",
    confirmRate: 62,
    avgResponseTime: "10h 39m",
    firstResponseTime: "39m",
    avgCallDuration: "5m 20s",
    assigned: 7020,
    contacted: 7020,
    confirmed: 4352,
    pending: 118,
  },
];

export const rebalanceModes = [
  "Par pourcentage",
  "Par produit",
  "Par source",
  "Par region",
  "Manuel",
];

export type ProductCatalogItem = {
  name: string;
  sku: string;
};

export const productCatalog: ProductCatalogItem[] = [
  { name: "Argan Care Intense", sku: "ARGAN CREME-03" },
  { name: "Bracelet Atlas Silver", sku: "BRACELET ATLAS-05" },
  { name: "Diffuseur Atlas Zen", sku: "DIFFUSEUR ATLAS-02" },
  { name: "Ecouteurs Elite ANC", sku: "ECOUTEURS ANC-01" },
  { name: "Kit Elan Argan", sku: "KIT ELAN ARGAN-04" },
  { name: "Lampe Casa Smart", sku: "LAMPE CASA-06" },
  { name: "Montre Pro X V2", sku: "MONTRE PRO X-V2" },
  { name: "Organiseur Voyage Nomad", sku: "ORGANIZER NOMAD-01" },
  { name: "Poudre Drops Casa Soft", sku: "POUDRE DROPS-02" },
  { name: "Powerbank MagSafe Atlas", sku: "POWERBANK ATLAS-03" },
  { name: "SAC LO", sku: "SAC LO-01" },
  { name: "Sac Atlas Marrakech", sku: "SAC MARRAKECH-07" },
  { name: "Serum Derma Glow", sku: "SERUM DERMA-01" },
];

export const sourceKeyOptions = [
  "agent_manual",
  "direct",
  "excel_import",
  "facebook",
  "google",
  "Google Search",
  "Google Sheets",
  "google_sheets",
  "instagram",
  "Instagram Ads",
  "landing_page",
  "Meta Ads",
  "Mobile app",
  "mobile_app",
  "new",
  "shopify",
  "snapchat",
  "Snapchat Ads",
  "tiktok",
];

export const regionOptions = [
  "Agadir",
  "Casablanca",
  "Fes",
  "Guelmim",
  "Hay Al Qods",
  "Hay Salam",
  "Kenitra",
  "Maamora",
  "Maarif",
  "Malabata",
  "Marrakech",
  "Martil",
  "Meknes",
  "Oujda",
  "Rabat",
  "Tanger",
];

export type AssignedRule = {
  id: string;
  label: string;
  sublabel?: string;
  agent: string;
};

export const initialProductRules: AssignedRule[] = [];

// Aucune regle par defaut : elles nommeraient des agents qui
// n'existent pas dans cette equipe.
export const initialSourceRules: AssignedRule[] = [];

export const initialRegionRules: AssignedRule[] = [];
