-- Respect the opening hours entered for each salon when exposing public slots.
-- Only free slots are returned; the customer UI renders other times as unavailable.
create or replace function public.get_public_slots(p_slug text, p_service_id uuid, p_date date)
returns table(slot_time time)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_salon_id uuid;
  v_duration integer;
  v_day integer;
  v_timezone text;
  v_hours jsonb;
  v_days text;
  v_start time;
  v_end time;
begin
  select s.id, coalesce(s.timezone, 'Europe/Zagreb')
    into v_salon_id, v_timezone
  from public.salons s where s.slug = p_slug;
  if v_salon_id is null or p_date < (now() at time zone v_timezone)::date
     or p_date > (now() at time zone v_timezone)::date + 60 then
    return;
  end if;

  select sv.duration_minutes into v_duration
  from public.salon_services sv
  where sv.id = p_service_id and sv.salon_id = v_salon_id and sv.is_active = true;
  if v_duration is null then return; end if;

  select ss.business_hours->'default' into v_hours
  from public.salon_settings ss where ss.salon_id = v_salon_id;
  v_days := lower(coalesce(v_hours->>'days', 'ponedjeljak-subota'));
  v_start := coalesce(nullif(v_hours->>'start', '')::time, time '09:00');
  v_end := coalesce(nullif(v_hours->>'end', '')::time, time '17:00');
  v_day := extract(isodow from p_date);

  if v_end <= v_start then return; end if;
  if v_days like '%svaki dan%' or v_days like '%every day%' then
    null;
  elsif v_days like '%pon%' and v_days like '%pet%' then
    if v_day > 5 then return; end if;
  elsif v_days like '%pon%' and v_days like '%sub%' then
    if v_day > 6 then return; end if;
  elsif v_days like '%pon%' and v_days like '%ned%' then
    null;
  else
    if (v_day = 1 and v_days not like '%pon%') or
       (v_day = 2 and v_days not like '%uto%') or
       (v_day = 3 and v_days not like '%sri%') or
       (v_day = 4 and v_days not like '%čet%' and v_days not like '%cet%') or
       (v_day = 5 and v_days not like '%pet%') or
       (v_day = 6 and v_days not like '%sub%') or
       (v_day = 7 and v_days not like '%ned%') then
      return;
    end if;
  end if;

  return query
  select t::time
  from generate_series(p_date + v_start, p_date + v_end - make_interval(mins => v_duration), interval '30 minutes') t
  where (p_date > (now() at time zone v_timezone)::date
         or t::time > (now() at time zone v_timezone)::time)
    and not exists (
      select 1
      from public.bookings b
      left join public.salon_services oldsv on oldsv.id = b.service_id
      where b.salon_id = v_salon_id
        and b.booking_date = p_date
        and b.status <> 'cancelled'
        and tsrange((p_date + b.booking_time)::timestamp,
                    (p_date + b.booking_time + make_interval(mins => coalesce(oldsv.duration_minutes, 60)))::timestamp, '[)')
            && tsrange(t::timestamp, (t + make_interval(mins => v_duration))::timestamp, '[)')
    );
end;
$$;
revoke all on function public.get_public_slots(text, uuid, date) from public;
grant execute on function public.get_public_slots(text, uuid, date) to anon, authenticated;
