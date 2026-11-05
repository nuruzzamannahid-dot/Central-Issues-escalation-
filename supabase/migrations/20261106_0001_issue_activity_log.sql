-- =====================================================================
--  Issue activity log — full, append-only history for every issue
--  • public.issue_events stores who did what, when, and the exact
--    before → after values.
--  • A trigger on public.issues captures EVERY insert / update / delete,
--    including OPS remarks written by the Google Sheet (service role).
--  • Existing issues are backfilled from the timestamps already stored
--    on the issue row (flagged is_backfill = true).
--  Additive only: no existing column, policy or trigger is modified.
-- =====================================================================

create table if not exists public.issue_events (
  id           uuid primary key default gen_random_uuid(),
  issue_id     uuid references public.issues(id) on delete set null,
  reference_no text not null,
  event_type   text not null,
  event_label  text not null,
  actor_email  text,
  actor_name   text,
  actor_role   text,
  source       text not null default 'app',
  changes      jsonb not null default '[]'::jsonb,
  meta         jsonb not null default '{}'::jsonb,
  is_backfill  boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists issue_events_issue_created_idx
  on public.issue_events (issue_id, created_at desc);
create index if not exists issue_events_reference_idx
  on public.issue_events (reference_no);
create index if not exists issue_events_type_idx
  on public.issue_events (event_type);

comment on table public.issue_events is
  'Append-only audit trail: one row per change to an issue, with actor, timestamp and before/after values.';

-- ---------------------------------------------------------------------
--  Trigger: log every change
-- ---------------------------------------------------------------------
create or replace function public.log_issue_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old      jsonb;
  v_new      jsonb;
  v_changes  jsonb := '[]'::jsonb;
  v_key      text;
  v_claims   jsonb;
  v_email    text;
  v_name     text;
  v_role     text;
  v_source   text := 'app';
  v_type     text;
  v_label    text;
  v_meta     jsonb := '{}'::jsonb;
  v_issue    uuid;
  v_ref      text;
  v_at       timestamptz := now();
  v_count    integer;
begin
  if TG_OP = 'INSERT' then
    v_old := '{}'::jsonb;
    v_new := to_jsonb(NEW);
    v_issue := NEW.id;
    v_ref := NEW.reference_no;
  elsif TG_OP = 'DELETE' then
    v_old := to_jsonb(OLD);
    v_new := '{}'::jsonb;
    v_issue := OLD.id;
    v_ref := OLD.reference_no;
  else
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_issue := NEW.id;
    v_ref := NEW.reference_no;

    -- Collect every changed column (updated_at is implied by created_at)
    for v_key in select key from jsonb_object_keys(v_new) as key
                 where key <> 'updated_at'
                   and (v_old -> key) is distinct from (v_new -> key)
                 order by key
    loop
      v_changes := v_changes || jsonb_build_array(
        jsonb_build_object('field', v_key, 'old', v_old -> v_key, 'new', v_new -> v_key)
      );
    end loop;

    -- Nothing actually changed → do not pollute the log
    if jsonb_array_length(v_changes) = 0 then
      return NEW;
    end if;
  end if;

  -- Who did it (PostgREST puts the JWT in request.jwt.claims)
  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then
    v_claims := null;
  end;
  v_email := nullif(v_claims ->> 'email', '');

  if v_email is not null then
    select tm.member_name, tm.role into v_name, v_role
    from public.team_members tm
    where lower(tm.email) = lower(v_email)
    limit 1;
  elsif coalesce(v_claims ->> 'role', '') = 'service_role' then
    v_source := 'sheet';
  else
    v_source := 'system';
  end if;

  -- Classify the event (most specific change wins)
  if TG_OP = 'INSERT' then
    v_type := 'created';
    v_label := 'Issue escalated';
    v_meta := jsonb_build_object('snapshot', jsonb_build_object(
      'status', NEW.status, 'priority', NEW.priority, 'zone', NEW.zone, 'hub', NEW.hub,
      'category', NEW.category, 'subcategory', NEW.subcategory, 'parcel_id', NEW.parcel_id));

  elsif TG_OP = 'DELETE' then
    v_type := 'deleted';
    v_label := 'Issue deleted';
    v_meta := jsonb_build_object('snapshot', jsonb_build_object(
      'status', OLD.status, 'priority', OLD.priority, 'hub', OLD.hub, 'kam_id', OLD.kam_id));

  elsif (v_old -> 'ops_remark1') is distinct from (v_new -> 'ops_remark1')
        and nullif(v_new ->> 'ops_remark1', '') is not null then
    v_type := 'ops_remark1';
    v_label := case when nullif(v_old ->> 'ops_remark1', '') is null
                    then 'OPS 1st remarks added' else 'OPS 1st remarks edited' end;
    v_meta := jsonb_build_object('remark', v_new ->> 'ops_remark1');

  elsif (v_old -> 'ops_remark2') is distinct from (v_new -> 'ops_remark2')
        and nullif(v_new ->> 'ops_remark2', '') is not null then
    v_type := 'ops_remark2';
    v_label := case when nullif(v_old ->> 'ops_remark2', '') is null
                    then 'OPS 2nd remarks added' else 'OPS 2nd remarks edited' end;
    v_meta := jsonb_build_object('remark', v_new ->> 'ops_remark2');

  elsif (v_old -> 'cm_action_at') is distinct from (v_new -> 'cm_action_at')
        and v_new ->> 'cm_action' is not null then
    select count(*) + 1 into v_count
    from public.issue_events e
    where e.issue_id = v_issue and e.event_type = 'cm_action'
      and e.meta ->> 'action' = v_new ->> 'cm_action';
    v_type := 'cm_action';
    v_label := 'CM ' || (v_new ->> 'cm_action') ||
               case when v_count > 1 then ' (#' || v_count || ')' else '' end;
    v_meta := jsonb_build_object('action', v_new ->> 'cm_action', 'occurrence', v_count);
    if v_email is null and nullif(v_new ->> 'cm_picked_by', '') is not null then
      v_email := v_new ->> 'cm_picked_by';
    end if;

  elsif (v_old -> 'kam_followup_at') is distinct from (v_new -> 'kam_followup_at')
        and v_new ->> 'kam_followup_at' is not null then
    select count(*) + 1 into v_count
    from public.issue_events e
    where e.issue_id = v_issue and e.event_type = 'kam_followup';
    v_type := 'kam_followup';
    v_label := 'KAM follow-up #' || v_count;
    v_meta := jsonb_build_object('occurrence', v_count);

  elsif (v_old -> 'cm_justification') is distinct from (v_new -> 'cm_justification')
        and nullif(v_new ->> 'cm_justification', '') is not null then
    v_type := 'cm_justification';
    v_label := 'CM justification submitted';
    v_meta := jsonb_build_object('remark', v_new ->> 'cm_justification',
                                 'occurrence', coalesce((v_new ->> 'cm_justification_count')::int, 1));

  elsif (v_old -> 'kam_justification') is distinct from (v_new -> 'kam_justification')
        and nullif(v_new ->> 'kam_justification', '') is not null then
    v_type := 'kam_justification';
    v_label := 'KAM justification submitted';
    v_meta := jsonb_build_object('remark', v_new ->> 'kam_justification',
                                 'occurrence', coalesce((v_new ->> 'kam_justification_count')::int, 1));

  elsif (v_old -> 'kam_blocked') is distinct from (v_new -> 'kam_blocked') then
    v_type := case when (v_new ->> 'kam_blocked')::boolean then 'kam_blocked' else 'kam_unblocked' end;
    v_label := case when (v_new ->> 'kam_blocked')::boolean
                    then 'KAM blocked - justification limit reached' else 'KAM unblocked' end;

  elsif (v_old -> 'cm_blocked') is distinct from (v_new -> 'cm_blocked') then
    v_type := case when (v_new ->> 'cm_blocked')::boolean then 'cm_blocked' else 'cm_unblocked' end;
    v_label := case when (v_new ->> 'cm_blocked')::boolean
                    then 'CM blocked - justification limit reached' else 'CM unblocked' end;

  elsif (v_old -> 'status') is distinct from (v_new -> 'status') then
    v_type := 'status_changed';
    v_label := 'Status: ' || coalesce(v_old ->> 'status', '-') || ' -> ' || coalesce(v_new ->> 'status', '-');

  elsif (v_old -> 'ops_status') is distinct from (v_new -> 'ops_status') then
    v_type := 'ops_status_changed';
    v_label := 'OPS status: ' || coalesce(v_old ->> 'ops_status', '-') || ' -> ' || coalesce(v_new ->> 'ops_status', '-');

  elsif (v_old -> 'resolution_note') is distinct from (v_new -> 'resolution_note') then
    v_type := 'resolution_note';
    v_label := case when nullif(v_new ->> 'resolution_note', '') is null
                    then 'Resolution note cleared' else 'Resolution note updated' end;
    v_meta := jsonb_build_object('remark', v_new ->> 'resolution_note');

  else
    v_type := 'updated';
    v_label := 'Issue details updated';
  end if;

  insert into public.issue_events
    (issue_id, reference_no, event_type, event_label, actor_email, actor_name, actor_role,
     source, changes, meta, is_backfill, created_at)
  values
    -- On DELETE the issue row is already gone: keep the log, drop the FK value.
    (case when TG_OP = 'DELETE' then null else v_issue end,
     v_ref, v_type, v_label, v_email, v_name, v_role,
     v_source, v_changes, v_meta, false, v_at);

  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_issues_log on public.issues;
create trigger trg_issues_log
  after insert or update or delete on public.issues
  for each row execute function public.log_issue_change();

-- ---------------------------------------------------------------------
--  Row level security: everyone who can read issues can read the log.
--  Nobody can write it from the client — only the trigger may.
-- ---------------------------------------------------------------------
alter table public.issue_events enable row level security;

drop policy if exists issue_events_select on public.issue_events;
create policy issue_events_select on public.issue_events
  for select to authenticated using (true);

revoke insert, update, delete on public.issue_events from anon, authenticated;
grant select on public.issue_events to authenticated;

-- ---------------------------------------------------------------------
--  Backfill history for issues that already exist.
--  Only timestamps that were actually recorded are used; anything with
--  no recorded time is marked meta.time_approximate = true.
-- ---------------------------------------------------------------------
insert into public.issue_events
  (issue_id, reference_no, event_type, event_label, actor_email, source, changes, meta, is_backfill, created_at)
select i.id, i.reference_no, 'created', 'Issue escalated', null, 'backfill', '[]'::jsonb,
       jsonb_build_object('reconstructed', true, 'snapshot', jsonb_build_object(
         'status', i.status, 'priority', i.priority, 'zone', i.zone, 'hub', i.hub,
         'category', i.category, 'subcategory', i.subcategory, 'parcel_id', i.parcel_id)),
       true, i.created_at
from public.issues i
where not exists (
  select 1 from public.issue_events e where e.issue_id = i.id and e.event_type = 'created'
);

insert into public.issue_events
  (issue_id, reference_no, event_type, event_label, source, changes, meta, is_backfill, created_at)
select i.id, i.reference_no, 'ops_remark1', 'OPS 1st remarks added', 'backfill', '[]'::jsonb,
       jsonb_build_object('reconstructed', true, 'remark', i.ops_remark1), true, i.ops_remark1_at
from public.issues i
where i.ops_remark1_at is not null and nullif(i.ops_remark1, '') is not null
  and not exists (select 1 from public.issue_events e where e.issue_id = i.id and e.event_type = 'ops_remark1');

insert into public.issue_events
  (issue_id, reference_no, event_type, event_label, source, changes, meta, is_backfill, created_at)
select i.id, i.reference_no, 'ops_remark2', 'OPS 2nd remarks added', 'backfill', '[]'::jsonb,
       jsonb_build_object('reconstructed', true, 'remark', i.ops_remark2), true, i.ops_remark2_at
from public.issues i
where i.ops_remark2_at is not null and nullif(i.ops_remark2, '') is not null
  and not exists (select 1 from public.issue_events e where e.issue_id = i.id and e.event_type = 'ops_remark2');

insert into public.issue_events
  (issue_id, reference_no, event_type, event_label, source, changes, meta, is_backfill, created_at)
select i.id, i.reference_no, 'ops_status_changed', 'OPS status set to ' || i.ops_status, 'backfill', '[]'::jsonb,
       jsonb_build_object('reconstructed', true), true, i.ops_status_at
from public.issues i
where i.ops_status_at is not null and i.ops_status is not null
  and not exists (select 1 from public.issue_events e where e.issue_id = i.id and e.event_type = 'ops_status_changed');

insert into public.issue_events
  (issue_id, reference_no, event_type, event_label, actor_email, source, changes, meta, is_backfill, created_at)
select i.id, i.reference_no, 'cm_action', 'CM ' || i.cm_action, i.cm_picked_by, 'backfill', '[]'::jsonb,
       jsonb_build_object('reconstructed', true, 'action', i.cm_action, 'occurrence', 1), true, i.cm_action_at
from public.issues i
where i.cm_action_at is not null and i.cm_action is not null
  and not exists (select 1 from public.issue_events e where e.issue_id = i.id and e.event_type = 'cm_action');

insert into public.issue_events
  (issue_id, reference_no, event_type, event_label, source, changes, meta, is_backfill, created_at)
select i.id, i.reference_no, 'kam_followup', 'KAM follow-up #1', 'backfill', '[]'::jsonb,
       jsonb_build_object('reconstructed', true, 'occurrence', 1), true, i.kam_followup_at
from public.issues i
where i.kam_followup_at is not null
  and not exists (select 1 from public.issue_events e where e.issue_id = i.id and e.event_type = 'kam_followup');

insert into public.issue_events
  (issue_id, reference_no, event_type, event_label, source, changes, meta, is_backfill, created_at)
select i.id, i.reference_no, 'cm_justification', 'CM justification submitted', 'backfill', '[]'::jsonb,
       jsonb_build_object('reconstructed', true, 'time_approximate', true,
                          'remark', i.cm_justification, 'occurrence', coalesce(i.cm_justification_count, 1)),
       true, coalesce(i.cm_action_at, i.updated_at)
from public.issues i
where nullif(i.cm_justification, '') is not null
  and not exists (select 1 from public.issue_events e where e.issue_id = i.id and e.event_type = 'cm_justification');

insert into public.issue_events
  (issue_id, reference_no, event_type, event_label, source, changes, meta, is_backfill, created_at)
select i.id, i.reference_no, 'kam_justification', 'KAM justification submitted', 'backfill', '[]'::jsonb,
       jsonb_build_object('reconstructed', true, 'time_approximate', true,
                          'remark', i.kam_justification, 'occurrence', coalesce(i.kam_justification_count, 1)),
       true, coalesce(i.kam_followup_at, i.updated_at)
from public.issues i
where nullif(i.kam_justification, '') is not null
  and not exists (select 1 from public.issue_events e where e.issue_id = i.id and e.event_type = 'kam_justification');
