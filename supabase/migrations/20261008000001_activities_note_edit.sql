-- Allow staff to edit the body of their own note activities.
-- Only the body column may change; kind, job_id, user_id, etc. are immutable.

create or replace function public.activities_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if old.kind <> 'note' then
      raise exception 'only notes can be edited';
    end if;
    -- Prevent rewriting any immutable columns
    if (new.kind, new.job_id, new.user_id, new.contact_id) <>
       (old.kind, old.job_id, old.user_id, old.contact_id) then
      raise exception 'only the note body may be updated';
    end if;
    return new;
  end if;
  -- DELETE path
  if old.kind <> 'note' then
    raise exception 'only notes can be deleted from the timeline';
  end if;
  return old;
end;
$$;

grant update on public.activities to authenticated;

create policy "update own notes" on public.activities
  for update to authenticated
  using  (kind = 'note' and (user_id = auth.uid() or public.is_admin()))
  with check (kind = 'note' and (user_id = auth.uid() or public.is_admin()));
