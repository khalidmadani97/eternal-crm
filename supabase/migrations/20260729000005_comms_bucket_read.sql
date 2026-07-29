-- Slice 10 — staff read access to the private comms bucket (recording
-- playback and MMS display use short-lived signed URLs). Writes go through
-- the service role in the webhook functions only, which bypasses RLS — no
-- client write policy exists on purpose.

create policy "staff read comms" on storage.objects
  for select to authenticated
  using (bucket_id = 'comms');
