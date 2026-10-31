export type IntegrationCategory = "leads" | "ads" | "shipping";
export type IntegrationStatus = "Active" | "Configuration en attente";
export type IntegrationHealth = "Sain" | "A verifier" | "Aucun run";

export type Integration = {
  id: string;
  name: string;
  subtitle: string;
  category: IntegrationCategory;
  status: IntegrationStatus;
  health: IntegrationHealth;
  lastImport: number;
  lastSync: string | null;
  connectedAt: string | null;
  activeCount?: number;
  needsReconnect?: boolean;
  description?: string;
  logo: { letter?: string; bg: string; fg: string };
};

export const integrations: Integration[] = [
  {
    id: "google-sheets",
    name: "Google Sheets",
    subtitle: "Google Sheets Offline Leads",
    category: "leads",
    status: "Active",
    health: "A verifier",
    lastImport: 1283,
    lastSync: "26 aout 2026, 09:12",
    connectedAt: "2 juil. 2026, 13:31",
    needsReconnect: true,
    logo: { letter: "GS", bg: "bg-emerald-50", fg: "text-emerald-600" },
  },
  {
    id: "woocommerce",
    name: "WooCommerce",
    subtitle: "2 boutiques",
    category: "leads",
    status: "Active",
    health: "Aucun run",
    lastImport: 2417,
    lastSync: "26 aout 2026, 10:05",
    connectedAt: null,
    activeCount: 2,
    logo: { letter: "W", bg: "bg-violet-50", fg: "text-violet-600" },
  },
  {
    id: "youcan",
    name: "YouCan",
    subtitle: "2 boutiques",
    category: "leads",
    status: "Active",
    health: "Sain",
    lastImport: 1558,
    lastSync: "26 aout 2026, 13:20",
    connectedAt: null,
    activeCount: 2,
    logo: { letter: "Y", bg: "bg-amber-50", fg: "text-amber-600" },
  },
  {
    id: "shopify",
    name: "Shopify",
    subtitle: "1 boutique",
    category: "leads",
    status: "Active",
    health: "Sain",
    lastImport: 1450,
    lastSync: "26 aout 2026, 08:40",
    connectedAt: "19 mai 2026, 10:02",
    activeCount: 1,
    logo: { letter: "Sh", bg: "bg-lime-50", fg: "text-lime-600" },
  },
  {
    id: "landing-pages",
    name: "Site web / Formulaire",
    subtitle: "Page HTML ecrite a la main",
    category: "leads",
    status: "Configuration en attente",
    health: "Aucun run",
    lastImport: 0,
    lastSync: null,
    connectedAt: null,
    logo: { letter: "FW", bg: "bg-sky-50", fg: "text-sky-600" },
  },
  {
    id: "google-ads",
    name: "Google Ads",
    subtitle: "Google Ads Demo Maroc",
    category: "ads",
    status: "Active",
    health: "Sain",
    lastImport: 1900,
    lastSync: "26 aout 2026, 12:15",
    connectedAt: "27 juin 2026, 13:31",
    logo: { letter: "G", bg: "bg-red-50", fg: "text-red-600" },
  },
  {
    id: "tiktok-ads",
    name: "TikTok Ads",
    subtitle: "TikTok Ads Demo Maroc",
    category: "ads",
    status: "Active",
    health: "Sain",
    lastImport: 1120,
    lastSync: "26 aout 2026, 12:05",
    connectedAt: "27 juin 2026, 13:31",
    logo: { letter: "T", bg: "bg-gray-100", fg: "text-gray-700" },
  },
  {
    id: "snapchat-ads",
    name: "Snapchat Ads",
    subtitle: "Snapchat Ads Demo Maroc",
    category: "ads",
    status: "Active",
    health: "Sain",
    lastImport: 860,
    lastSync: "26 aout 2026, 11:58",
    connectedAt: "27 juin 2026, 13:31",
    logo: { letter: "Sc", bg: "bg-yellow-50", fg: "text-yellow-600" },
  },
  {
    id: "forcelog",
    name: "ForceLog",
    subtitle: "Transporteur ForceLog Maroc",
    category: "shipping",
    status: "Configuration en attente",
    health: "Aucun run",
    lastImport: 0,
    lastSync: null,
    connectedAt: null,
    description:
      "Creez des colis, suivez les livraisons et recuperez les etiquettes directement depuis Orderly.",
    logo: { letter: "FL", bg: "bg-orange-50", fg: "text-orange-600" },
  },
  {
    id: "speedaf",
    name: "Speedaf",
    subtitle: "Speedaf Express Maroc",
    category: "shipping",
    status: "Configuration en attente",
    health: "Aucun run",
    lastImport: 0,
    lastSync: null,
    connectedAt: null,
    description:
      "Deuxieme transporteur : creation de colis, suivi, etiquette 10x10 et notifications signees. La marchandise part de votre depot, Speedaf n'en detient pas.",
    logo: { letter: "SP", bg: "bg-sky-50", fg: "text-sky-600" },
  },
];

export const alertPlatforms = integrations
  .filter((i) => i.health === "A verifier")
  .map((i) => i.name);
