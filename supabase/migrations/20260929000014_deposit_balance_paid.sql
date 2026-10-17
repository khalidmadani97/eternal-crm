alter table public.jobs
  add column deposit_paid boolean not null default false,
  add column balance_paid boolean not null default false;
