-- Public cancellation lookup and cancellation for the virtual reception.
-- Caller must provide phone and email; cancellation requires exact booking date/time and confirmation.
create or replace function public.get_public_bookings_for_cancellation(
  p_slug text, p_phone text, p_client_email text, p_date date default null, p_time time default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_salon_id uuid; v_bookings jsonb; v_count integer;
begin
  select s.id into v_salon_id from public.salons s where s.slug=p_slug;
  if v_salon_id is null then return jsonb_build_object('status','not_found'); end if;
  select count(*) into v_count from public.bookings b
  where b.salon_id=v_salon_id
    and regexp_replace(coalesce(b.phone,''),'[^0-9]','','g')=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g')
    and lower(trim(coalesce(b.client_email,'')))=lower(trim(coalesce(p_client_email,'')))
    and b.status='confirmed'
    and b.booking_date >= (now() at time zone coalesce((select s.timezone from public.salons s where s.id=v_salon_id),'Europe/Zagreb'))::date
    and (p_date is null or b.booking_date=p_date)
    and (p_time is null or b.booking_time=p_time);
  select coalesce(jsonb_agg(jsonb_build_object('date',b.booking_date,'time',b.booking_time,'service',coalesce(sv.name,b.service),'client_name',b.client_name) order by b.booking_date,b.booking_time),'[]'::jsonb)
  into v_bookings from public.bookings b left join public.salon_services sv on sv.id=b.service_id
  where b.salon_id=v_salon_id
    and regexp_replace(coalesce(b.phone,''),'[^0-9]','','g')=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g')
    and lower(trim(coalesce(b.client_email,'')))=lower(trim(coalesce(p_client_email,'')))
    and b.status='confirmed'
    and b.booking_date >= (now() at time zone coalesce((select s.timezone from public.salons s where s.id=v_salon_id),'Europe/Zagreb'))::date
    and (p_date is null or b.booking_date=p_date) and (p_time is null or b.booking_time=p_time);
  if v_count=0 then return jsonb_build_object('status','not_found'); end if;
  if v_count>1 then return jsonb_build_object('status','multiple','bookings',v_bookings); end if;
  return jsonb_build_object('status','found','booking',v_bookings->0);
end; $$;

create or replace function public.cancel_public_booking(
  p_slug text,p_phone text,p_client_email text,p_date date,p_time time
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_salon_id uuid; v_booking public.bookings%rowtype;
begin
  select s.id into v_salon_id from public.salons s where s.slug=p_slug;
  if v_salon_id is null then return jsonb_build_object('status','not_found'); end if;
  select b.* into v_booking from public.bookings b
  where b.salon_id=v_salon_id
    and regexp_replace(coalesce(b.phone,''),'[^0-9]','','g')=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g')
    and lower(trim(coalesce(b.client_email,'')))=lower(trim(coalesce(p_client_email,'')))
    and b.booking_date=p_date and b.booking_time=p_time and b.status='confirmed'
  order by b.created_at desc limit 1 for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  update public.bookings set status='cancelled' where id=v_booking.id;
  return jsonb_build_object('status','cancelled','date',v_booking.booking_date,'time',v_booking.booking_time,'service',v_booking.service);
end; $$;
revoke all on function public.get_public_bookings_for_cancellation(text,text,text,date,time) from public;
revoke all on function public.cancel_public_booking(text,text,text,date,time) from public;
grant execute on function public.get_public_bookings_for_cancellation(text,text,text,date,time) to anon,authenticated;
grant execute on function public.cancel_public_booking(text,text,text,date,time) to anon,authenticated;
