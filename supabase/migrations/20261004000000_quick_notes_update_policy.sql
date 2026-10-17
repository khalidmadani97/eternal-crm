-- Allow staff to update quick_notes (needed for marking notes complete/incomplete).
-- The original quick_notes migration only granted select/insert/delete.

grant update on public.quick_notes to authenticated;

create policy "staff update" on public.quick_notes
  for update to authenticated
  using (business_id in (select public.my_business_ids()))
  with check (business_id in (select public.my_business_ids()));
