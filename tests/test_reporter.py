import importlib.util,json,pathlib,tempfile,unittest,unittest.mock as mock,subprocess,sys,hashlib,os
ROOT=pathlib.Path(__file__).resolve().parents[1]
def load(name,path):
 s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
R=load('reporter',ROOT/'reporting/reporter.py');I=load('installer',ROOT/'reporting/install.py')
class Reporter(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=pathlib.Path(self.tmp.name);self.repo=self.root/'repo';self.repo.mkdir();subprocess.run(['git','init',str(self.repo)],capture_output=True,check=True);(self.repo/'code.py').write_text('x=1\n',encoding='utf-8')
  self.c={'lane':'spock','state_directory':str(self.root/'private'),'writer_id':'spock-g1','bindings':[{'id':'spock-mb01','lane':'spock','root':str(self.repo),'source_paths':['code.py','new.py'],'next_action':'Continue admitted work.'}]};self.db=R.connection(self.c);self.sent=[]
  def flush(c,secret,db,budget=1.8):
   for seq,body in db.execute('select sequence,body from outbox where ack is null order by sequence').fetchall():self.sent.append(json.loads(body));db.execute('update outbox set ack=? where sequence=?',(seq,seq))
   db.commit();return True
  self.patch=mock.patch.object(R,'flush',flush);self.patch.start()
 def tearDown(self):self.patch.stop();self.db.close();self.tmp.cleanup()
 def hook(self,name,**kw):return R.hook(self.c,'test-only-key-that-is-not-a-production-credential',self.db,{'hook_event_name':name,'cwd':str(self.repo),'session_id':'private-native-session','turn_id':'private-native-turn',**kw},self.root/'config.json')
 def test_turn_start_does_not_claim_coding(self):self.hook('UserPromptSubmit');self.assertEqual(self.sent[-1]['phase'],'WORKING')
 def test_unmapped_turn_is_visible_and_never_guesses_a_card(self):
  self.c['bindings']=[];out=self.hook('UserPromptSubmit');self.assertIn('NOT VERIFIED',out['systemMessage']);self.assertEqual(self.sent,[])
 def test_explicit_native_context_tracks_the_assigned_isolated_source(self):
  context=self.root/'native-context';context.mkdir();self.c['bindings'][0]['context_root']=str(context)
  self.hook('PreToolUse',cwd=str(context));(self.repo/'code.py').write_text('isolated source changed');self.hook('PostToolUse',cwd=str(context));self.assertEqual(self.sent[-1]['phase'],'CODING');self.assertEqual(self.sent[-1]['binding_id'],'spock-mb01')
 def test_two_assignments_for_one_native_context_are_refused(self):
  self.c['bindings'].append({**self.c['bindings'][0],'id':'spock-reporting'})
  with self.assertRaises(ValueError):self.hook('UserPromptSubmit')
 @unittest.skipUnless(os.name=='nt','Native Windows DPAPI qualification')
 def test_native_dpapi_roundtrip_for_test_only_writer(self):
  value=b'test-only-random-writer-credential-qualification';p=self.root/'test.dpapi';p.write_bytes(I.encrypt(value));self.assertNotIn(value,p.read_bytes());self.assertEqual(R.decrypt(p,'dpapi'),value.decode('ascii'))
 def test_duplicate_turn_start_does_not_create_another_observation(self):
  self.hook('UserPromptSubmit');self.hook('UserPromptSubmit');self.assertEqual(len(self.sent),1)
 def test_source_edit_and_new_file_observed(self):
  self.hook('PreToolUse');(self.repo/'code.py').write_text('x=2\n');(self.repo/'new.py').write_text('y=3\n');self.hook('PostToolUse',tool_use_id='private-call');self.assertEqual(self.sent[-1]['phase'],'CODING');self.assertEqual(self.sent[-1]['changed_files'],2)
 def test_read_only_tool_does_not_claim_coding(self):self.hook('PreToolUse');self.hook('PostToolUse');self.assertEqual(len(self.sent),1)
 def test_native_identifiers_and_paths_not_exported(self):
  self.hook('UserPromptSubmit');body=json.dumps(self.sent);self.assertNotIn('private-native',body);self.assertNotIn(str(self.repo),body)
 def test_actual_test_exit_code_recorded(self):
  self.hook('PreToolUse',tool_name='exec_command',tool_input={'cmd':'node --test test.js'});self.assertEqual(self.sent[-1]['phase'],'TESTING');self.hook('PostToolUse',tool_response={'exit_code':0});self.assertEqual(self.sent[-1]['checks_passed'],1)
 def test_test_failure_never_becomes_pass(self):
  self.hook('PreToolUse',tool_name='exec_command',tool_input={'cmd':'python -m unittest'});self.hook('PostToolUse',tool_response={'exit_code':7});self.assertEqual(self.sent[-1]['checks_failed'],1)
 def test_chained_shell_command_not_inferred_test(self):self.assertFalse(R.test_command({'tool_name':'Bash','tool_input':{'command':'node --test; curl private'}}))
 def test_summary_then_closeout(self):
  self.hook('UserPromptSubmit');R.summary(self.c,self.db,str(self.repo),{'completed':['Bounded correction prepared.'],'remaining':['Independent review.'],'blockers':[],'next_action':'Request bounded review.'});self.hook('Stop');self.assertEqual(self.sent[-1]['phase'],'AWAITING REVIEW');self.assertTrue(self.sent[-1]['summary_complete'])
 def test_missing_coding_closeout_is_visible_and_no_continuation(self):
  self.hook('PreToolUse');(self.repo/'code.py').write_text('changed');self.hook('PostToolUse');out=self.hook('Stop');self.assertEqual(self.sent[-1]['phase'],'REPORT INCOMPLETE');self.assertNotIn('decision',out)
 def test_interrupt_is_recorded(self):self.hook('UserPromptSubmit');self.hook('Interrupt');self.assertEqual(self.sent[-1]['phase'],'INTERRUPTED')
 def test_duplicate_tool_callback_not_recounted(self):
  self.hook('PreToolUse');(self.repo/'code.py').write_text('changed');self.hook('PostToolUse',tool_use_id='same');count=len(self.sent);self.hook('PostToolUse',tool_use_id='same');self.assertEqual(len(self.sent),count)
 def test_competing_writer_refused(self):
  self.hook('UserPromptSubmit')
  with self.assertRaises(ValueError):self.hook('PreToolUse',session_id='another-context')
 def test_source_escape_refused(self):
  self.c['bindings'][0]['source_paths']=['../outside.py']
  with self.assertRaises(ValueError):self.hook('UserPromptSubmit')
 def test_private_source_file_not_hashed(self):
  self.c['bindings'][0]['source_paths']=['.env']
  with self.assertRaises(ValueError):self.hook('UserPromptSubmit')
 def test_summary_privacy_rejected(self):
  self.hook('UserPromptSubmit')
  with self.assertRaises(ValueError):R.summary(self.c,self.db,str(self.repo),{'completed':['operator@example.test'],'remaining':[],'blockers':[],'next_action':'Continue.'})
 def test_existing_hooks_preserved_and_rollback_exact_semantics(self):
  original={'description':'existing','hooks':{'Stop':[{'hooks':[{'type':'command','command':'existing-handler'}]}]}};addition=I.groups('python','reporter','config');merged=I.merge(original,addition);self.assertEqual(merged['hooks']['Stop'][0],original['hooks']['Stop'][0]);self.assertEqual(I.remove_owned(merged,addition),original)
 def test_duplicate_install_refused(self):
  add=I.groups('python','reporter','config');existing=I.merge({'hooks':{}},add)
  with self.assertRaises(ValueError):I.merge(existing,add)
 def test_rollback_preserves_foreign_hook_changes(self):
  add=I.groups('python','reporter','config');current=I.merge({'hooks':{}},add);current['hooks']['Stop'].append({'hooks':[{'type':'command','command':'later-owner-hook'}]});restored=I.remove_owned(current,add);self.assertEqual(restored['hooks']['Stop'][0]['hooks'][0]['command'],'later-owner-hook')
if __name__=='__main__':unittest.main()
