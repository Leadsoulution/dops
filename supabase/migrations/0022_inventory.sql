-- Inventaire : ce qui a ete achete, et ce qui dort dans notre depot.
--
-- Le catalogue ne connaissait qu'une quantite, celle du depot du
-- transporteur, ecrasee a chaque synchronisation. Impossible d'en
-- deduire ce qui restait : on ignorait la quantite achetee au depart, et
-- ce qui n'avait jamais quitte nos propres etageres.
--
-- Ces deux colonnes sont saisies a la main. Elles ne peuvent pas se
-- deviner : le transporteur ne sait rien de nos achats, et la boutique
-- ne sait rien de nos cartons.
alter table public.products
  add column if not exists stock_initial integer not null default 0,
  add column if not exists stock_depot integer not null default 0;

comment on column public.products.stock_initial is
  'Quantite achetee au depart, saisie dans l''inventaire.';
comment on column public.products.stock_depot is
  'Quantite restant dans notre propre depot, hors transporteur.';
