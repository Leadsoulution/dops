-- Commandes venues de WooCommerce
--
-- L'identifiant de la commande dans la boutique, garde ici pour ne pas
-- l'importer deux fois. L'unicite n'est pas un confort : sans elle, deux
-- synchronisations successives creeraient deux fois la meme commande, et
-- le client recevrait deux colis.

alter table public.leads
  add column if not exists woo_order_id bigint;

create unique index if not exists leads_woo_order_id_idx
  on public.leads (woo_order_id)
  where woo_order_id is not null;
