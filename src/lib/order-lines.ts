import { parseStockItems } from "./stock-items";

/**
 * Les articles d'une commande, un par un.
 *
 * Une commande ne portait que deux champs pour les decrire : le nom du
 * produit et le nombre d'articles. Un client qui commande quatre
 * produits differents tenait donc dans "A, B, C, D" et "4", et plus
 * rien ne disait lequel comptait pour combien. A la reouverture, la
 * commande se montrait comme un seul produit en quatre exemplaires,
 * et l'enregistrement suivant ne gardait que le premier nom.
 *
 * Le detail existe pourtant deja : `stock_items` dit "REF:qte,REF:qte"
 * depuis que les colis se prelevent chez le transporteur. C'est lui
 * l'autorite sur les lignes ; le nom sert de secours quand il manque.
 *
 * Module pur : la lecture du catalogue appartient a l'appelant.
 */

export type CatalogueEntry = {
  name: string;
  forcelogRef?: string;
  priceSale?: number;
  image?: string;
};

export type OrderLine = {
  /** Le nom affiche, celui que l'agent a choisi ou que la boutique a vendu. */
  name: string;
  qty: number;
  /** Code article du transporteur, absent d'un produit qui part de notre depot. */
  ref?: string;
  price?: number;
  image?: string;
};

export type LinedOrder = {
  productName?: string;
  itemCount?: number;
  stockItems?: string;
};

/** Les noms d'une commande multi-produits, dans l'ordre ou ils ont ete choisis. */
function splitNames(productName?: string): string[] {
  return (productName ?? "")
    .split(",")
    .map((n) => n.trim())
    .filter((n) => n.length > 0);
}

const sameName = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Les lignes d'une commande, reconstituees.
 *
 * Les references prelevees passent devant : elles portent la quantite
 * exacte de chaque article. Le nom enregistre reste prefere a celui du
 * catalogue — une commande de la boutique garde le libelle vendu, qui
 * n'est pas toujours celui du catalogue interne.
 */
export function orderLines(
  order: LinedOrder,
  catalogue: CatalogueEntry[] = []
): OrderLine[] {
  const noms = splitNames(order.productName);
  const refs = [...parseStockItems(order.stockItems)];

  if (refs.length > 0) {
    const lignes: OrderLine[] = refs.map(([ref, qty], i) => {
      const entree =
        catalogue.find((p) => p.forcelogRef === ref) ??
        (noms[i] ? catalogue.find((p) => sameName(p.name, noms[i])) : undefined);
      return {
        ref,
        qty,
        name: noms[i] ?? entree?.name ?? ref,
        price: entree?.priceSale,
        image: entree?.image,
      };
    });

    // Plus de noms que de references : on garde les noms en trop plutot
    // que de les perdre en silence. Cela ne devrait pas arriver, mais une
    // commande incoherente doit se voir, pas disparaitre.
    for (const nom of noms.slice(refs.length)) {
      const entree = catalogue.find((p) => sameName(p.name, nom));
      lignes.push({
        ref: entree?.forcelogRef,
        qty: 1,
        name: nom,
        price: entree?.priceSale,
        image: entree?.image,
      });
    }
    return lignes;
  }

  return noms.map((name) => {
    const entree = catalogue.find((p) => sameName(p.name, name));
    return {
      name,
      // Un seul produit : le compte d'articles est le sien. Plusieurs :
      // il ne dit pas comment il se repartit, et une unite par ligne est
      // la seule lecture qui ne suppose rien.
      qty: noms.length === 1 ? Math.max(1, order.itemCount ?? 1) : 1,
      ref: entree?.forcelogRef,
      price: entree?.priceSale,
      image: entree?.image,
    };
  });
}

/**
 * Ce qu'on enregistre pour ces lignes.
 *
 * Les trois champs sortent ensemble pour qu'ils ne puissent pas se
 * contredire : le nom liste les articles, le compte les totalise, et les
 * references disent au transporteur quoi prelever.
 *
 * Un colis de stock exige que chaque ligne sache ou se prelever. Une
 * commande mixte part en colis simple — la meme regle qu'a l'import de
 * la boutique, et plus sure qu'un colis a moitie preleve.
 */
export function orderFields(lines: OrderLine[]): {
  productName: string;
  itemCount: number;
  parcelType: "simple" | "stock";
  stockItems: string | null;
} {
  const stock = lines.length > 0 && lines.every((l) => l.ref);
  return {
    productName: lines.map((l) => l.name).join(", "),
    itemCount: lines.reduce((sum, l) => sum + Math.max(1, l.qty), 0),
    parcelType: stock ? "stock" : "simple",
    stockItems: stock ? lines.map((l) => `${l.ref}:${l.qty}`).join(",") : null,
  };
}

/** Deux series de lignes decrivent-elles la meme commande ? */
export function sameLines(a: OrderLine[], b: OrderLine[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (l, i) => l.name === b[i].name && l.qty === b[i].qty && l.ref === b[i].ref
  );
}
