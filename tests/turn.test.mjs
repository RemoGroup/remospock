import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHandler,signature} from '../supabase/functions/rta-turn-reporting/handler.mjs';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {transition} from '../tools/publish-turn-release.mjs';
const C=createRequire(import.meta.url)('../turn-core.js');
const key='test-only-nonproduction-writer-key-0000000000000000';
test('static activation refuses drift and rollback touches only the approved static difference',()=>{assert.throws(()=>transition({'index.html':'unexpected'},{'index.html':'old'},{'index.html':'new'}));const changes=transition({'index.html':'new','turn-core.js':'added'},{'index.html':'new','turn-core.js':'added'},{'index.html':'old'});assert.deepEqual(changes,[{path:'index.html',mode:'100644',type:'blob',sha:'old'},{path:'turn-core.js',mode:'100644',type:'blob',sha:null}]);assert(changes.every(c=>c.path!=='road-to-alpha-status.json'));});
const sample=(over={})=>({v:1,lane:'spock',binding_id:'spock-mb01',event_id:'a'.repeat(64),turn:'b'.repeat(64),sequence:1,observed_at:new Date().toISOString(),kind:'turn_start',phase:'WORKING',changed_files:0,checks_passed:0,checks_failed:0,completed:[],remaining:[],blockers:[],next_action:'Continue admitted work.',summary_complete:false,...over});
function handler(){let stored=[];const h=createHandler({url:'unused',backendKey:'never-return-this-secret',writerKeys:{'spock-g1':{lane:'spock',secret:key}},origins:['https://remogroup.github.io'],rpc:async(name,body)=>{if(name==='rta_read_turn_snapshot')return stored;const e=body.p_event;if(e.binding_id!=='spock-mb01')throw Error('binding');const old=stored.find(r=>r.event.event_id===e.event_id);if(old){assert.deepEqual(old.event,e);return {event_id:e.event_id,cursor:old.cursor,duplicate:true};}assert.equal(e.sequence,stored.length+1);const r={event:e,title:'Integration work',packet:'MB-01',milestone_ids:['MB-01'],received_at:new Date().toISOString(),cursor:stored.length+1};stored.push(r);return {event_id:e.event_id,cursor:r.cursor,duplicate:false};}});return h;}
async function request(h,body,{signed=true,writer='spock-g1',origin=null}={}){const raw=typeof body==='string'?body:JSON.stringify(body),headers={'Content-Type':'application/json','X-Rta-Writer':writer,'X-Rta-Signature':signed?await signature(key,new TextEncoder().encode(raw)):'0'.repeat(64)};if(origin)headers.origin=origin;return h(new Request('https://example.test/report',{method:'POST',headers,body:raw}));}
test('shared browser and edge validator bytes match',async()=>assert.equal(createHash('sha256').update(await readFile(new URL('../turn-core.js',import.meta.url))).digest('hex'),createHash('sha256').update(await readFile(new URL('../supabase/functions/_shared/turn-core.js',import.meta.url))).digest('hex')));
test('authenticated work event and duplicate have one durable identity',async()=>{const h=handler(),e=sample();assert.equal((await request(h,e)).status,200);const r=await request(h,e);assert.equal((await r.json()).duplicate,true);});
test('wrong signature refused',async()=>assert.equal((await request(handler(),sample(),{signed:false})).status,401));
test('unknown writer refused',async()=>assert.equal((await request(handler(),sample(),{writer:'unknown'})).status,401));
test('cross-lane impersonation refused',async()=>assert.equal((await request(handler(),sample({lane:'remocommand'}))).status,403));
test('unknown binding refused',async()=>assert.equal((await request(handler(),sample({binding_id:'spock-unknown'}))).status,409));
test('duplicate JSON keys refused before storage',async()=>assert.equal((await request(handler(),JSON.stringify(sample()).replace('"v":1','"v":1,"v":1'))).status,409));
test('milestone disposition cannot enter work endpoint',async()=>assert.equal((await request(handler(),{...sample(),milestone_state:'VERIFIED COMPLETE'})).status,409));
for(const bad of ['https://drive.google.com/private','C:\\private\\secret','operator@example.test','session: confidential','sb_secret_do_not_publish','<script>','12345678-1234-1234-1234-123456789abc'])test('private or unsafe summary refused: '+bad.split(/[ :]/)[0],async()=>assert.equal((await request(handler(),sample({completed:[bad]}))).status,409));
test('future activity refused',async()=>assert.equal((await request(handler(),sample({observed_at:new Date(Date.now()+120000).toISOString()}))).status,409));
test('coding needs observed source edit',()=>assert.throws(()=>C.event(sample({phase:'CODING'}))));
test('zero-change source edit refused',()=>assert.throws(()=>C.event(sample({kind:'source_edit',phase:'CODING'}))));
test('untrusted browser origin refused',async()=>assert.equal((await request(handler(),sample(),{origin:'https://attacker.example'})).status,403));
test('oversize stream refused',async()=>assert.equal((await request(handler(),JSON.stringify(sample({completed:['x'.repeat(17000)]})))).status,413));
test('missing credential is never anonymous write access',async()=>{const h=createHandler({writerKeys:{},origins:[],rpc:async()=>assert.fail('storage called')});assert.equal((await request(h,sample())).status,401);});
test('snapshot exposes sanitized mapping without backend secrets',async()=>{const h=handler();await request(h,sample());const s=await(await h(new Request('https://example.test/report'))).json();await C.snapshot(s);assert.deepEqual(s.records[0].milestone_ids,['MB-01']);assert(!JSON.stringify(s).includes(key));assert(!JSON.stringify(s).includes('never-return'));});
test('old queued observations remain stale after receipt',()=>{const r={event:sample({observed_at:new Date(Date.now()-100000).toISOString()}),received_at:new Date().toISOString()};assert.equal(C.activity(r),'ACTIVITY UNKNOWN');});
test('tampered snapshot refused',async()=>{const h=handler();await request(h,sample());const s=await(await h(new Request('https://example.test/report'))).json();s.records[0].title='Changed';await assert.rejects(C.snapshot(s));});
test('sequence gaps refused',async()=>assert.equal((await request(handler(),sample({sequence:2}))).status,409));
test('retained original 24 status acceptance tests remain a separate suite',async()=>assert((await readFile(new URL('./status.test.mjs',import.meta.url),'utf8')).includes('MILESTONE_DISPOSITION')));

test('full history with bounded rich summaries remains readable',async()=>{const records=Array.from({length:128},(_,i)=>({event:sample({event_id:i.toString(16).padStart(64,'0'),turn:(i+128).toString(16).padStart(64,'0'),completed:['x'.repeat(600),'y'.repeat(600)],summary_complete:true}),title:'Integration work',packet:'MB-01',milestone_ids:['MB-01'],received_at:new Date().toISOString(),cursor:i+1}));const s={v:1,generated_at:new Date().toISOString(),cursor:128,records};s.checksum=await C.checksum(s);const raw=JSON.stringify(s);assert(raw.length>131072);await C.snapshot(C.parse(raw));});
