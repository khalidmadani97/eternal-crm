-- Slice 48 — lead qualification grading: close probability (1 low/red …
-- 5 high/bright green — colors the card) and margin potential (1..5 $).
alter table public.jobs
  add column close_grade int check (close_grade between 1 and 5),
  add column margin_grade int check (margin_grade between 1 and 5);
