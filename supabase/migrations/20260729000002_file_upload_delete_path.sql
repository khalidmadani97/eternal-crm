-- Slice 3 — file upload + the real delete path (DECISIONS 018).
--
-- Upload: staff upload directly to the private job-files bucket under
-- jobs/{job_id}/{uuid}-{filename} and read via signed URLs.
--
-- Delete: the delete-file edge function removes the Storage object via the
-- Storage API FIRST, then calls delete_file() with the service role. The RPC
-- authorises the Slice 0 guard through its transaction-local flag and deletes
-- the metadata row. Object-first ordering: a visible dangling row is
-- recoverable; an invisible orphaned object is not.

-- storage.objects policies for the job-files bucket. Staff may upload and
-- read; nobody but the service role touches removal (and the edge function
-- is the only remover).
create policy "staff upload job files" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'job-files');

create policy "staff read job files" on storage.objects
  for select to authenticated
  using (bucket_id = 'job-files');

-- delete_file(): service-role only. Runs after the object is already gone.
create or replace function public.delete_file(p_file_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Transaction-local authorisation the files_delete_guard() trigger checks.
  perform set_config('app.delete_file_authorized', p_file_id::text, true);
  delete from public.files where id = p_file_id;
end;
$$;

revoke execute on function public.delete_file(uuid) from public, anon, authenticated;
grant execute on function public.delete_file(uuid) to service_role;
