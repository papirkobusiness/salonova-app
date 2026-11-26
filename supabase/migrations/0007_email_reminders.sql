-- Salonova: email reminders for online bookings (24 hours before appointment)
-- Apply after migrations 0001-0006. Existing bookings remain unchanged.

alter table public.bookings add column if not exists client_email text;

create table if not exists public.booking_reminders (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  salon_id uuid not null references public.salons(id) on delete cascade,
  recipient_email text not null,
  send_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','sent','cancelled','failed')),
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create index if not exists booking_reminders_due_idx on public.booking_reminders(status,send_at);
alter table public.booking_reminders enable row level security;
revoke all on public.booking_reminders from anon, authenticated;
grant select, insert, update, delete on public.booking_reminders to service_role;

create or replace function public.sync_booking_reminder()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_email text; v_start timestamptz;
begin
  if tg_op = 'DELETE' then
    delete from public.booking_reminders where booking_id = old.id;
    return old;
  end if;
  v_email := nullif(trim(coalesce(new.client_email,'')), '');
  v_start := (new.booking_date + new.booking_time) at time zone 'Europe/Zagreb';
  if new.status = 'cancelled' or v_email is null then
    update public.booking_reminders set status='cancelled' where booking_id=new.id and status<>'sent';
  else
    insert into public.booking_reminders(booking_id,salon_id,recipient_email,send_at,status)
    values(new.id,new.salon_id,v_email,v_start - interval '24 hours','pending')
    on conflict (booking_id) do update set
      salon_id=excluded.salon_id,
      recipient_email=excluded.recipient_email,
      send_at=excluded.send_at,
      status=case when public.booking_reminders.status='sent' then 'sent' else 'pending' end,
      last_error=null;
  end if;
  return new;
end; $$;

drop trigger if exists bookings_sync_reminder on public.bookings;
create trigger bookings_sync_reminder
after insert or update of booking_date,booking_time,status,client_email on public.bookings
for each row execute function public.sync_booking_reminder();

-- Replace the public booking RPC with an email-aware version.
drop function if exists public.create_public_booking(text,uuid,date,time,text,text,uuid);
create or replace function public.create_public_booking(
  p_slug text,p_service_id uuid,p_date date,p_time time,p_client_name text,p_phone text,
  p_staff_id uuid default null,p_client_email text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_salon_id uuid; v_service_name text; v_duration integer; v_conversation_id uuid; v_booking_id uuid;
begin
  if length(trim(coalesce(p_client_name,'')))<2 then raise exception 'Unesite ime i prezime.'; end if;
  if length(regexp_replace(coalesce(p_phone,''),'[^0-9+]','','g'))<6 then raise exception 'Unesite ispravan broj telefona.'; end if;
  if coalesce(p_client_email,'') !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$' then raise exception 'Unesite ispravnu e-mail adresu za podsjetnik.'; end if;
  select s.id into v_salon_id from public.salons s where s.slug=p_slug;
  if v_salon_id is null then raise exception 'Salon nije pronađen.'; end if;
  select sv.name,sv.duration_minutes into v_service_name,v_duration from public.salon_services sv where sv.id=p_service_id and sv.salon_id=v_salon_id and sv.is_active;
  if v_service_name is null then raise exception 'Odabrana usluga nije dostupna.'; end if;
  if p_staff_id is not null and not exists(select 1 from public.salon_staff st where st.id=p_staff_id and st.salon_id=v_salon_id and st.is_active) then raise exception 'Odabrani djelatnik nije dostupan.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_salon_id::text||p_date::text,0));
  if not exists(select 1 from public.get_public_slots(p_slug,p_service_id,p_date) x where x.slot_time=p_time) then raise exception 'Taj termin više nije slobodan. Odaberite drugi termin.'; end if;
  insert into public.conversations(salon_id,channel,customer_name,title,phone,status) values(v_salon_id,'web',trim(p_client_name),'Online rezervacija · '||v_service_name,trim(p_phone),'open') returning id into v_conversation_id;
  insert into public.bookings(salon_id,booking_date,booking_time,channel,client_name,conversation_id,phone,client_email,service,status,staff_id,stylist,service_id)
  values(v_salon_id,p_date,p_time,'web',trim(p_client_name),v_conversation_id,trim(p_phone),lower(trim(p_client_email)),v_service_name,'confirmed',p_staff_id,(select st.name from public.salon_staff st where st.id=p_staff_id),p_service_id) returning id into v_booking_id;
  insert into public.messages(salon_id,conversation_id,role,content) values
    (v_salon_id,v_conversation_id,'user','Želim rezervirati '||v_service_name||' za '||to_char(p_date,'DD.MM.YYYY')||' u '||to_char(p_time,'HH24:MI')||'.'),
    (v_salon_id,v_conversation_id,'assistant','Rezervacija je potvrđena. Veselimo se vašem dolasku!');
  return jsonb_build_object('booking_id',v_booking_id,'conversation_id',v_conversation_id,'service',v_service_name,'date',p_date,'time',p_time,'status','confirmed','reminder','scheduled');
end; $$;
revoke all on function public.create_public_booking(text,uuid,date,time,text,text,uuid,text) from public;
grant execute on function public.create_public_booking(text,uuid,date,time,text,text,uuid,text) to anon,authenticated;
