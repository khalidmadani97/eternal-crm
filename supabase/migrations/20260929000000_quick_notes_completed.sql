-- Slice 53b — crossed-off notes
-- Completed notes stay visible in the UI (struck through, collapsible)
-- but Sara ignores them so only active directives reach the LLM.
alter table public.quick_notes
  add column completed_at timestamptz;
