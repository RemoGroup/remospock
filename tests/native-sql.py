import json,subprocess,os,pathlib
DB=os.environ.get('RTA_TEST_DB','rta_qualification_final');NAME='rta-turn-qualification-20261015';passed=[]
def sql(q,ok=True):
 p=subprocess.run(['docker','exec','-i',NAME,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d',DB],input=q,capture_output=True,text=True)
 assert (p.returncode==0)==ok,('unexpected SQL result',p.stderr[:200]);return p.stdout.strip()
def check(name,q,ok=True):sql(q,ok);passed.append(name)
check('anon cannot read work snapshot','set role anon;select * from public.rta_read_turn_snapshot();',False)
check('authenticated cannot bypass edge authentication','set role authenticated;select * from public.rta_read_turn_snapshot();',False)
check('anon cannot write work events',"set role anon;select public.rta_record_turn_event('x','spock','{}','x');",False)
check('private events not exposed to anon','set role anon;select * from rta_reporting.events;',False)
check('service writer cannot change approved mappings',"set role service_role;update rta_reporting.bindings set milestone_ids=array['MB-31'];",False)
check('binding identity immutable even to operational owner',"update rta_reporting.bindings set milestone_ids=array['MB-31'] where id='spock-mb01';",False)
check('service writer cannot rewrite history',"set role service_role;update rta_reporting.events set event_id='changed';",False)
row=json.loads(sql('select jsonb_build_object(\'writer\',writer,\'event\',event,\'body_hash\',body_hash) from rta_reporting.events order by cursor limit 1;'))
quote=lambda s:"'"+s.replace("'","''")+"'"
def call(event,lane='spock',digest=None):return 'set role service_role;select public.rta_record_turn_event('+','.join([quote(row['writer']),quote(lane),quote(json.dumps(event))+'::jsonb',quote(digest or row['body_hash'])])+');'
check('exact duplicate acknowledged once',call(row['event']))
check('duplicate id with changed bytes refused',call(row['event'],digest='0'*64),False)
check('cross-lane event refused',call(row['event'],lane='remocommand'),False)
e={**row['event'],'event_id':'c'*64,'binding_id':'unknown-binding'};check('unknown mapping refused',call(e),False)
e={**row['event'],'event_id':'d'*64,'sequence':999999};check('sequence gap refused',call(e),False)
snapshot=json.loads(sql("set role service_role;select coalesce(jsonb_agg(x),'[]'::jsonb) from public.rta_read_turn_snapshot() x;"));assert all(r['milestone_ids'] in [['MB-01'],['MB-03']] for r in snapshot);passed.append('snapshot retains server-approved exact mapping')
assert sql("select bool_and(relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='rta_reporting' and relkind='r';")=='t';passed.append('RLS enabled on every new reporting table')
assert sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','rta_reporting') and p.proname like '%turn%' and p.prosecdef;")=='0';passed.append('no privileged SECURITY DEFINER reporting function')
print(json.dumps({'native_sql_tests':len(passed),'passed':passed,'database':'ISOLATED LOCAL POSTGRESQL','production_effects':'NONE'}))
