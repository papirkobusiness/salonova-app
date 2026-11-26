-- Salonova conversational setup and public reception data.
-- Keeps salon configuration private to authenticated members; the public RPC
-- returns only the published hours/profile fields, never customer records.
create or replace function public.get_public_salon(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', s.id,
    'name', s.name,
    'slug', s.slug,
    'timezone', s.timezone,
    'phone', s.phone,
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', sv.id, 'name', sv.name,
        'duration_minutes', sv.duration_minutes, 'price', sv.price
      ) order by sv.sort_order, sv.name)
      from public.salon_services sv
      where sv.salon_id=s.id and sv.is_active
    ), '[]'::jsonb),
    'staff', coalesce((
      select jsonb_agg(jsonb_build_object('id', st.id, 'name', st.name))
      from public.salon_staff st
      where st.salon_id=s.id and st.is_active
    ), '[]'::jsonb),
    'business_hours', coalesce((
      select ss.business_hours from public.salon_settings ss where ss.salon_id=s.id
    ), '{}'::jsonb)
  )
  from public.salons s
  where s.slug = p_slug
  limit 1;
$$;
revoke all on function public.get_public_salon(text) from public;
grant execute on function public.get_public_salon(text) to anon, authenticated;
