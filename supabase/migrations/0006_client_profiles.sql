-- Client profiles: private notes and regular-client flag per salon.
-- Safe to run on the existing Salonova database.
create table if not exists public.client_profiles (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  client_key text not null,
  client_name text not null,
  phone text,
  notes text not null default '',
  is_regular boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_profiles_salon_key_unique unique (salon_id, client_key)
);

create index if not exists client_profiles_salon_idx
  on public.client_profiles(salon_id, updated_at desc);

alter table public.client_profiles enable row level security;
grant select, insert, update, delete on public.client_profiles to authenticated;

drop policy if exists "client_profiles_member_manage" on public.client_profiles;
create policy "client_profiles_member_manage" on public.client_profiles
for all to authenticated
using (
  exists (
    select 1 from public.salon_memberships m
    where m.salon_id = client_profiles.salon_id
      and m.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.salon_memberships m
    where m.salon_id = client_profiles.salon_id
      and m.user_id = (select auth.uid())
  )
);
