-- Slice 39a — spare stage values so businesses can add board columns
-- without a migration. Labels/visibility/phase live in stage_settings;
-- these are hidden until a user "adds a column". Enum values only in this
-- file (new values cannot be used in the same transaction).
alter type public.job_stage add value if not exists 'custom_1';
alter type public.job_stage add value if not exists 'custom_2';
alter type public.job_stage add value if not exists 'custom_3';
alter type public.job_stage add value if not exists 'custom_4';
alter type public.job_stage add value if not exists 'custom_5';
alter type public.job_stage add value if not exists 'custom_6';
