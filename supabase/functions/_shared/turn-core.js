/* Work observations only. This module has no milestone-disposition operation. */
(function(root){
  'use strict';
  const phases=['WORKING','CODING','TESTING','AWAITING REVIEW','BLOCKED','IDLE','INTERRUPTED','REPORT INCOMPLETE'];
  const kinds=['turn_start','source_edit','test_start','test_result','turn_end','blocked','interrupted'];
  const need=(x,m)=>{if(!x)throw Error(m);};
  const keys=(o,a)=>{need(o&&typeof o==='object'&&!Array.isArray(o),'object');need(Object.keys(o).every(k=>a.includes(k)),'unexpected field');};
  function text(s,max=600){need(typeof s==='string'&&s.length<=max&&!/[<>\u0000-\u001f\u202a-\u202e\u2066-\u2069]/.test(s),'unsafe text');need(!/(?:https?:\/\/|[A-Z]:[\\/]|\\\\|[\w.+-]+@[\w.-]+\.[a-z]{2,}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}|S-1-5-21-|(?:session|thread|pid|argv)\s*[:=#]|sb_secret_|gh[pousr]_|eyJ[A-Za-z0-9_-]{10,}\.|(?:password|api_key|authorization)\s*[:=])/i.test(s),'private text');return s;}
  const hex=(s)=>need(typeof s==='string'&&/^[0-9a-f]{64}$/.test(s),'digest');
  const id=s=>need(typeof s==='string'&&/^[a-z][a-z0-9-]{1,79}$/.test(s),'identifier');
  const stamp=(s,now)=>need(typeof s==='string'&&Number.isFinite(Date.parse(s))&&Date.parse(s)<=now+60000,'timestamp');
  const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
  function parse(s){need(typeof s==='string'&&s.length<2500000,'size');let i=0;const ws=()=>{while(i<s.length&&/\s/.test(s[i]))i++;};function str(){const b=i++;while(i<s.length){if(s[i]==='\\'){i+=2;continue;}if(s[i++]==='"')return JSON.parse(s.slice(b,i));}throw Error('string');}function val(d=0){need(d<20,'depth');ws();if(s[i]==='"')return str();if(s[i]==='{'){i++;const o=Object.create(null);ws();if(s[i]==='}'){i++;return o;}while(true){ws();need(s[i]==='"','key');const k=str();need(!Object.hasOwn(o,k),'duplicate key');ws();need(s[i++]===':','colon');o[k]=val(d+1);ws();const c=s[i++];if(c==='}')return o;need(c===',','separator');}}if(s[i]==='['){i++;const a=[];ws();if(s[i]===']'){i++;return a;}while(true){a.push(val(d+1));ws();const c=s[i++];if(c===']')return a;need(c===',','separator');}}const b=i;while(i<s.length&&!/[\s,\]}]/.test(s[i]))i++;need(i>b,'value');return JSON.parse(s.slice(b,i));}const o=val();ws();need(i===s.length,'trailing data');return o;}
  function lines(a){need(Array.isArray(a)&&a.length<=12,'list');a.forEach(x=>text(x));}
  function event(e,now=Date.now()){
    keys(e,['v','lane','binding_id','event_id','turn','sequence','observed_at','kind','phase','changed_files','checks_passed','checks_failed','completed','remaining','blockers','next_action','summary_complete']);
    need(e.v===1&&['spock','remocommand'].includes(e.lane),'lane');id(e.binding_id);hex(e.event_id);hex(e.turn);need(Number.isSafeInteger(e.sequence)&&e.sequence>0,'sequence');stamp(e.observed_at,now);need(kinds.includes(e.kind)&&phases.includes(e.phase),'work phase');
    for(const k of ['changed_files','checks_passed','checks_failed'])need(Number.isSafeInteger(e[k])&&e[k]>=0&&e[k]<=100000,'count');
    for(const k of ['completed','remaining','blockers'])lines(e[k]);text(e.next_action);need(typeof e.summary_complete==='boolean','summary flag');
    need(e.phase!=='CODING'||e.kind==='source_edit','coding evidence');need(e.kind!=='source_edit'||e.changed_files>0,'edit observation');need(e.phase!=='TESTING'||e.kind==='test_start','test evidence');
    need(e.kind!=='turn_end'||['AWAITING REVIEW','BLOCKED','IDLE','REPORT INCOMPLETE'].includes(e.phase),'closeout phase');return e;
  }
  function record(r,now=Date.now()){
    keys(r,['event','title','packet','milestone_ids','received_at','cursor']);event(r.event,now);text(r.title,180);text(r.packet,120);stamp(r.received_at,now);need(Number.isSafeInteger(r.cursor)&&r.cursor>0,'cursor');need(Array.isArray(r.milestone_ids)&&r.milestone_ids.length<=32&&new Set(r.milestone_ids).size===r.milestone_ids.length&&r.milestone_ids.every(x=>/^MB-(?:[0-2][0-9]|3[01])$/.test(x)),'mapping');return r;
  }
  async function checksum(o){const c={...o};delete c.checksum;return [...new Uint8Array(await root.crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(c))))].map(x=>x.toString(16).padStart(2,'0')).join('');}
  async function snapshot(s,now=Date.now()){keys(s,['v','generated_at','cursor','records','checksum']);need(s.v===1&&Number.isSafeInteger(s.cursor)&&s.cursor>=0,'snapshot');stamp(s.generated_at,now);need(Array.isArray(s.records)&&s.records.length<=128,'records');s.records.forEach(r=>record(r,now));need(new Set(s.records.map(r=>r.event.binding_id+':'+r.event.turn)).size===s.records.length,'duplicate work');need(s.records.every(r=>r.cursor<=s.cursor),'cursor bounds');hex(s.checksum);need(await checksum(s)===s.checksum,'checksum');return s;}
  function activity(r,now=Date.now()){return now-Date.parse(r.event.observed_at)>90000?'ACTIVITY UNKNOWN':r.event.phase;}
  const api={phases,kinds,need,keys,text,hex,id,canonical,parse,event,record,checksum,snapshot,activity};root.RTATurn=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
