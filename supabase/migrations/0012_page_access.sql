-- Acces par section pour chaque compte
--
-- La fiche utilisateur ne portait que trois interrupteurs metier. Il
-- manquait l'essentiel : quelles pages de l'application ce compte a le
-- droit d'ouvrir.
--
-- La colonne liste les cles de section autorisees (voir src/lib/access.ts).
-- Un administrateur n'est pas concerne : il voit tout, sinon il pourrait
-- se retirer le moyen de se redonner un acces.

alter table public.profiles
  add column if not exists page_access text[] not null default '{}';

-- Les comptes existants gardent tout ce qu'ils avaient : personne ne doit
-- perdre un acces sans qu'on l'ait decide.
update public.profiles
set page_access = array[
  'dashboard','leads','confirmation','perf-agents','products',
  'integrations','fournisseurs','villes','finance','utilisateurs','parametres'
]
where page_access = '{}';
