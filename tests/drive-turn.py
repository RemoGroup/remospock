"""Drive real Windows reporter processes against isolated fixture repositories only."""
import argparse,datetime,json,os,pathlib,secrets,sqlite3,subprocess,sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
def call(config,mode,payload):
 env={**os.environ,'RTA_TEST_MODE':'1'};args=[sys.executable,str(ROOT/'reporting/reporter.py'),mode,'--config',str(config)]
 if mode=='summary':
  b=json.loads(config.read_bytes())['bindings'][0];args+=['--cwd',b.get('context_root',b['root'])]
 r=subprocess.run(args,input=json.dumps(payload),capture_output=True,text=True,env=env);assert r.returncode==0,r.stdout;return json.loads(r.stdout)
def main():
 a=argparse.ArgumentParser();a.add_argument('--private',required=True);a.add_argument('--lane',choices=['spock','remocommand'],required=True);a.add_argument('--action',choices=['setup','coding','finish','test']);args=a.parse_args();private=pathlib.Path(args.private).resolve();lane=args.lane;folder=private/lane;config=folder/'config.json';repo=folder/'repo'
 if args.action=='setup':
  folder.mkdir();repo.mkdir();subprocess.run(['git','init',str(repo)],capture_output=True,check=True);(repo/'code.py').write_text('x=1\n',encoding='utf-8');(repo/'test_local.py').write_text('import unittest\nclass Case(unittest.TestCase):\n def test_math(self):self.assertEqual(2+2,4)\n',encoding='utf-8')
  keys=json.loads((private/'local-test-keys.json').read_bytes());credential=folder/'test-only-key';credential.write_text(keys[lane+'-g1']['secret'],encoding='ascii')
  c={'v':1,'lane':lane,'writer_id':lane+'-g1','endpoint':'http://127.0.0.1:8771/report','state_directory':str(folder/'state'),'credential_file':str(credential),'credential_format':'plain-test','bindings':[{'id':'spock-mb01' if lane=='spock' else 'remocommand-professional','lane':lane,'root':str(repo),'source_paths':['code.py','test_local.py'],'next_action':'Continue the isolated qualification.'}]};config.write_text(json.dumps(c),encoding='utf-8');print('{"setup":"LOCAL_FIXTURE_READY"}');return
 control=folder/'control.json'
 if args.action=='coding':
  b=json.loads(config.read_bytes())['bindings'][0];p={'cwd':b.get('context_root',str(repo)),'session_id':'local-private-fixture-'+lane,'turn_id':secrets.token_hex(16)};control.write_text(json.dumps(p),encoding='utf-8');call(config,'hook',{**p,'hook_event_name':'UserPromptSubmit'});call(config,'hook',{**p,'hook_event_name':'PreToolUse','tool_name':'apply_patch','tool_use_id':'local-private-edit'});(repo/'code.py').write_text('x='+str(secrets.randbelow(100000))+'\n',encoding='utf-8');call(config,'hook',{**p,'hook_event_name':'PostToolUse','tool_name':'apply_patch','tool_use_id':'local-private-edit'})
 else:
  p=json.loads(control.read_bytes())
  if args.action=='test':
   call(config,'hook',{**p,'hook_event_name':'PreToolUse','tool_name':'exec_command','tool_input':{'cmd':'python -m unittest'},'tool_use_id':'local-private-test'});r=subprocess.run([sys.executable,'-m','unittest'],cwd=repo,capture_output=True);call(config,'hook',{**p,'hook_event_name':'PostToolUse','tool_name':'exec_command','tool_use_id':'local-private-test','tool_response':{'exit_code':r.returncode}})
  else:
   call(config,'summary',{'completed':['Local qualification: bounded source correction and focused check.'],'remaining':['Independent review before acceptance.'],'blockers':[],'next_action':'Preserve the candidate for independent review.'});call(config,'hook',{**p,'hook_event_name':'Stop'})
 db=sqlite3.connect(folder/'state/queue.sqlite3');body,ack=db.execute('select body,ack from outbox order by sequence desc limit 1').fetchone();e=json.loads(body);print(json.dumps({'lane':lane,'event_id':e['event_id'],'observed_at':e['observed_at'],'phase':e['phase'],'checks_passed':e['checks_passed'],'sequence':e['sequence'],'delivery_ack':ack,'measured_from':'Actual event observation before authenticated HTTP transmission'}))
if __name__=='__main__':main()
