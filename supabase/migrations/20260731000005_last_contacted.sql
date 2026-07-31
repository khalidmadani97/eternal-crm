-- Slice 24 — last-contacted tracking (DECISIONS 027).
--
-- contacts carry denormalised last-contact fields, maintained two ways:
--   * automatically, by triggers on every OUTBOUND sms / call / DM
--   * manually, via log_contact() for touches made outside the CRM
--     (a call from a personal cell, an email, a Business Suite reply)
-- Only newer touches win — a backdated manual log never overwrites a more
-- recent automatic one.

alter table public.contacts
  add column last_contacted_at  timestamptz,
  add column last_contacted_by  uuid references public.profiles (id) on delete set null,
  add column last_contact_method text,
  add column last_contact_detail text;

create index idx_contacts_last_contacted on public.contacts (last_contacted_at);

create or replace function public.touch_last_contacted(
  p_contact_id uuid,
  p_at         timestamptz,
  p_by         uuid,
  p_method     text,
  p_detail     text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update contacts
  set last_contacted_at   = p_at,
      last_contacted_by   = p_by,
      last_contact_method = p_method,
      last_contact_detail = p_detail
  where id = p_contact_id
    and (last_contacted_at is null or last_contacted_at <= p_at);
end;
$$;

-- Automatic touches from the comms tables (all written by the service role).
create or replace function public.touch_from_message()
returns trigger
language plpgsql
as $$
begin
  if new.direction = 'outbound' then
    perform public.touch_last_contacted(
      new.contact_id, coalesce(new.sent_at, now()), null, 'sms', new.from_number);
  end if;
  return new;
end;
$$;

create trigger trg_messages_touch_contact
  after insert on public.messages
  for each row execute function public.touch_from_message();

create or replace function public.touch_from_call()
returns trigger
language plpgsql
as $$
begin
  if new.direction = 'outbound' then
    perform public.touch_last_contacted(
      new.contact_id, coalesce(new.started_at, now()), null, 'call', new.from_number);
  end if;
  return new;
end;
$$;

create trigger trg_calls_touch_contact
  after insert on public.calls
  for each row execute function public.touch_from_call();

create or replace function public.touch_from_dm()
returns trigger
language plpgsql
as $$
begin
  if new.direction = 'outbound' then
    perform public.touch_last_contacted(
      new.contact_id, now(), null, new.platform::text, null);
  end if;
  return new;
end;
$$;

create trigger trg_dms_touch_contact
  after insert on public.dm_messages
  for each row execute function public.touch_from_dm();

-- Manual log: writes the timeline activity and the last-contact fields in
-- one transaction. p_by lets staff log on behalf of a teammate.
create or replace function public.log_contact(
  p_contact_id uuid,
  p_method     text,
  p_detail     text default null,
  p_at         timestamptz default now(),
  p_by         uuid default null,
  p_note       text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_by uuid := coalesce(p_by, auth.uid());
  v_kind activity_kind;
begin
  if p_method not in ('call', 'sms', 'email', 'messenger', 'instagram', 'in_person', 'other') then
    raise exception 'unknown contact method %', p_method;
  end if;
  v_kind := case p_method
    when 'call' then 'call'::activity_kind
    when 'sms' then 'sms'::activity_kind
    when 'email' then 'email'::activity_kind
    when 'messenger' then 'dm'::activity_kind
    when 'instagram' then 'dm'::activity_kind
    when 'in_person' then 'meeting'::activity_kind
    else 'note'::activity_kind
  end;

  insert into activities (contact_id, kind, body, meta, user_id)
  values (
    p_contact_id,
    v_kind,
    coalesce(p_note, format('Contacted via %s%s', p_method,
      case when p_detail is not null then ' (' || p_detail || ')' else '' end)),
    jsonb_build_object('logged_contact', true, 'method', p_method, 'detail', p_detail),
    (select id from profiles where id = v_by)
  );

  perform public.touch_last_contacted(
    p_contact_id, p_at, (select id from profiles where id = v_by), p_method, p_detail);
end;
$$;

grant execute on function public.log_contact(uuid, text, text, timestamptz, uuid, text) to authenticated;
