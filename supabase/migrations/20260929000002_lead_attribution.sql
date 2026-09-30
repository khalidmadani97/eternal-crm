-- Lead source attribution: Meta Lead Forms + Google Lead Form Extensions.
-- Adds per-lead attribution metadata so every lead knows which ad/campaign
-- generated it, enabling funnel reports by source → campaign → ad.

-- ── 1. Attribution metadata on inbound_leads ──────────────────────────────────
-- provider values: 'meta_lead_form' | 'google_lead_form' | 'google_sheets' | 'manual'
alter table public.inbound_leads
  add column platform_lead_id  text,   -- Meta leadgen_id / Google lead_id
  add column ad_id             text,   -- Meta ad_id / Google creative_id
  add column campaign_id       text,   -- Meta / Google campaign_id
  add column adset_id          text,   -- Meta adgroup_id / Google adgroup_id
  add column form_id           text;   -- Meta form_id

-- Report queries group and filter by these columns:
create index inbound_leads_ad_idx       on public.inbound_leads (business_id, ad_id)       where ad_id is not null;
create index inbound_leads_campaign_idx on public.inbound_leads (business_id, campaign_id) where campaign_id is not null;
create index inbound_leads_provider_idx on public.inbound_leads (business_id, provider);

-- ── 2. Lead-gen integration settings on business_settings ─────────────────────
-- meta_page_id: used to match inbound leadgen webhooks to the right business.
-- meta_page_access_token: page-level token with leads_retrieval permission;
--   distinct from meta_capi_token (system user token for CAPI events).
-- google_lead_webhook_key: shared secret sent in every Google Lead Form POST;
--   each business gets a unique key so the endpoint can route to the right business.
alter table public.business_settings
  add column meta_page_id               text,
  add column meta_page_access_token     text,
  add column google_lead_webhook_key    text;
