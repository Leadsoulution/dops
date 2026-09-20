-- Ce qui a ete confie au transporteur.
--
-- L'inventaire comparait la marchandise a deux endroits : chez nous et
-- chez lui. La question utile est ailleurs : de ce qui lui a ete remis,
-- combien devrait-il encore detenir, et combien en declare-t-il ? Un
-- ecart entre les deux, c'est un retour qui n'est jamais revenu en
-- rayon.
--
-- Quantite cumulee, saisie a la main : le transporteur ne publie pas
-- l'historique de ce qu'il a recu, seulement son stock du moment.
alter table public.products
  add column if not exists stock_sent integer not null default 0;

comment on column public.products.stock_sent is
  'Total confie au transporteur depuis le debut, saisi dans l''inventaire.';

-- `stock_depot` n'est plus lu par l'application. La colonne reste : elle
-- porte des valeurs saisies, et les effacer ne se rattrape pas.
comment on column public.products.stock_depot is
  'Plus utilise depuis l''inventaire par stock confie. Conserve pour ne rien perdre.';
