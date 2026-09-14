-- Abonnements aux notifications push
--
-- Un abonnement est delivre par le navigateur, pas par nous : c'est une
-- adresse chez Google, Apple ou Mozilla, accompagnee de deux clefs qui
-- chiffrent le message. Sans lui, impossible de joindre un telephone
-- dont l'application est fermee.
--
-- Une personne peut en avoir plusieurs, un par appareil et par
-- navigateur. L'endpoint est unique : c'est lui qui designe l'appareil.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

alter table public.push_subscriptions enable row level security;

create index if not exists push_subscriptions_profile_idx
  on public.push_subscriptions (profile_id);
