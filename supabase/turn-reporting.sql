-- Additive private reporting store. No existing table or acceptance record is modified.
begin;
create schema rta_reporting;
revoke all on schema rta_reporting from public,anon,authenticated;
grant usage on schema rta_reporting to service_role;
create table rta_reporting.bindings (
 id text primary key check(id ~ '^[a-z][a-z0-9-]{1,79}$'),
 lane text not null check(lane in ('spock','remocommand')),
 title text not null, packet text not null, milestone_ids text[] not null,
 active boolean not null default true,
 check(array_length(milestone_ids,1) is null or array_length(milestone_ids,1)<=32)
);
create table rta_reporting.writers (id text primary key,lane text not null check(lane in ('spock','remocommand')),last_sequence bigint not null default 0);
create function rta_reporting.freeze_binding() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if row(new.id,new.lane,new.title,new.packet,new.milestone_ids) is distinct from row(old.id,old.lane,old.title,old.packet,old.milestone_ids) then raise exception 'binding identity immutable; use a new binding id'; end if;
 return new;
end $$;
create trigger freeze_binding before update on rta_reporting.bindings for each row execute function rta_reporting.freeze_binding();
revoke all on function rta_reporting.freeze_binding() from public,anon,authenticated;
create table rta_reporting.events (
 cursor bigint generated always as identity primary key,
 writer text not null references rta_reporting.writers(id),
 sequence bigint not null, event_id text not null unique,
 body_hash text not null check(body_hash ~ '^[0-9a-f]{64}$'), binding_id text not null references rta_reporting.bindings(id), binding_snapshot jsonb not null,
 event jsonb not null, received_at timestamptz not null default clock_timestamp(),
 unique(writer,sequence),
 check(event->>'v'='1'),check(event->>'lane' in ('spock','remocommand')),
 check(event->>'kind' in ('turn_start','source_edit','test_start','test_result','turn_end','blocked','interrupted')),
 check(event->>'phase' in ('WORKING','CODING','TESTING','AWAITING REVIEW','BLOCKED','IDLE','INTERRUPTED','REPORT INCOMPLETE')),
 check(not (event ?| array['milestone_state','acceptance','credentials','session_id','argv','cwd','transcript_path']))
);
create index on rta_reporting.events(binding_id,(event->>'turn'),cursor desc);
alter table rta_reporting.bindings enable row level security;
alter table rta_reporting.writers enable row level security;
alter table rta_reporting.events enable row level security;
revoke all on all tables in schema rta_reporting from public,anon,authenticated;
grant select on rta_reporting.bindings to service_role;
grant select,update on rta_reporting.writers to service_role;
grant select,insert on rta_reporting.events to service_role;
grant usage,select on all sequences in schema rta_reporting to service_role;
create function public.rta_record_turn_event(p_writer text,p_lane text,p_event jsonb,p_body_hash text) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,rta_reporting as $$
declare w rta_reporting.writers; b rta_reporting.bindings; old rta_reporting.events; n bigint; seq bigint;
begin
 select * into w from rta_reporting.writers where id=p_writer for update;
 if not found or w.lane<>p_lane or p_event->>'lane'<>p_lane then raise exception 'writer refused'; end if;
 select * into b from rta_reporting.bindings where id=p_event->>'binding_id' and active;
 if not found or b.lane<>p_lane then raise exception 'binding refused'; end if;
 seq=(p_event->>'sequence')::bigint;
 select * into old from rta_reporting.events where event_id=p_event->>'event_id';
 if found then
  if old.writer<>p_writer or old.body_hash<>p_body_hash or old.sequence<>seq then raise exception 'event conflict'; end if;
  return jsonb_build_object('event_id',old.event_id,'cursor',old.cursor,'duplicate',true);
 end if;
 if seq<>w.last_sequence+1 then raise exception 'sequence refused'; end if;
 if jsonb_typeof(p_event->'completed')<>'array' or jsonb_typeof(p_event->'remaining')<>'array' or jsonb_typeof(p_event->'blockers')<>'array' then raise exception 'shape refused'; end if;
 if (p_event->>'observed_at')::timestamptz>clock_timestamp()+interval '60 seconds' then raise exception 'future event'; end if;
 insert into rta_reporting.events(writer,sequence,event_id,body_hash,binding_id,binding_snapshot,event) values(p_writer,seq,p_event->>'event_id',p_body_hash,b.id,jsonb_build_object('title',b.title,'packet',b.packet,'milestone_ids',b.milestone_ids),p_event) returning cursor into n;
 update rta_reporting.writers set last_sequence=seq where id=p_writer;
 return jsonb_build_object('event_id',p_event->>'event_id','cursor',n,'duplicate',false);
end $$;
create function public.rta_read_turn_snapshot() returns setof jsonb language sql security invoker set search_path=pg_catalog,rta_reporting as $$
 select jsonb_build_object('event',s.event,'title',s.binding_snapshot->'title','packet',s.binding_snapshot->'packet','milestone_ids',s.binding_snapshot->'milestone_ids','received_at',to_char(s.received_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'cursor',s.cursor)
 from (select distinct on (binding_id,event->>'turn') binding_id,binding_snapshot,event,received_at,cursor from rta_reporting.events order by binding_id,event->>'turn',cursor desc) s
 join rta_reporting.bindings b on b.id=s.binding_id and b.active
 order by s.cursor desc limit 128;
$$;
revoke all on function public.rta_record_turn_event(text,text,jsonb,text) from public,anon,authenticated;
revoke all on function public.rta_read_turn_snapshot() from public,anon,authenticated;
grant execute on function public.rta_record_turn_event(text,text,jsonb,text),public.rta_read_turn_snapshot() to service_role;
commit;
