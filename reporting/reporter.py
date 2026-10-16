"""Private local hook adapter. Never uploads prompts, transcripts, paths or tool arguments."""
import argparse, base64, contextlib, ctypes, datetime as dt, hashlib, hmac, json, os, pathlib, re, secrets, sqlite3, subprocess, sys, time, urllib.error, urllib.request

KINDS = {'turn_start','source_edit','test_start','test_result','turn_end','blocked','interrupted'}
PHASES = {'WORKING','CODING','TESTING','AWAITING REVIEW','BLOCKED','IDLE','INTERRUPTED','REPORT INCOMPLETE'}
PRIVATE = re.compile(r'https?://|[A-Z]:[\\/]|\\\\|[\w.+-]+@[\w.-]+\.[a-z]{2,}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}|S-1-5-21-|(?:session|thread|pid|argv)\s*[:=#]|sb_secret_|gh[pousr]_|eyJ[A-Za-z0-9_-]{10,}\.|(?:password|api_key|authorization)\s*[:=]',re.I)
def require(ok, reason):
    if not ok: raise ValueError(reason)
def text(s, limit=600):
    require(isinstance(s,str) and len(s)<=limit and not PRIVATE.search(s) and not re.search(r'[<>\x00-\x1f\u202a-\u202e\u2066-\u2069]',s),'unsafe public text');return s
def loads(raw):
    def pairs(items):
        out={}
        for k,v in items:
            require(k not in out,'duplicate JSON key');out[k]=v
        return out
    return json.loads(raw,object_pairs_hook=pairs)
def canonical(value):return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False)
def now():return dt.datetime.now(dt.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')
def decrypt(path, mode):
    raw=path.read_bytes()
    if mode=='plain-test':
        require(os.environ.get('RTA_TEST_MODE')=='1','test secret disabled');return raw.decode('ascii').strip()
    require(mode=='dpapi' and os.name=='nt','protected Windows credential required')
    class Blob(ctypes.Structure):_fields_=[('size',ctypes.c_ulong),('data',ctypes.POINTER(ctypes.c_byte))]
    buf=ctypes.create_string_buffer(raw);inp=Blob(len(raw),ctypes.cast(buf,ctypes.POINTER(ctypes.c_byte)));out=Blob()
    require(ctypes.windll.crypt32.CryptUnprotectData(ctypes.byref(inp),None,None,None,None,0,ctypes.byref(out)),'credential unavailable')
    try:return ctypes.string_at(out.data,out.size).decode('ascii')
    finally:ctypes.windll.kernel32.LocalFree(out.data)
def config(path):
    c=loads(path.read_bytes());require(c['v']==1 and c['lane'] in ('spock','remocommand'),'config lane')
    require(re.fullmatch(r'[a-z][a-z0-9-]{1,79}',c['writer_id']),'writer id')
    require(c['endpoint']=='https://rrxazizrluzodkmgjbmy.supabase.co/functions/v1/rta-turn-reporting' or (os.environ.get('RTA_TEST_MODE')=='1' and re.fullmatch(r'http://127\.0\.0\.1:\d+/report',c['endpoint'])),'endpoint refused')
    secret=decrypt(pathlib.Path(c['credential_file']),c['credential_format']);require(len(secret)>=32,'credential length')
    return c,secret
def connection(c):
    p=pathlib.Path(c['state_directory']);p.mkdir(parents=True,exist_ok=True)
    db=sqlite3.connect(p/'queue.sqlite3',timeout=3);db.execute('pragma journal_mode=WAL');db.execute('pragma synchronous=FULL')
    db.executescript('create table if not exists state(k text primary key,v text not null);create table if not exists outbox(sequence integer primary key,body text not null,ack integer);')
    return db
def get(db,key,default=None):
    row=db.execute('select v from state where k=?',(key,)).fetchone();return loads(row[0]) if row else default
def put(db,key,value):db.execute('insert into state values(?,?) on conflict(k) do update set v=excluded.v',(key,canonical(value)))
def git(root,*args):return subprocess.check_output(['git','-C',str(root),*args],stderr=subprocess.DEVNULL,timeout=3).decode('utf-8','strict').strip()
def binding_for(c,cwd):
    cwd=pathlib.Path(cwd).resolve();matches=[]
    for b in c['bindings']:
        root=pathlib.Path(b.get('context_root',b['root'])).resolve()
        if cwd==root or root in cwd.parents:matches.append((len(root.parts),b))
    if not matches:return None
    longest=max(n for n,b in matches);matches=[b for n,b in matches if n==longest];require(len(matches)==1,'ambiguous packet binding')
    b=matches[0];require(b['lane']==c['lane'],'binding lane');require(git(b['root'],'rev-parse','--show-toplevel').lower()==str(pathlib.Path(b['root']).resolve()).replace('\\','/').lower(),'repository root mismatch')
    if b.get('remote_suffix'):require(git(b['root'],'remote','get-url','origin').replace('\\','/').removesuffix('.git').lower().endswith(b['remote_suffix'].lower()),'repository identity mismatch')
    return b
def snapshot(b):
    # Explicit admitted source paths only; no transcript, secret or arbitrary tree scan.
    root=pathlib.Path(b['root']).resolve();out={}
    require(len(b['source_paths'])<=500,'source ceiling')
    total=0
    for name in b['source_paths']:
        require(not pathlib.PurePath(name).is_absolute() and '..' not in pathlib.PurePath(name).parts,'source path escape')
        require(not re.search(r'(^|[/\\])(?:\.git|\.codex|private|secrets?|credentials?|node_modules)([/\\]|$)|(^|[/\\])\.env',name,re.I),'private source path')
        p=(root/name).resolve();require(root in p.parents,'source path outside root')
        if p.exists():
            require(p.is_file() and p.stat().st_size<=4_000_000,'source size');total+=p.stat().st_size;require(total<=16_000_000,'snapshot byte ceiling');out[name]=hashlib.sha256(p.read_bytes()).hexdigest()
        else:out[name]=None
    return out
def test_command(payload):
    name=str(payload.get('tool_name',''));inp=payload.get('tool_input',{});cmd=inp.get('cmd',inp.get('command','')) if isinstance(inp,dict) else ''
    if not (name=='Bash' or name.endswith('exec_command')) or not isinstance(cmd,str):return False
    # No shell expansion, pipelines, chaining, multiline or arbitrary scripts are interpreted.
    if re.search(r'[\r\n;&|`$<>]',cmd):return False
    return bool(re.fullmatch(r'\s*(?:node\s+--test|python(?:\.exe)?\s+-m\s+(?:pytest|unittest)|(?:npm|pnpm)\s+(?:run\s+)?test)(?:\s+[A-Za-z0-9_./\\*=-]+)*\s*',cmd))
def test_launch(command, challenge):
    # Known runner, same native tool sandbox. No credential, queue or network access.
    script="& "+" ".join("'"+str(x).replace("'","''")+"'" for x in [sys.executable,pathlib.Path(__file__).resolve(),'test','--challenge',challenge,'--command',command])+"; exit $LASTEXITCODE"
    return 'powershell.exe -NoLogo -NoProfile -NonInteractive -EncodedCommand '+base64.b64encode(script.encode('utf-16le')).decode('ascii')
def run_test(command, challenge):
    import tempfile, shutil
    require(re.fullmatch(r'[0-9a-f]{64}',challenge or ''),'test challenge')
    require(test_command({'tool_name':'Bash','tool_input':{'command':command}}),'test command refused')
    argv=command.split();program=shutil.which(argv[0]);code=None;output='Test could not be started.'
    if program:
        # Capture the child separately: its stdout cannot forge the outer JSON envelope.
        with tempfile.TemporaryFile() as capture:
            try:
                args=[program,*argv[1:]]
                if os.name=='nt' and pathlib.Path(program).suffix.lower() in ('.cmd','.bat'):
                    args=[os.path.join(os.environ['SystemRoot'],'System32','cmd.exe'),'/d','/s','/c',subprocess.list2cmdline(args)]
                child=subprocess.run(args,stdin=subprocess.DEVNULL,stdout=capture,stderr=subprocess.STDOUT)
                code=child.returncode;capture.seek(0);output=capture.read(4096).decode('utf-8','replace')
            except (OSError,subprocess.SubprocessError):pass
    print(json.dumps({'rta_test_result':1,'challenge':challenge,'exit_code':code,'output':output},ensure_ascii=True),flush=True)
    return code if code is not None else 1
def test_result(response, challenge):
    # Codex 0.159.3/0.160.0 hooks expose raw output, not executor status.
    # Only our matched runner's complete envelope establishes a child exit code.
    if not isinstance(response,str) or len(response)>65536:return None
    try:
        value=loads(response)
        if not isinstance(value,dict) or set(value)!={'rta_test_result','challenge','exit_code','output'}:return None
        if type(value['rta_test_result']) is not int or value['rta_test_result']!=1 or value['challenge']!=challenge or not isinstance(value['output'],str):return None
        code=value['exit_code']
        return code if type(code) is int and -(2**31)<=code<2**32 else None
    except (ValueError,TypeError):return None
def checked_summary(value):
    require(isinstance(value,dict) and set(value)=={'completed','remaining','blockers','next_action'},'summary fields')
    for k in ['completed','remaining','blockers']:
        require(isinstance(value[k],list) and len(value[k])<=12,'summary list')
        for line in value[k]:require(bool(text(line).strip()),'empty summary line')
    require(bool(text(value['next_action']).strip()) and any(value[k] for k in ['completed','remaining','blockers']),'empty summary')
    return value
def message_summary(message):
    # Consume only the explicitly public closeout. Never persist or fetch a transcript.
    if not isinstance(message,str) or len(message)>262144 or message.count('```rta-report')!=1:return None
    match=re.search(r'(?:^|\n)```rta-report\n([\s\S]{1,16384})\n```[ \t\r\n]*\Z',message.replace('\r\n','\n'))
    if not match:return None
    try:return checked_summary(loads(match[1]))
    except (ValueError,TypeError):return None
def public_event(c,b,t,kind,phase,summary=None):
    summary=summary or {};require(kind in KINDS and phase in PHASES,'phase')
    def lines(key):
        a=summary.get(key,[]);require(isinstance(a,list) and len(a)<=12,'summary list');return [text(x) for x in a]
    return {'v':1,'lane':c['lane'],'binding_id':b['id'],'event_id':secrets.token_hex(32),'turn':t['public_turn'],'sequence':0,'observed_at':now(),'kind':kind,'phase':phase,'changed_files':len(t['changed']),'checks_passed':t['passed'],'checks_failed':t['failed'],'completed':lines('completed'),'remaining':lines('remaining'),'blockers':lines('blockers'),'next_action':text(summary.get('next_action',b['next_action'])),'summary_complete':bool(summary)}
def enqueue(db,e):
    seq=get(db,'sequence',0)+1;e['sequence']=seq;put(db,'sequence',seq);db.execute('insert into outbox(sequence,body) values(?,?)',(seq,canonical(e)));return e
def flush(c,secret,db,budget=1.8):
    deadline=time.monotonic()+budget
    while time.monotonic()<deadline:
        row=db.execute('select sequence,body from outbox where ack is null order by sequence limit 1').fetchone()
        if not row:return True
        seq,body=row;raw=body.encode('utf-8');signature=hmac.new(secret.encode('ascii'),raw,hashlib.sha256).hexdigest()
        req=urllib.request.Request(c['endpoint'],data=raw,method='POST',headers={'Content-Type':'application/json','X-Rta-Writer':c['writer_id'],'X-Rta-Signature':signature})
        try:
            with urllib.request.urlopen(req,timeout=max(.2,min(1.5,deadline-time.monotonic()))) as response:ack=loads(response.read(4096))
            require(ack.get('event_id')==loads(body)['event_id'] and isinstance(ack.get('cursor'),int) and ack['cursor']>0,'delivery receipt')
            db.execute('update outbox set ack=? where sequence=?',(ack['cursor'],seq));db.commit()
        except Exception:return False
    return not db.execute('select 1 from outbox where ack is null limit 1').fetchone()
def ensure_worker(c,config_path,db):
    with db:
        db.execute('begin immediate');until=get(db,'worker_until',0)
        if until>time.time():return
        token=secrets.token_hex(16);put(db,'worker_until',time.time()+5);put(db,'worker_token',token)
    kwargs={'stdin':subprocess.DEVNULL,'stdout':subprocess.DEVNULL,'stderr':subprocess.DEVNULL,'close_fds':True}
    if os.name=='nt':kwargs['creationflags']=subprocess.CREATE_NO_WINDOW
    else:kwargs['start_new_session']=True
    subprocess.Popen([sys.executable,str(pathlib.Path(__file__).resolve()),'worker','--config',str(config_path),'--worker-token',token],**kwargs)
def worker(c,secret,db,token):
    deadline=time.monotonic()+1800
    while time.monotonic()<deadline:
        with db:
            db.execute('begin immediate')
            if get(db,'worker_token')!=token:return
            put(db,'worker_until',time.time()+5)
        if (pathlib.Path(c['state_directory'])/'STOP').exists():break
        if flush(c,secret,db):break
        time.sleep(1)
    with db:
        if get(db,'worker_token')==token:put(db,'worker_until',0)
def hook(c,secret,db,payload,config_path):
    require(isinstance(payload,dict),'hook input');name=payload.get('hook_event_name');cwd=payload.get('cwd','');b=binding_for(c,cwd)
    if b is None:return {'systemMessage':'This workspace has no admitted dashboard packet-to-milestone binding. Work reporting is NOT VERIFIED; establish the exact assignment before claiming this turn is covered.'} if name=='UserPromptSubmit' else {}
    # Native runtime identifiers are used only as keyed private digests; never sent or logged.
    native=str(payload.get('session_id',''))+':'+str(payload.get('turn_id',''));require(payload.get('session_id') and payload.get('turn_id'),'hook context missing')
    key=hmac.new(secret.encode(),native.encode(),hashlib.sha256).hexdigest();state_key='turn:'+key;current=snapshot(b)
    with db:
        db.execute('begin immediate');t=get(db,state_key)
        if t is None:
            t={'public_turn':secrets.token_hex(32),'baseline':current,'latest':current,'changed':[],'passed':0,'failed':0,'summary':None,'closed':False}
        if t['closed']:return {}
        lease='lease:'+b['id'];prior=get(db,lease)
        require(not prior or prior['context']==key or prior['until']<time.time(),'competing writer custody')
        put(db,lease,{'context':key,'until':time.time()+3600})
        call_id=hmac.new(secret.encode(),str(payload.get('tool_use_id','')).encode(),hashlib.sha256).hexdigest()
        seen=t.get('seen_post',[])
        if name=='PostToolUse' and payload.get('tool_use_id') and call_id in seen:return {}
        if get(db,state_key) is None:enqueue(db,public_event(c,b,t,'turn_start','WORKING'))
        rewritten=None
        if name=='PreToolUse':
            t['before']=current
            if test_command(payload):
                if call_id not in t.get('pending_tests',{}):enqueue(db,public_event(c,b,t,'test_start','TESTING'))
                if os.name=='nt' and isinstance(payload.get('tool_use_id'),str) and payload['tool_use_id']:
                    pending=t.setdefault('pending_tests',{});require(len(pending)<128,'pending test ceiling')
                    challenge=pending.get(call_id) or secrets.token_hex(32);pending[call_id]=challenge
                    inp=payload['tool_input'];command=inp.get('cmd',inp.get('command'))
                    rewritten={'hookSpecificOutput':{'hookEventName':'PreToolUse','permissionDecision':'allow','updatedInput':{**inp,'command':test_launch(command,challenge)}}}
                    # Native Bash's documented rewrite key is command, including unified exec.
                    rewritten['hookSpecificOutput']['updatedInput'].pop('cmd',None)
                else:t['unverified_tests']=t.get('unverified_tests',0)+1
        elif name=='PostToolUse':
            if payload.get('tool_use_id'):t['seen_post']=(seen+[call_id])[-512:]
            before=t.get('before',t['latest']);delta=[k for k in current if current[k]!=before.get(k)];t['changed']=sorted(set(t['changed'])|set(delta));t['latest']=current
            if delta:enqueue(db,public_event(c,b,t,'source_edit','CODING'))
            challenge=t.setdefault('pending_tests',{}).pop(call_id,None)
            if challenge is not None:
                code=test_result(payload.get('tool_response'),challenge)
                if code is not None:t['passed' if code==0 else 'failed']+=1;enqueue(db,public_event(c,b,t,'test_result','WORKING'))
                else:t['unverified_tests']=t.get('unverified_tests',0)+1
        elif name in ('Stop','Interrupt'):
            summary=t.get('summary');message=payload.get('last_assistant_message')
            attempted=isinstance(message,str) and '```rta-report' in message
            if name=='Stop' and attempted:summary=message_summary(message)
            unknown=t.get('unverified_tests',0)+len(t.get('pending_tests',{}))
            # Reporting never creates continuation turns or blocks product work.
            incomplete=unknown or (not summary and (attempted or t['changed'] or t['passed'] or t['failed']))
            phase='INTERRUPTED' if name=='Interrupt' else ('REPORT INCOMPLETE' if incomplete else ('BLOCKED' if summary and summary['blockers'] else ('AWAITING REVIEW' if summary else 'IDLE')))
            event=public_event(c,b,t,'interrupted' if name=='Interrupt' else 'turn_end',phase,summary)
            if unknown:event['blockers']=(event['blockers']+['A recognized test outcome is NOT VERIFIED.'])[-12:]
            enqueue(db,event);t['closed']=True;put(db,lease,{'context':key,'until':0})
        put(db,state_key,t);put(db,'active:'+str(pathlib.Path(cwd).resolve()),{'state_key':state_key,'binding_id':b['id']})
    delivered=flush(c,secret,db)
    if not delivered:ensure_worker(c,config_path,db)
    if name=='UserPromptSubmit':return {'hookSpecificOutput':{'hookEventName':'UserPromptSubmit','additionalContext':'This packet automatically reports observed work. End the final assistant message with exactly one public closeout block: ```rta-report\n{"completed":["Concrete work prepared."],"remaining":["Independent review."],"blockers":[],"next_action":"Request review."}\n```. Use actual public-safe facts and exactly these four fields. This is engineer-reported activity; milestone acceptance stays separate. Never include paths, native identifiers, URLs, argv or credentials. No summary command, credential access, extra turn or continuation is needed. Test-result counters come only from observed runner exits, never from this summary.'}}
    if rewritten is not None:return rewritten
    return {} if delivered else {'systemMessage':'Dashboard reporting delayed; the sanitized event is durably queued for retry.'}
def summary(c,db,cwd,value):
    checked_summary(value);b=binding_for(c,cwd);require(b is not None,'packet binding required')
    with db:
        db.execute('begin immediate');active=get(db,'active:'+str(pathlib.Path(cwd).resolve()));require(active and active['binding_id']==b['id'],'active coding turn required');t=get(db,active['state_key']);require(t and not t['closed'],'turn closed');t['summary']=value;put(db,active['state_key'],t)
def main():
    a=argparse.ArgumentParser();a.add_argument('mode',choices=['hook','summary','worker','flush','test']);a.add_argument('--config');a.add_argument('--cwd',default=os.getcwd());a.add_argument('--worker-token');a.add_argument('--command');a.add_argument('--challenge');args=a.parse_args()
    if args.mode=='test':
        try:return run_test(args.command,args.challenge)
        except Exception:
            print('{"runner_error":"Test execution NOT VERIFIED."}');return 1
    require(args.config is not None,'configuration required');path=pathlib.Path(args.config).resolve();c,secret=config(path);db=connection(c)
    try:
        if args.mode=='hook':
            raw=sys.stdin.buffer.read(262145);require(len(raw)<=262144,'hook size');result=hook(c,secret,db,loads(raw),path);print(json.dumps(result))
        elif args.mode=='summary':summary(c,db,args.cwd,loads(sys.stdin.buffer.read(16385)));print('{"summary_saved":true}')
        elif args.mode=='worker':worker(c,secret,db,args.worker_token)
        else:print(json.dumps({'delivered':flush(c,secret,db)}))
    except Exception:
        # Do not echo tool input, native IDs, paths or credential-bearing HTTP errors.
        print('{"systemMessage":"Dashboard reporting could not be verified; no acceptance changed."}');return 1
    finally:db.close()
    return 0
if __name__=='__main__':sys.exit(main())
