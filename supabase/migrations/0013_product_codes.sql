-- Correspondance des references entre les trois systemes
--
-- Aucun des trois ne laisse choisir l'identifiant de l'autre : ForceLog
-- genere le sien a la creation de l'article, WooCommerce a son propre
-- SKU. Vouloir le meme code partout est donc sans issue.
--
-- Le catalogue tient la correspondance : une ligne par produit, portant
-- les deux codes exterieurs a cote de sa reference interne.
--
--   ref          : reference interne, deja la, unique dans l'application
--   forcelog_ref : code article chez le transporteur, celui qu'on envoie
--                  dans le champ STOCK d'un colis de stock
--   woo_sku      : SKU de la boutique WooCommerce
--
-- Le code-barres ne pouvait pas jouer ce role : sur le stock reel, trois
-- articles differents partagent "45" et un autre n'en a aucun.

alter table public.products
  add column if not exists forcelog_ref text,
  add column if not exists woo_sku text;

-- Les produits deja importes portent le code ForceLog dans `ref`.
update public.products
set forcelog_ref = ref
where source = 'forcelog' and forcelog_ref is null;

-- Deux produits ne peuvent pas revendiquer le meme SKU boutique : la
-- traduction d'une commande WooCommerce deviendrait ambigue.
create unique index if not exists products_woo_sku_idx
  on public.products (woo_sku)
  where woo_sku is not null;

create unique index if not exists products_forcelog_ref_idx
  on public.products (forcelog_ref)
  where forcelog_ref is not null;
