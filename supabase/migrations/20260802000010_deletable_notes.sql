-- Slice 49 — notes are deletable; the rest of the timeline stays
-- append-only (stage history feeds reporting; comms rows are legal
-- records; consent rows are CASL evidence).

create or replace function public.activities_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'activities are append-only';
  end if;
  if old.kind <> 'note' then
    raise exception 'only notes can be deleted from the timeline';
  end if;
  return old;
end;
$$;

-- Replace the blanket guard on activities with the note-aware one.
drop trigger if exists trg_activities_append_only on public.activities;
create trigger trg_activities_append_only
  before update or delete on public.activities
  for each row execute function public.activities_guard();

-- Author or business admin may delete a note.
create policy "delete own notes" on public.activities
  for delete to authenticated
  using (kind = 'note' and (user_id = auth.uid() or public.is_admin()));
grant delete on public.activities to authenticated;
