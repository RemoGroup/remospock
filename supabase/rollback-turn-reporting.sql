-- Run only after restoring the previous dashboard and disabling only these reporting hooks.
-- Preserve all event data for audit; no DROP/TRUNCATE or authority reset.
begin;
update rta_reporting.bindings set active=false;
revoke execute on function public.rta_record_turn_event(text,text,jsonb,text),public.rta_read_turn_snapshot() from service_role;
commit;
