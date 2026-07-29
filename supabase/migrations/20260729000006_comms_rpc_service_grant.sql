-- Slice 10 — record_call()/record_message() are the service-role-only write
-- path for comms. Slice 0 revoked execute from public/anon/authenticated but
-- service_role's access rode on the public grant, so the webhooks got
-- "permission denied". Same failure class as DECISIONS 020: grant service
-- role explicitly.

grant execute on function public.record_call(text, call_direction, text, text, uuid, uuid, call_outcome, timestamptz, timestamptz, timestamptz, int, text, boolean, text) to service_role;
grant execute on function public.record_message(text, call_direction, text, text, uuid, message_status, uuid, text, text[], timestamptz, timestamptz, text) to service_role;
