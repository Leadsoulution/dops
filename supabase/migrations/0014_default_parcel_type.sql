-- Type d'expedition par defaut d'un produit
--
-- Une commande qui arrive de WooCommerce doit partir chez le
-- transporteur sans qu'on la regarde. Reste a savoir comment : depuis
-- notre depot (colis simple) ou en prelevant dans le depot du
-- transporteur (colis de stock). Cela ne se decide pas commande par
-- commande mais produit par produit, c'est une propriete de la
-- marchandise.
--
-- "stock" suppose un code article chez le transporteur : sans lui, le
-- colis n'a rien a prelever. L'interface refuse la combinaison.

alter table public.products
  add column if not exists default_parcel_type text not null default 'simple'
    check (default_parcel_type in ('simple', 'stock'));

-- Les articles connus du depot transporteur partent naturellement de la.
update public.products
set default_parcel_type = 'stock'
where forcelog_ref is not null and default_parcel_type = 'simple';
