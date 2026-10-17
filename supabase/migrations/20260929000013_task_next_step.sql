alter table public.tasks
  add column is_next_step boolean not null default false;

create index on public.tasks (job_id, is_next_step, completed_at);
