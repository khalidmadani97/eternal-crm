-- Estimated and final profit on jobs (alongside value_est / value_final).
-- Stored as numeric(12,2) per the money convention.

alter table public.jobs
  add column profit_est   numeric(12,2),
  add column profit_final numeric(12,2);
