alter table public.salons add column if not exists public_views integer not null default 0;

create or replace function public.track_public_visit(p_slug text)
returns void language sql security definer set search_path = public, pg_temp as $$
  update public.salons set public_views = public_views + 1 where slug = p_slug;
$$;
revoke all on function public.track_public_visit(text) from public;
grant execute on function public.track_public_visit(text) to anon, authenticated;

-- Public booking API: exposes only salon display data and safe booking operations.
-- All writes are validated in PostgreSQL; no public SELECT access to client data.
create or replace function public.get_public_salon(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', s.id, 'name', s.name, 'slug', s.slug,
    'timezone', s.timezone, 'phone', s.phone,
    'services', coalesce((select jsonb_agg(jsonb_build_object(
      'id', sv.id, 'name', sv.name, 'duration_minutes', sv.duration_minutes, 'price', sv.price
    ) order by sv.sort_order, sv.name) from public.salon_services sv where sv.salon_id=s.id and sv.is_active), '[]'::jsonb),
    'staff', coalesce((select jsonb_agg(jsonb_build_object('id', st.id, 'name', st.name)) from public.salon_staff st where st.salon_id=s.id and st.is_active), '[]'::jsonb)
  )
  from public.salons s where s.slug = p_slug limit 1;
$$;

create or replace function public.get_public_slots(p_slug text, p_service_id uuid, p_date date)
returns table(slot_time time)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_salon_id uuid; v_duration integer; v_day integer;
begin
  select s.id into v_salon_id from public.salons s where s.slug=p_slug;
  if v_salon_id is null or p_date < current_date or p_date > current_date + 60 then return; end if;
  select duration_minutes into v_duration from public.salon_services where id=p_service_id and salon_id=v_salon_id and is_active=true;
  if v_duration is null then return; end if;
  v_day := extract(isodow from p_date);
  if v_day > 6 then return; end if;
  return query
  select t::time from generate_series(p_date + time '09:00', p_date + time '16:30', interval '30 minutes') t
  where (p_date > current_date or t::time > (now() at time zone 'Europe/Zagreb')::time)
    and t + make_interval(mins=>v_duration) <= p_date + time '17:00'
    and not exists (
      select 1 from public.bookings b
      left join public.salon_services oldsv on oldsv.id=b.service_id
      where b.salon_id=v_salon_id and b.booking_date=p_date and b.status <> 'cancelled'
      and tsrange((p_date+b.booking_time)::timestamp,
                  (p_date+b.booking_time+make_interval(mins=>coalesce(oldsv.duration_minutes,60)))::timestamp,'[)')
          && tsrange(t::timestamp,(t+make_interval(mins=>v_duration))::timestamp,'[)')
    );
end;
$$;

create or replace function public.create_public_booking(
  p_slug text, p_service_id uuid, p_date date, p_time time,
  p_client_name text, p_phone text, p_staff_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_salon_id uuid; v_service_name text; v_duration integer; v_conversation_id uuid; v_booking_id uuid;
begin
  if length(trim(coalesce(p_client_name,''))) < 2 then raise exception 'Unesite ime i prezime.'; end if;
  if length(regexp_replace(coalesce(p_phone,''),'[^0-9+]','','g')) < 6 then raise exception 'Unesite ispravan broj telefona.'; end if;
  select s.id into v_salon_id from public.salons s where s.slug=p_slug;
  if v_salon_id is null then raise exception 'Salon nije pronađen.'; end if;
  select name,duration_minutes into v_service_name,v_duration from public.salon_services
    where id=p_service_id and salon_id=v_salon_id and is_active=true;
  if v_service_name is null then raise exception 'Odabrana usluga nije dostupna.'; end if;
  if p_staff_id is not null and not exists(select 1 from public.salon_staff where id=p_staff_id and salon_id=v_salon_id and is_active) then
    raise exception 'Odabrani djelatnik nije dostupan.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_salon_id::text || p_date::text, 0));
  if not exists(select 1 from public.get_public_slots(p_slug,p_service_id,p_date) x where x.slot_time=p_time) then
    raise exception 'Taj termin više nije slobodan. Odaberite drugi termin.';
  end if;
  insert into public.conversations(salon_id,channel,customer_name,title,phone,status)
    values(v_salon_id,'web',trim(p_client_name),'Online rezervacija · '||v_service_name,trim(p_phone),'open') returning id into v_conversation_id;
  insert into public.bookings(salon_id,booking_date,booking_time,channel,client_name,conversation_id,phone,service,status,staff_id,stylist,service_id)
    values(v_salon_id,p_date,p_time,'web',trim(p_client_name),v_conversation_id,trim(p_phone),v_service_name,'confirmed',p_staff_id,
      (select name from public.salon_staff where id=p_staff_id),p_service_id) returning id into v_booking_id;
  insert into public.messages(salon_id,conversation_id,role,content) values
    (v_salon_id,v_conversation_id,'user','Želim rezervirati '||v_service_name||' za '||to_char(p_date,'DD.MM.YYYY')||' u '||to_char(p_time,'HH24:MI')||'.'),
    (v_salon_id,v_conversation_id,'assistant','Rezervacija je potvrđena. Veselimo se vašem dolasku!');
  return jsonb_build_object('booking_id',v_booking_id,'conversation_id',v_conversation_id,'service',v_service_name,'date',p_date,'time',p_time,'status','confirmed');
end;
$$;

revoke all on function public.get_public_salon(text) from public;
revoke all on function public.get_public_slots(text,uuid,date) from public;
revoke all on function public.create_public_booking(text,uuid,date,time,text,text,uuid) from public;
grant execute on function public.get_public_salon(text) to anon, authenticated;
grant execute on function public.get_public_slots(text,uuid,date) to anon, authenticated;
grant execute on function public.create_public_booking(text,uuid,date,time,text,text,uuid) to anon, authenticated;
