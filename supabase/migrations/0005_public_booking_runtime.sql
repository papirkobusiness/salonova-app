-- Runtime compatibility patch for the existing Salonova database.
-- Safe to re-run: creates salon settings if missing and replaces public booking RPCs.
create table if not exists public.salon_settings (
  salon_id uuid primary key references public.salons(id) on delete cascade,
  business_hours jsonb not null default '{}'::jsonb,
  public_profile jsonb not null default '{}'::jsonb,
  notification_settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.salon_settings enable row level security;
grant select, insert, update, delete on public.salon_settings to authenticated;
drop policy if exists "salon_settings_member_manage" on public.salon_settings;
create policy "salon_settings_member_manage" on public.salon_settings
for all to authenticated using (public.is_salon_member(salon_id))
with check (public.is_salon_member(salon_id));

alter table public.salons add column if not exists owner_id uuid references auth.users(id) on delete set null;
alter table public.salons add column if not exists phone text;
alter table public.salons add column if not exists email text;
alter table public.salons add column if not exists address text;

create or replace function public.get_public_salon(p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id',s.id,'name',s.name,'slug',s.slug,'timezone',coalesce(s.timezone,'Europe/Zagreb'),'phone',s.phone,
    'services',coalesce((select jsonb_agg(jsonb_build_object('id',sv.id,'name',sv.name,'duration_minutes',sv.duration_minutes,'price',sv.price) order by sv.sort_order,sv.name) from public.salon_services sv where sv.salon_id=s.id and sv.is_active),'[]'::jsonb),
    'staff',coalesce((select jsonb_agg(jsonb_build_object('id',st.id,'name',st.name)) from public.salon_staff st where st.salon_id=s.id and st.is_active),'[]'::jsonb),
    'business_hours',coalesce((select ss.business_hours from public.salon_settings ss where ss.salon_id=s.id),'{}'::jsonb)
  ) from public.salons s where s.slug=p_slug limit 1;
$$;

create or replace function public.track_public_visit(p_slug text)
returns void language sql security definer set search_path = '' as $$
  update public.salons set public_views=coalesce(public_views,0)+1 where slug=p_slug;
$$;

create or replace function public.get_public_slots(p_slug text,p_service_id uuid,p_date date)
returns table(slot_time time) language plpgsql stable security definer set search_path = '' as $$
declare v_salon_id uuid; v_duration integer; v_timezone text; v_hours jsonb; v_days text; v_start time; v_end time; v_day integer;
begin
  select s.id,coalesce(s.timezone,'Europe/Zagreb') into v_salon_id,v_timezone from public.salons s where s.slug=p_slug;
  if v_salon_id is null or p_date < (now() at time zone v_timezone)::date or p_date > (now() at time zone v_timezone)::date+60 then return; end if;
  select sv.duration_minutes into v_duration from public.salon_services sv where sv.id=p_service_id and sv.salon_id=v_salon_id and sv.is_active;
  if v_duration is null then return; end if;
  select ss.business_hours->'default' into v_hours from public.salon_settings ss where ss.salon_id=v_salon_id;
  -- Never invent opening hours: no slots until days/start/end are configured.
  if v_hours is null or v_hours='{}'::jsonb or nullif(v_hours->>'start','') is null or nullif(v_hours->>'end','') is null or nullif(v_hours->>'days','') is null then return; end if;
  v_days:=lower(v_hours->>'days'); v_start:=(v_hours->>'start')::time; v_end:=(v_hours->>'end')::time; v_day:=extract(isodow from p_date);
  if v_end<=v_start then return; end if;
  if v_days like '%svaki dan%' or v_days like '%every day%' then null;
  elsif v_days like '%pon%' and v_days like '%pet%' then if v_day>5 then return; end if;
  elsif v_days like '%pon%' and v_days like '%sub%' then if v_day>6 then return; end if;
  elsif v_days like '%pon%' and v_days like '%ned%' then null;
  else
    if (v_day=1 and v_days not like '%pon%') or (v_day=2 and v_days not like '%uto%') or (v_day=3 and v_days not like '%sri%') or (v_day=4 and v_days not like '%čet%' and v_days not like '%cet%') or (v_day=5 and v_days not like '%pet%') or (v_day=6 and v_days not like '%sub%') or (v_day=7 and v_days not like '%ned%') then return; end if;
  end if;
  return query select t::time from generate_series(p_date+v_start,p_date+v_end-make_interval(mins=>v_duration),interval '30 minutes') t
  where (p_date>(now() at time zone v_timezone)::date or t::time>(now() at time zone v_timezone)::time)
  and not exists (
    select 1 from public.bookings b left join public.salon_services oldsv on oldsv.id=b.service_id
    where b.salon_id=v_salon_id and b.booking_date=p_date and b.status<>'cancelled'
    and tsrange((p_date+b.booking_time)::timestamp,(p_date+b.booking_time+make_interval(mins=>coalesce(oldsv.duration_minutes,60)))::timestamp,'[)')
      && tsrange(t::timestamp,(t+make_interval(mins=>v_duration))::timestamp,'[)')
  );
end; $$;

create or replace function public.create_public_booking(
  p_slug text,p_service_id uuid,p_date date,p_time time,p_client_name text,p_phone text,p_staff_id uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_salon_id uuid; v_service_name text; v_duration integer; v_conversation_id uuid; v_booking_id uuid;
begin
  if length(trim(coalesce(p_client_name,'')))<2 then raise exception 'Unesite ime i prezime.'; end if;
  if length(regexp_replace(coalesce(p_phone,''),'[^0-9+]','','g'))<6 then raise exception 'Unesite ispravan broj telefona.'; end if;
  select s.id into v_salon_id from public.salons s where s.slug=p_slug;
  if v_salon_id is null then raise exception 'Salon nije pronađen.'; end if;
  select sv.name,sv.duration_minutes into v_service_name,v_duration from public.salon_services sv where sv.id=p_service_id and sv.salon_id=v_salon_id and sv.is_active;
  if v_service_name is null then raise exception 'Odabrana usluga nije dostupna.'; end if;
  if p_staff_id is not null and not exists(select 1 from public.salon_staff st where st.id=p_staff_id and st.salon_id=v_salon_id and st.is_active) then raise exception 'Odabrani djelatnik nije dostupan.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_salon_id::text||p_date::text,0));
  if not exists(select 1 from public.get_public_slots(p_slug,p_service_id,p_date) x where x.slot_time=p_time) then raise exception 'Taj termin više nije slobodan. Odaberite drugi termin.'; end if;
  insert into public.conversations(salon_id,channel,customer_name,title,phone,status) values(v_salon_id,'web',trim(p_client_name),'Online rezervacija · '||v_service_name,trim(p_phone),'open') returning id into v_conversation_id;
  insert into public.bookings(salon_id,booking_date,booking_time,channel,client_name,conversation_id,phone,service,status,staff_id,stylist,service_id)
  values(v_salon_id,p_date,p_time,'web',trim(p_client_name),v_conversation_id,trim(p_phone),v_service_name,'confirmed',p_staff_id,(select st.name from public.salon_staff st where st.id=p_staff_id),p_service_id) returning id into v_booking_id;
  insert into public.messages(salon_id,conversation_id,role,content) values
    (v_salon_id,v_conversation_id,'user','Želim rezervirati '||v_service_name||' za '||to_char(p_date,'DD.MM.YYYY')||' u '||to_char(p_time,'HH24:MI')||'.'),
    (v_salon_id,v_conversation_id,'assistant','Rezervacija je potvrđena. Veselimo se vašem dolasku!');
  return jsonb_build_object('booking_id',v_booking_id,'conversation_id',v_conversation_id,'service',v_service_name,'date',p_date,'time',p_time,'status','confirmed');
end; $$;

revoke all on function public.get_public_salon(text) from public;
revoke all on function public.track_public_visit(text) from public;
revoke all on function public.get_public_slots(text,uuid,date) from public;
revoke all on function public.create_public_booking(text,uuid,date,time,text,text,uuid) from public;
grant execute on function public.get_public_salon(text) to anon,authenticated;
grant execute on function public.track_public_visit(text) to anon,authenticated;
grant execute on function public.get_public_slots(text,uuid,date) to anon,authenticated;
grant execute on function public.create_public_booking(text,uuid,date,time,text,text,uuid) to anon,authenticated;
