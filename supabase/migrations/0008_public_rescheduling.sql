-- One allowed reschedule for public chat bookings.
alter table public.bookings add column if not exists reschedule_count integer not null default 0;

create or replace function public.reschedule_public_booking(
  p_slug text,p_phone text,p_client_email text,p_old_date date,p_old_time time,p_new_date date,p_new_time time
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_salon_id uuid; v_booking public.bookings%rowtype; v_duration integer; v_hours jsonb; v_days text;
  v_start time; v_end time; v_weekday integer; v_tz text; v_day_name text; v_busy boolean;
begin
  select s.id,coalesce(s.timezone,'Europe/Zagreb') into v_salon_id,v_tz from public.salons s where s.slug=p_slug;
  if v_salon_id is null then return jsonb_build_object('status','not_found'); end if;
  select * into v_booking from public.bookings b where b.salon_id=v_salon_id
    and regexp_replace(coalesce(b.phone,''),'[^0-9]','','g')=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g')
    and lower(trim(coalesce(b.client_email,'')))=lower(trim(coalesce(p_client_email,'')))
    and b.booking_date=p_old_date and b.booking_time=p_old_time and b.status='confirmed'
  order by b.created_at desc limit 1 for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if coalesce(v_booking.reschedule_count,0)>=1 then return jsonb_build_object('status','already_changed'); end if;
  select sv.duration_minutes into v_duration from public.salon_services sv where sv.id=v_booking.service_id and sv.salon_id=v_salon_id and sv.is_active;
  if v_duration is null then return jsonb_build_object('status','not_found'); end if;
  if p_new_date < (now() at time zone v_tz)::date or p_new_date > (now() at time zone v_tz)::date+60 then return jsonb_build_object('status','unavailable'); end if;
  if extract(minute from p_new_time) not in (0,30) or extract(second from p_new_time)<>0 then return jsonb_build_object('status','unavailable'); end if;
  select ss.business_hours->'default' into v_hours from public.salon_settings ss where ss.salon_id=v_salon_id;
  v_days:=lower(coalesce(v_hours->>'days','')); v_start:=nullif(v_hours->>'start','')::time; v_end:=nullif(v_hours->>'end','')::time;
  if v_start is null or v_end is null or v_days='' or v_end<=v_start then return jsonb_build_object('status','unavailable'); end if;
  v_weekday:=extract(isodow from p_new_date);
  v_day_name:=case v_weekday when 1 then 'pon' when 2 then 'uto' when 3 then 'sri' when 4 then 'cet' when 5 then 'pet' when 6 then 'sub' else 'ned' end;
  if not (v_days like '%svaki dan%' or v_days like '%every day%' or (v_days like '%pon%' and v_days like '%pet%' and v_weekday<=5) or (v_days like '%pon%' and v_days like '%sub%' and v_weekday<=6) or (v_days like '%pon%' and v_days like '%ned%') or v_days like '%'||v_day_name||'%') then return jsonb_build_object('status','unavailable'); end if;
  if p_new_time<v_start or p_new_time+make_interval(mins=>v_duration)>v_end then return jsonb_build_object('status','unavailable'); end if;
  if p_new_date=(now() at time zone v_tz)::date and p_new_time<=(now() at time zone v_tz)::time then return jsonb_build_object('status','unavailable'); end if;
  perform pg_advisory_xact_lock(hashtextextended(v_salon_id::text||p_new_date::text,0));
  select exists(select 1 from public.bookings b left join public.salon_services sv on sv.id=b.service_id
    where b.salon_id=v_salon_id and b.booking_date=p_new_date and b.status<>'cancelled' and b.id<>v_booking.id
    and tsrange((p_new_date+b.booking_time)::timestamp,(p_new_date+b.booking_time+make_interval(mins=>coalesce(sv.duration_minutes,60)))::timestamp,'[)')
      && tsrange((p_new_date+p_new_time)::timestamp,(p_new_date+p_new_time+make_interval(mins=>v_duration))::timestamp,'[)')) into v_busy;
  if v_busy then return jsonb_build_object('status','unavailable'); end if;
  update public.bookings set booking_date=p_new_date,booking_time=p_new_time,reschedule_count=reschedule_count+1 where id=v_booking.id;
  return jsonb_build_object('status','rescheduled','booking_id',v_booking.id,'date',p_new_date,'time',p_new_time,'reschedule_count',1);
end; $$;
revoke all on function public.reschedule_public_booking(text,text,text,date,time,date,time) from public;
grant execute on function public.reschedule_public_booking(text,text,text,date,time,date,time) to anon,authenticated;
