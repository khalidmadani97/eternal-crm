-- Deploy prep: when auth users are (re)created against an already-imported
-- profiles table (data migration), upsert instead of colliding.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'staff'),
    new.email
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;
