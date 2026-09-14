-- Reglages des integrations
--
-- Les identifiants d'une boutique vivaient dans un fichier serveur : les
-- changer demandait un acces au serveur, donc a moi. Ils passent en base
-- pour que la connexion se fasse depuis l'application.
--
-- RLS active sans policy, comme le reste du schema : le navigateur ne
-- peut rien lire ici. Seules les routes serveur, qui detiennent la cle
-- secrete, y accedent — et elles ne renvoient jamais un secret en clair.

create table if not exists public.integration_settings (
  id text primary key,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.integration_settings enable row level security;
