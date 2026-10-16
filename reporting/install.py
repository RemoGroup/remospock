"""Owner-granted additive hook installation. No task, service, reboot or process kill."""
import argparse, base64, ctypes, hashlib, json, os, pathlib, shutil, subprocess, sys

EVENTS=['UserPromptSubmit','PreToolUse','PostToolUse','Stop','Interrupt']
def need(x,m):
    if not x:raise ValueError(m)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def encrypt(raw):
    class Blob(ctypes.Structure):_fields_=[('size',ctypes.c_ulong),('data',ctypes.POINTER(ctypes.c_byte))]
    data=ctypes.create_string_buffer(raw);inp=Blob(len(raw),ctypes.cast(data,ctypes.POINTER(ctypes.c_byte)));out=Blob()
    need(ctypes.windll.crypt32.CryptProtectData(ctypes.byref(inp),'RoadToAlpha turn reporter',None,None,None,0,ctypes.byref(out)),'DPAPI unavailable')
    try:return ctypes.string_at(out.data,out.size)
    finally:ctypes.windll.kernel32.LocalFree(out.data)
def groups(python,reporter,config):
    # The hook runner uses the session shell on Windows. A quoted executable
    # alone is an expression in PowerShell. Keep the outer command ASCII and
    # shell-neutral; invoke literal paths inside an explicit native PowerShell.
    def literal(p):return "'"+str(p).replace("'","''")+"'"
    script='& '+literal(python)+' '+literal(reporter)+' hook --config '+literal(config)+'; exit $LASTEXITCODE'
    command='powershell.exe -NoLogo -NoProfile -NonInteractive -EncodedCommand '+base64.b64encode(script.encode('utf-16le')).decode('ascii')
    return {e:[{'hooks':[{'type':'command','command':command,'timeout':3 if e=='Interrupt' else 8,'statusMessage':'Updating live engineering work'}]}] for e in EVENTS}
def merge(existing,addition):
    out=json.loads(json.dumps(existing));hooks=out.setdefault('hooks',{})
    for event,entries in addition.items():
        commands={h['command'] for entry in entries for h in entry['hooks']}
        need(not any(h.get('command') in commands for g in hooks.get(event,[]) for h in g.get('hooks',[])),'reporter already installed')
        hooks.setdefault(event,[]).extend(entries)
    return out
def remove_owned(current,addition):
    out=json.loads(json.dumps(current))
    for event,entries in addition.items():
        current_entries=out.get('hooks',{}).get(event,[])
        for entry in entries:
            need(current_entries.count(entry)==1,'hook drift; refusal to remove changed entries');current_entries.remove(entry)
        if not current_entries:out['hooks'].pop(event,None)
    return out
def active_receipt(install):
    repaired=install/'installation-receipt-native-launch.json'
    return repaired if repaired.exists() else install/'installation-receipt.json'
def repair(install,hooks,package,g,addition):
    # A rolled-back installation is retained history, not a fresh installation.
    # An exact repair grant pins all existing authority and never resets state.
    record_path=install/'installation-receipt.json';original=install/'previous-hooks.json'
    repaired=install/'installation-receipt-native-launch.json'
    need(not repaired.exists(),'native launch repair already recorded')
    expected={'previous_receipt_sha256':record_path,'existing_config_sha256':install/(g['lane']+'.json'),'existing_credential_sha256':install/'writer.dpapi','previous_hooks_sha256':original}
    for key,p in expected.items():need(g.get(key)==sha(p),'repair history identity: '+key)
    record=json.loads(record_path.read_bytes());old=hooks.read_bytes()
    need(hashlib.sha256(old).hexdigest()==record['old_sha256']==g['previous_hooks_sha256'],'rolled-back hooks changed')
    need(sha(install/'reporter.py')==sha(package/'reporting/reporter.py')==record['reporter_sha256']==g['reporter_sha256'],'retained reporter changed')
    need((install/'state/STOP').is_file(),'rolled-back stopped state required')
    merged=merge(json.loads(old),addition);new=(json.dumps(merged,indent=2)+'\n').encode('utf-8')
    pending=hooks.with_suffix('.rta-repair.pending');receipt_pending=repaired.with_suffix('.pending')
    need(not pending.exists() and not receipt_pending.exists(),'repair staging conflict')
    updated={**record,'addition':addition,'new_sha256':hashlib.sha256(new).hexdigest(),'repair_source_commit':g['source_commit'],'previous_receipt_sha256':sha(record_path),'qualification':'PENDING BOTH-MACHINE LIVE TRIAL'}
    pending.write_bytes(new);receipt_pending.write_text(json.dumps(updated,indent=2)+'\n',encoding='utf-8')
    need(hooks.read_bytes()==old,'hook writer conflict')
    os.replace(pending,hooks);os.replace(receipt_pending,repaired)
    (install/'state/STOP').unlink()
    print('{"native_launch_repair":"STAGED","private_history":"RETAINED","qualification":"PENDING"}')
def main():
    a=argparse.ArgumentParser();a.add_argument('mode',choices=['prepare','install','repair','rollback']);a.add_argument('--package',required=True);a.add_argument('--grant',required=True);a.add_argument('--credential-file');args=a.parse_args()
    need(os.name=='nt' and sys.version_info>=(3,11),'Windows Python 3.11+ required')
    package=pathlib.Path(args.package).resolve();g=json.loads(pathlib.Path(args.grant).read_bytes());need(g.get('authorized') is True and g.get('packet')=='RTA-PER-TURN-REPORTING-P0-g0001','exact owner activation grant required')
    need(g['lane'] in ('spock','remocommand'),'lane');need(g['computer'].casefold()==os.environ.get('COMPUTERNAME','').casefold(),'machine identity')
    install=pathlib.Path(r'C:\ProgramData\FactoryControl\RoadToAlphaTurnReporting\v1');hooks=pathlib.Path.home()/'.codex/hooks.json'
    need(str(install)==g['install_directory'],'install ceiling');need(sha(package/'reporting/reporter.py')==g['reporter_sha256'],'source hash');config_path=install/(g['lane']+'.json');reporter=install/'reporter.py';addition=groups(pathlib.Path(sys.executable),reporter,config_path)
    if args.mode=='prepare':print(json.dumps({'hook_events':EVENTS,'reporter_sha256':sha(package/'reporting/reporter.py'),'native_runtime_qualification':'PENDING','production_effects':'NONE'}));return
    if args.mode=='rollback':
        record=json.loads(active_receipt(install).read_bytes());current=json.loads(hooks.read_bytes());out=remove_owned(current,record['addition']);(install/'state/STOP').write_text('Stop the dedicated retry helper naturally.\n',encoding='utf-8')
        pending=hooks.with_suffix('.rta-rollback.pending');need(not pending.exists(),'pending rollback exists')
        original=(install/'previous-hooks.json').read_bytes();restored=original if sha(hooks)==record['new_sha256'] else (json.dumps(out,indent=2)+'\n').encode('utf-8')
        pending.write_bytes(restored);os.replace(pending,hooks);print('{"reporter_hooks":"REMOVED","private_history":"RETAINED"}');return
    if args.mode=='repair':repair(install,hooks,package,g,addition);return
    need(not install.exists(),'new installation directory required');old=hooks.read_bytes() if hooks.exists() else b'{"hooks":{}}'
    if g.get('previous_hooks_sha256'):need(hashlib.sha256(old).hexdigest()==g['previous_hooks_sha256'],'existing hook definition changed')
    merged=merge(json.loads(old),addition);need(args.credential_file,'protected credential input file required');credential=pathlib.Path(args.credential_file).read_bytes().strip();need(len(credential)>=32,'credential')
    install.mkdir(parents=True);(install/'state').mkdir();account=subprocess.check_output(['whoami'],text=True).strip()
    # Apply only the specifically new package directory ACL before any credential is written.
    acl=subprocess.run(['icacls',str(install),'/inheritance:r','/grant:r',account+':(OI)(CI)F','*S-1-5-18:(OI)(CI)F','*S-1-5-32-544:(OI)(CI)F'],capture_output=True);need(acl.returncode==0,'new-directory ACL failed')
    (install/'previous-hooks.json').write_bytes(old);shutil.copyfile(package/'reporting/reporter.py',reporter);(install/'writer.dpapi').write_bytes(encrypt(credential))
    c=g['config'];need(c['lane']==g['lane'],'config lane');c['v']=1;c['credential_file']=str(install/'writer.dpapi');c['credential_format']='dpapi';c['state_directory']=str(install/'state');config_path.write_text(json.dumps(c,indent=2)+'\n',encoding='utf-8')
    pending=hooks.with_suffix('.rta-install.pending');need(not pending.exists(),'pending install exists');pending.write_text(json.dumps(merged,indent=2)+'\n',encoding='utf-8');need(hooks.read_bytes()==old if hooks.exists() else old==b'{"hooks":{}}','hook writer conflict');os.replace(pending,hooks)
    receipt={'addition':addition,'old_sha256':hashlib.sha256(old).hexdigest(),'new_sha256':sha(hooks),'reporter_sha256':sha(reporter),'trust_review':'REQUIRED IN CODEX; installing does not trust hooks','qualification':'PENDING BOTH-MACHINE LIVE TRIAL'};(install/'installation-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8');print('{"installation":"STAGED","hook_trust_and_live_qualification":"PENDING"}')
if __name__=='__main__':main()
