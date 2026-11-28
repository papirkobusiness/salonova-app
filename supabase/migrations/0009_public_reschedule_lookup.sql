-- Securely locate an existing confirmed booking for the public rescheduling flow.
-- The caller must provide the salon slug, phone, email, and exact old date/time.
create or replace function public.get_public_booking_for_reschedule(
  p_slug text,
  p_phone text,
  p_client_email text,
  p_old_date date,
  p_old_time time
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_salon_id uuid;
  v_booking public.bookings%rowtype;
  v_service_name text;
begin
  select s.id into v_salon_id
  from public.salons s
  where s.slug = p_slug;

  if v_salon_id is null then
    return jsonb_build_object('status', 'not_found');
  end if;

  select b.* into v_booking
  from public.bookings b
  where b.salon_id = v_salon_id
    and regexp_replace(coalesce(b.phone, ''), '[^0-9]', '', 'g')
        = regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g')
    and lower(trim(coalesce(b.client_email, ''))) = lower(trim(coalesce(p_client_email, '')))
    and b.booking_date = p_old_date
    and b.booking_time = p_old_time
    and b.status = 'confirmed'
  order by b.created_at desc
  limit 1;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  if coalesce(v_booking.reschedule_count, 0) >= 1 then
    return jsonb_build_object('status', 'already_changed');
  end if;

  select coalesce(sv.name, v_booking.service)
    into v_service_name
  from public.salon_services sv
  where sv.id = v_booking.service_id
    and sv.salon_id = v_salon_id;

  return jsonb_build_object(
    'status', 'found',
    'service', coalesce(v_service_name, v_booking.service, 'rezerviranu uslugu'),
    'date', v_booking.booking_date,
    'time', v_booking.booking_time,
    'reschedule_count', coalesce(v_booking.reschedule_count, 0)
  );
end;
$$;

revoke all on function public.get_public_booking_for_reschedule(text, text, text, date, time) from public;
grant execute on function public.get_public_booking_for_reschedule(text, text, text, date, time) to anon, authenticated;
