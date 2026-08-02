-- Slice 45 — multiple pipelines (DECISIONS 035). Each pipeline owns its own
-- copies of the pipeline-phase stage rows (labels/positions/visibility per
-- pipeline; the enum keys stay shared so triggers and reporting are
-- untouched). Production ("Jobs") remains a single workspace; winning a
-- lead in ANY pipeline hands off to Jobs as before.

create table public.pipelines (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null default public.current_business() references public.businesses (id) on delete cascade,
  name        text not null,
  position    int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index idx_pipelines_business on public.pipelines (business_id);
create trigger trg_pipelines_updated_at before update on public.pipelines
  for each row execute function public.set_updated_at();
create trigger trg_pipelines_fill_business before insert on public.pipelines
  for each row execute function public.fill_business_id();

alter table public.pipelines enable row level security;
create policy "staff select" on public.pipelines for select to authenticated using (true);
create policy "staff insert" on public.pipelines for insert to authenticated with check (true);
create policy "staff update" on public.pipelines for update to authenticated using (true) with check (true);
create policy "staff delete" on public.pipelines for delete to authenticated using (true);
create policy tenant_isolation on public.pipelines as restrictive for all to authenticated
  using (business_id = public.current_business())
  with check (business_id = public.current_business() or business_id is null);
grant select, insert, update, delete on public.pipelines to authenticated;
grant select, insert, update, delete on public.pipelines to service_role;

-- One default pipeline per existing business.
insert into public.pipelines (business_id, name, position)
select id, 'Sales Pipeline', 0 from public.businesses;

-- Stage rows join a pipeline (null = production rows).
alter table public.stage_settings
  add column pipeline_id uuid references public.pipelines (id) on delete cascade;
update public.stage_settings s
set pipeline_id = p.id
from public.pipelines p
where p.business_id = s.business_id and s.phase = 'pipeline';
alter table public.stage_settings drop constraint stage_settings_business_stage_key;
create unique index stage_settings_scope_key on public.stage_settings
  (business_id, stage, coalesce(pipeline_id, '00000000-0000-0000-0000-000000000000'));

-- Leads belong to a pipeline (null = the business's default/first one).
alter table public.jobs
  add column pipeline_id uuid references public.pipelines (id) on delete set null;
create index idx_jobs_pipeline on public.jobs (pipeline_id);

-- Seeding helpers.
create or replace function public.seed_pipeline_stages(v_business uuid, v_pipeline uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into stage_settings (business_id, pipeline_id, stage, label, position, phase, hidden) values
    (v_business, v_pipeline, 'new', 'New', 0, 'pipeline', false),
    (v_business, v_pipeline, 'contacted', 'Contacted', 1, 'pipeline', false),
    (v_business, v_pipeline, 'quoted', 'Quoted', 2, 'pipeline', false),
    (v_business, v_pipeline, 'follow_up', 'Follow up', 3, 'pipeline', false),
    (v_business, v_pipeline, 'lost', 'Lost', 10, 'pipeline', false),
    (v_business, v_pipeline, 'custom_1', 'Custom 1', 20, 'pipeline', true),
    (v_business, v_pipeline, 'custom_2', 'Custom 2', 21, 'pipeline', true),
    (v_business, v_pipeline, 'custom_3', 'Custom 3', 22, 'pipeline', true),
    (v_business, v_pipeline, 'custom_4', 'Custom 4', 23, 'pipeline', true),
    (v_business, v_pipeline, 'custom_5', 'Custom 5', 24, 'pipeline', true),
    (v_business, v_pipeline, 'custom_6', 'Custom 6', 25, 'pipeline', true)
  on conflict do nothing;
end;
$$;

create or replace function public.create_pipeline(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business uuid := public.current_business();
  v_pipeline uuid;
begin
  if v_business is null then raise exception 'no active business'; end if;
  if not public.is_admin() then raise exception 'admins only'; end if;
  if p_name is null or btrim(p_name) = '' then raise exception 'pipeline name required'; end if;
  insert into pipelines (business_id, name, position)
  values (v_business, btrim(p_name),
          coalesce((select max(position) + 1 from pipelines where business_id = v_business), 0))
  returning id into v_pipeline;
  perform public.seed_pipeline_stages(v_business, v_pipeline);
  return v_pipeline;
end;
$$;
grant execute on function public.create_pipeline(text) to authenticated;

-- New businesses get a default pipeline with per-pipeline stage rows.
create or replace function public.seed_business_defaults(v_business uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pipeline uuid;
begin
  insert into business_settings (business_id, name) values (v_business, p_name);
  insert into pipelines (business_id, name, position) values (v_business, 'Sales Pipeline', 0)
  returning id into v_pipeline;
  perform public.seed_pipeline_stages(v_business, v_pipeline);
  insert into stage_settings (business_id, stage, label, position, phase, hidden) values
    (v_business, 'won', 'Won', 4, 'production', false),
    (v_business, 'templated', 'Templated', 5, 'production', false),
    (v_business, 'fabrication', 'Fabrication', 6, 'production', false),
    (v_business, 'scheduled', 'Scheduled', 7, 'production', false),
    (v_business, 'installed', 'Installed', 8, 'production', false),
    (v_business, 'closed', 'Closed', 9, 'production', false);
  insert into option_items (business_id, list_key, value, position) values
    (v_business, 'lead_sources', 'referral', 0), (v_business, 'lead_sources', 'website', 1),
    (v_business, 'lead_sources', 'meta', 2), (v_business, 'lead_sources', 'google', 3),
    (v_business, 'lead_sources', 'repeat client', 4),
    (v_business, 'job_roles', 'Owner', 0), (v_business, 'job_roles', 'Sales', 1),
    (v_business, 'job_roles', 'Production Manager', 2), (v_business, 'job_roles', 'Installer', 3),
    (v_business, 'job_roles', 'Office Admin', 4);
end;
$$;
