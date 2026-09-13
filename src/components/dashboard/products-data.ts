export type ProductStatus = "Actif" | "Archive";

export type Product = {
  sku: string;
  name: string;
  supplier: string;
  priceVente: number;
  coutFournisseur: number;
  stockTotal: number;
  disponible: number;
  reserve: number;
  enCours: number;
  seuilReappro: number;
  dernierMouvement: string;
  status: ProductStatus;
  /** URL publique de l'image principale, si le produit en a une. */
  image?: string;
};

function margin(price: number, cost: number) {
  // Un produit sans prix de vente connu (cas du stock ForceLog, qui ne
  // communique pas de tarif) n'a pas de marge calculable : renvoyer 0
  // plutot que le NaN d'une division par zero.
  if (!price) return 0;
  return Math.round(((price - cost) / price) * 100);
}

export const products: Product[] = [
  {
    sku: "SCLA-001",
    name: "SAC LO",
    supplier: "—",
    priceVente: 75,
    coutFournisseur: 30,
    stockTotal: 400,
    disponible: 400,
    reserve: 0,
    enCours: 0,
    seuilReappro: 100,
    dernierMouvement: "18 aout, 20:09",
    status: "Actif",
  },
  {
    sku: "DFAZ-001",
    name: "Diffuseur Atlas Zen",
    supplier: "Casa Home Textile",
    priceVente: 259,
    coutFournisseur: 120,
    stockTotal: 1073,
    disponible: 523,
    reserve: 5,
    enCours: 400,
    seuilReappro: 150,
    dernierMouvement: "17 aout, 09:24",
    status: "Actif",
  },
  {
    sku: "SCLM-001",
    name: "Sac Cuir Marrakech",
    supplier: "Marrakech Leather Co.",
    priceVente: 289,
    coutFournisseur: 140,
    stockTotal: 1200,
    disponible: 984,
    reserve: 3,
    enCours: 0,
    seuilReappro: 200,
    dernierMouvement: "16 aout, 14:02",
    status: "Actif",
  },
  {
    sku: "BRAS-001",
    name: "Bracelet Atlas Silver",
    supplier: "Atlas Craft Supply",
    priceVente: 179,
    coutFournisseur: 80,
    stockTotal: 60,
    disponible: 22,
    reserve: 8,
    enCours: 0,
    seuilReappro: 50,
    dernierMouvement: "20 aout, 11:47",
    status: "Actif",
  },
  {
    sku: "SRDG-001",
    name: "Serum Derma Glow",
    supplier: "Sahara Beauty Labs",
    priceVente: 228,
    coutFournisseur: 95,
    stockTotal: 45,
    disponible: 12,
    reserve: 3,
    enCours: 0,
    seuilReappro: 60,
    dernierMouvement: "21 aout, 08:15",
    status: "Actif",
  },
  {
    sku: "PBMA-001",
    name: "Powerbank MagSafe Atlas",
    supplier: "Atlas Tech Import",
    priceVente: 389,
    coutFournisseur: 210,
    stockTotal: 800,
    disponible: 650,
    reserve: 10,
    enCours: 140,
    seuilReappro: 100,
    dernierMouvement: "15 aout, 17:33",
    status: "Actif",
  },
  {
    sku: "KEAR-001",
    name: "Kit Elan Argan",
    supplier: "Sahara Beauty Labs",
    priceVente: 278,
    coutFournisseur: 120,
    stockTotal: 30,
    disponible: 6,
    reserve: 4,
    enCours: 0,
    seuilReappro: 40,
    dernierMouvement: "19 aout, 19:02",
    status: "Actif",
  },
  {
    sku: "MTPX-002",
    name: "Montre Pro X V2",
    supplier: "Atlas Tech Import",
    priceVente: 799,
    coutFournisseur: 420,
    stockTotal: 2400,
    disponible: 2180,
    reserve: 15,
    enCours: 300,
    seuilReappro: 200,
    dernierMouvement: "14 aout, 10:11",
    status: "Actif",
  },
  {
    sku: "ECAN-001",
    name: "Ecouteurs Elite ANC",
    supplier: "Atlas Tech Import",
    priceVente: 249,
    coutFournisseur: 110,
    stockTotal: 1643,
    disponible: 1420,
    reserve: 12,
    enCours: 0,
    seuilReappro: 150,
    dernierMouvement: "18 aout, 07:52",
    status: "Actif",
  },
  {
    sku: "ARCI-001",
    name: "Argan Care Intense",
    supplier: "Sahara Beauty Labs",
    priceVente: 199,
    coutFournisseur: 85,
    stockTotal: 25,
    disponible: 4,
    reserve: 1,
    enCours: 0,
    seuilReappro: 30,
    dernierMouvement: "21 aout, 15:40",
    status: "Actif",
  },
  {
    sku: "ORVN-001",
    name: "Organiseur Voyage Nomad",
    supplier: "Casa Home Textile",
    priceVente: 249,
    coutFournisseur: 115,
    stockTotal: 540,
    disponible: 480,
    reserve: 6,
    enCours: 0,
    seuilReappro: 100,
    dernierMouvement: "13 aout, 12:29",
    status: "Actif",
  },
  {
    sku: "LPCS-001",
    name: "Lampe Casa Smart",
    supplier: "Casa Home Textile",
    priceVente: 329,
    coutFournisseur: 150,
    stockTotal: 720,
    disponible: 690,
    reserve: 2,
    enCours: 0,
    seuilReappro: 120,
    dernierMouvement: "12 aout, 09:05",
    status: "Actif",
  },
  {
    sku: "PDCS-001",
    name: "Poudre Drops Casa Soft",
    supplier: "Sahara Beauty Labs",
    priceVente: 459,
    coutFournisseur: 210,
    stockTotal: 310,
    disponible: 285,
    reserve: 4,
    enCours: 0,
    seuilReappro: 80,
    dernierMouvement: "11 aout, 16:18",
    status: "Actif",
  },
];

export function productMargin(p: Product) {
  return margin(p.priceVente, p.coutFournisseur);
}

export function isLowStock(p: Product) {
  return p.disponible <= p.seuilReappro;
}

export const suppliers = [
  "Casa Home Textile",
  "Sahara Beauty Labs",
  "Atlas Craft Supply",
  "Marrakech Leather Co.",
  "Atlas Tech Import",
];

export const productStatusOptions = ["Actif", "Archive"];
export const productStockOptions = ["En stock", "Stock bas", "Rupture"];

export const adPlatforms = ["Meta Ads", "Google Ads", "TikTok Ads", "Snapchat Ads"];

export const stockMovementTypes = ["Entree", "Sortie", "Ajustement"];

export const mediaLibrary = [
  "diffuseur-atlas-gallery-01",
  "wellness-kit-gallery-02",
  "watch-pro-gallery-03",
  "smart-lamp-case-gallery-04",
  "powerbank-mag-gallery-05",
  "nomad-organizer-gallery-06",
  "earbud-elite-gallery-07",
  "serum-derma-gallery-08",
  "case-soft-gallery-09",
  "bracelet-atlas-gallery-10",
  "bag-marrakech-gallery-11",
  "argan-cream-gallery-12",
];
