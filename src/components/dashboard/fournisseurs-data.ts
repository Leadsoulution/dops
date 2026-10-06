export type Supplier = {
  id: string;
  name: string;
  contactName: string;
  phone: string;
  email: string;
  productsCount: number;
  unitsSupplied: number;
  paid: number;
  balanceDue: number;
  dueDate: string;
};

/**
 * Aucun fournisseur.
 *
 * Les sept qui figuraient ici — Atlas Tech Distribution et les
 * autres — etaient des exemples ecrits a la main, jamais enregistres
 * nulle part. Ils ont ete retires sur demande.
 *
 * La liste reste vide tant qu'aucune table ne les porte : ce que l'on
 * ajoute depuis l'ecran vit dans la memoire du navigateur et disparait
 * au rechargement. Le jour ou les fournisseurs doivent durer, il
 * faudra une table, comme pour les charges.
 */
export const suppliers: Supplier[] = [];
