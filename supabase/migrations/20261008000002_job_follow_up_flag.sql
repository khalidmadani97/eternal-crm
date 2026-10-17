-- Green "follow up" flag toggleable per lead/job.
alter table public.jobs add column if not exists follow_up boolean not null default false;
