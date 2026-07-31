-- A stale browser session (auth.uid() pointing at a user recreated with a
-- new id after a local db reset) made every stage change fail on
-- activities_user_id_fkey — blocking board drags entirely. Attribution is
-- nice-to-have; the stage change is the business event. Attribute only when
-- the profile actually exists, else record unattributed.

create or replace function public.log_stage_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into activities (job_id, contact_id, kind, meta, user_id)
  values (
    new.id,
    new.contact_id,
    'stage_change',
    jsonb_build_object('from', old.stage, 'to', new.stage),
    (select id from profiles where id = auth.uid())
  );

  if new.stage = 'won' and new.won_at is null then
    new.won_at := now();
  elsif new.stage = 'lost' and new.lost_at is null then
    new.lost_at := now();
  end if;

  return new;
end;
$$;
