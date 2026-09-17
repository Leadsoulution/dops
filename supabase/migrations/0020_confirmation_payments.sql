-- Paiement des agents de confirmation
--
-- L'equipe de confirmation est payee a la commande livree : une somme
-- fixe par colis effectivement remis au client. Le suivi se fait donc
-- commande par commande, et c'est sur la commande que la trace du
-- paiement a sa place — une table separee obligerait a une jointure
-- pour repondre a la seule question qui compte : celle-ci est-elle
-- payee ?
--
-- Le montant est copie au moment du paiement, et non relu dans les
-- reglages : changer le tarif ne doit pas reecrire ce qui a deja ete
-- verse.

alter table public.leads
  add column if not exists confirmation_paid_at timestamptz,
  add column if not exists confirmation_paid_amount numeric(10, 2),
  -- Qui a marque le paiement, pour que la ligne ne soit pas anonyme.
  add column if not exists confirmation_paid_by text;

-- Les ecrans de paiement ne regardent que les commandes livrees, et
-- parmi elles celles qui restent dues.
create index if not exists leads_confirmation_paid_idx
  on public.leads (confirmation_paid_at)
  where delivery_status_code = 'DELIVERED';
