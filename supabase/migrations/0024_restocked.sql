-- Un retour est-il revenu en rayon ?
--
-- Le transporteur ne le dit pas. Son interface ne publie qu'un stock du
-- moment : un colis refuse y disparait du suivi sans que rien n'indique
-- si la marchandise a ete remise en stock, gardee de cote, ou perdue.
-- Son champ `waiting_quantity` reste a zero, il ne sert pas a cela.
--
-- La reponse se tient donc ici : chaque retour est pointe a la main
-- quand il a ete reintegre. Le compte qui en decoule se verifie ensuite
-- contre le stock declare par le transporteur — c'est le seul recoupement
-- possible, et il vaut mieux que la confiance.
alter table public.leads
  add column if not exists restocked_at timestamptz;

comment on column public.leads.restocked_at is
  'Date a laquelle la marchandise d''un colis retourne a ete remise en stock.';

-- Les retours se relisent souvent et sont peu nombreux : un index
-- partiel suffit et ne coute presque rien.
create index if not exists leads_restocked_idx
  on public.leads (restocked_at)
  where restocked_at is null;
