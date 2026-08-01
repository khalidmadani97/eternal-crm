-- Slice 37 — tasks carry a time budget. Sara time-boxes tightly (server
-- clamps 5..120 minutes); humans can set whatever they need.

alter table public.tasks
  add column estimated_minutes int check (estimated_minutes is null or (estimated_minutes between 5 and 480));
