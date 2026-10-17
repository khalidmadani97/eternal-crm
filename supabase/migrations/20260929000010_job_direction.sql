-- Direction of the job relative to Toronto (for routing / territory planning).
create type public.job_direction as enum ('north', 'south', 'east', 'west');

alter table public.jobs
  add column direction public.job_direction;
