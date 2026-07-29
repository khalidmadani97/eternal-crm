-- Slice 9 — contract immutability and legal status transitions.
-- A signed contract is evidence; nothing about it may ever change. A sent
-- contract's content (what the client sees at the signing link) is frozen;
-- only the signing fields may be written, by the signing edge function.

create or replace function public.contracts_immutable()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'signed' then
    raise exception 'contract % is signed and immutable — corrections are a new contract', old.id;
  end if;

  if old.status = 'sent' then
    if new.body_snapshot    is distinct from old.body_snapshot
       or new.template_version is distinct from old.template_version
       or new.job_id           is distinct from old.job_id
       or new.sign_token       is distinct from old.sign_token
       or new.token_expires_at is distinct from old.token_expires_at then
      raise exception 'sent contract content is frozen — void it and send a new one';
    end if;
  end if;

  if new.status is distinct from old.status then
    if not (
      (old.status = 'draft' and new.status in ('sent', 'void'))
      or (old.status = 'sent' and new.status in ('signed', 'declined', 'void'))
    ) then
      raise exception 'illegal contract status transition % → %', old.status, new.status;
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_contracts_immutable
  before update on public.contracts
  for each row execute function public.contracts_immutable();
