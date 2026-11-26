-- Salonova SaaS core schema. Review before applying to a live project.
create extension if not exists pgcrypto;

create table if not exists public.salons (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text not null unique,
  timezone text not null default 'Europe/Zagreb',
  phone text,
  email text,
  address text,
  created_at timestamptz not null default now()
);

create table if not exists public.salon_memberships (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'staff' check (role in ('owner','admin','staff')),
  created_at timestamptz not null default now(),
  unique (salon_id,user_id)
);

create table if not exists public.salon_services (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  name text not null,
  description text,
  duration_minutes integer not null default 60 check (duration_minutes > 0),
  price numeric(10,2) not null default 0 check (price >= 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.salon_staff (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  email text,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  booking_date date not null,
  booking_time time not null,
  channel text not null default 'manual',
  client_name text not null,
  conversation_id uuid,
  notes text,
  phone text,
  service text,
  status text not null default 'pending' check (status in ('pending','confirmed','completed','cancelled')),
  stylist text,
  service_id uuid references public.salon_services(id) on delete set null,
  staff_id uuid references public.salon_staff(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  channel text not null default 'web' check (channel in ('web','instagram','facebook','whatsapp')),
  customer_name text,
  title text,
  phone text,
  status text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant','staff','system')),
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.salon_settings (
  salon_id uuid primary key references public.salons(id) on delete cascade,
  business_hours jsonb not null default '{}'::jsonb,
  public_profile jsonb not null default '{}'::jsonb,
  notification_settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.saas_subscriptions (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null unique references public.salons(id) on delete cascade,
  provider text not null default 'stripe',
  provider_customer_id text,
  provider_subscription_id text,
  plan_key text not null default 'trial',
  status text not null default 'trialing',
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists salon_memberships_user_idx on public.salon_memberships(user_id);
create index if not exists salon_services_salon_idx on public.salon_services(salon_id,is_active,sort_order);
create index if not exists salon_staff_salon_idx on public.salon_staff(salon_id,is_active);
create index if not exists bookings_salon_date_time_idx on public.bookings(salon_id,booking_date,booking_time);
create index if not exists conversations_salon_updated_idx on public.conversations(salon_id,updated_at desc);
create index if not exists messages_conversation_created_idx on public.messages(conversation_id,created_at);

alter table public.salons enable row level security;
alter table public.salon_memberships enable row level security;
alter table public.salon_services enable row level security;
alter table public.salon_staff enable row level security;
alter table public.bookings enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.salon_settings enable row level security;
alter table public.saas_subscriptions enable row level security;

-- A member can only see their own membership row; this avoids recursive membership policies.
create policy "members read own membership" on public.salon_memberships
for select to authenticated using (user_id = (select auth.uid()));

create policy "salon owner creates salon" on public.salons
for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "salon members read salon" on public.salons
for select to authenticated using (
  owner_id = (select auth.uid()) or exists (
    select 1 from public.salon_memberships m
    where m.salon_id = salons.id and m.user_id = (select auth.uid())
  )
);
create policy "salon owner updates salon" on public.salons
for update to authenticated using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy "owner adds own membership" on public.salon_memberships
for insert to authenticated with check (
  user_id = (select auth.uid()) and exists (
    select 1 from public.salons s where s.id = salon_id and s.owner_id = (select auth.uid())
  )
);

-- Tenant tables: membership is checked against the caller's own membership records.
do $$
declare t text;
begin
  foreach t in array array['salon_services','salon_staff','bookings','conversations','messages','salon_settings','saas_subscriptions']
  loop
    execute format('create policy %I on public.%I for select to authenticated using (exists (select 1 from public.salon_memberships m where m.salon_id = %I.salon_id and m.user_id = (select auth.uid())))', t||'_member_select', t, t);
    execute format('create policy %I on public.%I for insert to authenticated with check (exists (select 1 from public.salon_memberships m where m.salon_id = %I.salon_id and m.user_id = (select auth.uid())))', t||'_member_insert', t, t);
    execute format('create policy %I on public.%I for update to authenticated using (exists (select 1 from public.salon_memberships m where m.salon_id = %I.salon_id and m.user_id = (select auth.uid()))) with check (exists (select 1 from public.salon_memberships m where m.salon_id = %I.salon_id and m.user_id = (select auth.uid())))', t||'_member_update', t, t, t);
    execute format('create policy %I on public.%I for delete to authenticated using (exists (select 1 from public.salon_memberships m where m.salon_id = %I.salon_id and m.user_id = (select auth.uid())))', t||'_member_delete', t, t);
  end loop;
end $$;

grant select, insert, update, delete on public.salons, public.salon_memberships,
 public.salon_services, public.salon_staff, public.bookings, public.conversations,
 public.messages, public.salon_settings, public.saas_subscriptions to authenticated;
