-- Catalogue produits tenu dans l'application
--
-- La table ne portait que ce que le stock ForceLog sait dire : une
-- reference, un nom, des quantites. Tout le reste de la fiche produit
-- (prix, cout, fournisseur, seuil de reapprovisionnement) etait affiche
-- en dur a zero, donc la marge et les alertes de stock ne voulaient rien
-- dire.
--
-- Ces colonnes rendent le catalogue autonome : un produit se cree et se
-- modifie ici, sans dependre du transporteur.
--
-- `source` distingue les deux origines :
--   - "manuel"   : saisi dans l'application, personne d'autre n'y touche
--   - "forcelog" : remonte du stock du transporteur

alter table public.products
  add column if not exists supplier text,
  add column if not exists price_sale numeric(10, 2) not null default 0,
  add column if not exists cost_supplier numeric(10, 2) not null default 0,
  add column if not exists reorder_threshold integer not null default 0,
  add column if not exists status text not null default 'Actif'
    check (status in ('Actif', 'Archive')),
  add column if not exists source text not null default 'manuel'
    check (source in ('manuel', 'forcelog'));

-- Les produits deja en base viennent tous du stock ForceLog.
update public.products set source = 'forcelog' where supplier is null;
update public.products set supplier = 'ForceLog' where supplier is null;
