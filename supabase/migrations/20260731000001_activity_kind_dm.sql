-- Slice 19 — 'dm' activity kind for Meta Messenger / Instagram messages.
-- Separate migration: ALTER TYPE … ADD VALUE cannot be used by later
-- statements inside the same transaction.

alter type public.activity_kind add value if not exists 'dm';
