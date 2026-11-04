create extension if not exists pgcrypto;

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text,
  phone text,
  consent boolean not null default false,
  size text,
  qty int,
  cep text,
  city text,
  uf text,
  status text not null default 'started', -- started | phone | quoted | whatsapp
  table_value numeric(10,2),
  full_price numeric(10,2),
  today_price numeric(10,2),
  bf_offer boolean not null default false,
  offer_expires_at timestamptz,
  source jsonb,
  recovery_sent boolean not null default false
);

create index if not exists leads_status_updated_idx on public.leads (status, updated_at);

-- Sem policies: só a service role (servidor) acessa.
alter table public.leads enable row level security;
