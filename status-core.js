/* Shared public-feed contract. No credentials, native identities or private Drive URLs. */
(function (root) {
  "use strict";
  const IDS = Array.from({length:32}, (_,i)=>"MB-"+String(i).padStart(2,"0"));
  const STATES = ["NOT VERIFIED","READY","IMPLEMENTING","READY FOR AUDIT","SOURCE ACCEPTED","INTEGRATION PENDING","INTEGRATED","TECHNICALLY QUALIFIED","BLOCKED","PARKED","PARTIAL","IN PROGRESS","VERIFIED COMPLETE"];
  const CLASS = ["HISTORICAL PUBLIC","SOURCE ACCEPTED","INTEGRATION ACCEPTED","MILESTONE DISPOSITION","EXECUTOR REPORTED","ACCEPTANCE REPORTED","SOURCE CANDIDATE"];
  function need(ok, reason) { if (!ok) throw new Error(reason); }
  function keys(o, allowed) { need(o && typeof o==="object" && !Array.isArray(o),"object required"); need(Object.keys(o).every(k=>allowed.includes(k)),"unexpected field"); }
  function text(s, max=1600) {
    need(typeof s==="string" && s.length<=max && !/[<>\u0000-\u0008\u000b-\u001f\u202a-\u202e\u2066-\u2069]/.test(s),"unsafe text");
    need(!/(?:https?:\/\/|[A-Z]:[\\/]|\\\\|\/Users\/|\/home\/|S-1-5-21-|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:pid|session|thread)\s*[:=#]\s*\w+|(?:sb_secret_|gh[pousr]_|AKIA)[A-Za-z0-9_-]{12,}|eyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]+\.)/i.test(s),"private or credential-shaped text");
    return s;
  }
  function strings(a, max=100) { need(Array.isArray(a)&&a.length<=max,"array required"); a.forEach(s=>text(s)); }
  function stamp(s, now, optional=false) { if(optional&&s===null)return; need(typeof s==="string"&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|\+00:00)$/.test(s)&&Number.isFinite(Date.parse(s))&&Date.parse(s)<=now+60000,"invalid or future timestamp"); }
  function date(s, optional=false) { if(optional&&s===null)return; need(typeof s==="string"&&/^\d{4}-\d\d-\d\d$/.test(s)&&Number.isFinite(Date.parse(s))&&Date.parse(s)<=Date.now()+60000&&new Date(s).toISOString().slice(0,10)===s,"invalid or future date"); }
  function hex(s, length, optional=false) { if(optional&&s===null)return; need(typeof s==="string"&&new RegExp("^[0-9a-f]{"+length+"}$").test(s),"invalid digest"); }
  function unique(a) { need(new Set(a).size===a.length,"duplicate identity"); }
  function eventTime(o, now) { keys(o,["at","date","precision","basis"]); stamp(o.at,now,true);date(o.date,true);need(["second","day","unknown"].includes(o.precision),"invalid precision");text(o.basis);need(o.precision!=="second"||o.at!==null,"missing event time");need(o.precision!=="day"||o.date!==null,"missing event date"); }
  function canonical(value) {
    if(Array.isArray(value))return "["+value.map(canonical).join(",")+"]";
    if(value!==null&&typeof value==="object")return "{"+Object.keys(value).sort().map(k=>JSON.stringify(k)+":"+canonical(value[k])).join(",")+"}";
    return JSON.stringify(value);
  }
  async function checksum(feed) { const copy={...feed};delete copy.checksum;const b=await root.crypto.subtle.digest("SHA-256",new TextEncoder().encode(canonical(copy)));return Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,"0")).join(""); }
  // JSON.parse alone accepts duplicate object keys. Refuse ambiguous receipts and feeds.
  function parseJSON(source) {
    need(typeof source==="string"&&source.length<=1000000,"feed size");let i=0;
    const ws=()=>{while(/\s/.test(source[i]||"")&&i<source.length)i++;};
    function str(){const start=i++;while(i<source.length){if(source[i]==="\\"){i+=2;continue;}if(source[i++]==='"')return JSON.parse(source.slice(start,i));}throw new Error("unterminated string");}
    function value(depth=0){need(depth<40,"JSON depth");ws();const c=source[i];if(c==='"')return str();if(c==="{"){i++;const o=Object.create(null),seen=new Set();ws();if(source[i]==="}"){i++;return o;}while(true){ws();need(source[i]==='"',"object key");const k=str();need(!seen.has(k),"duplicate JSON key");seen.add(k);ws();need(source[i++]===':',"colon");o[k]=value(depth+1);ws();const sep=source[i++];if(sep==='}')return o;need(sep===',',"object separator");}}if(c==='['){i++;const a=[];ws();if(source[i]===']'){i++;return a;}while(true){a.push(value(depth+1));ws();const sep=source[i++];if(sep===']')return a;need(sep===',',"array separator");}}const start=i;while(i<source.length&&!/[\s,\]}]/.test(source[i]))i++;need(i>start,"JSON value");const result=JSON.parse(source.slice(start,i));need(result===null||typeof result==='boolean'||typeof result==='number'&&Number.isFinite(result),"JSON primitive");return result;}
    const result=value();ws();need(i===source.length,"trailing JSON");return result;
  }
  function validate(feed, now=Date.now()) {
    keys(feed,["schema_version","revision","generated_at","last_evidence_check","latest_accepted_engineering_event","last_milestone_disposition_change","milestone_evidence_cutoff","expected_refresh_seconds","sources","evidence","work_items","milestones","lanes","panels","checksum"]);
    need(feed.schema_version===1&&Number.isSafeInteger(feed.revision)&&feed.revision>=1,"feed identity");
    ["generated_at","last_evidence_check","milestone_evidence_cutoff"].forEach(k=>stamp(feed[k],now));
    need(Date.parse(feed.last_evidence_check)<=Date.parse(feed.generated_at),"check after generation");
    eventTime(feed.latest_accepted_engineering_event,now);eventTime(feed.last_milestone_disposition_change,now);
    need(feed.expected_refresh_seconds===600,"refresh contract");hex(feed.checksum,64);
    need(Array.isArray(feed.sources)&&feed.sources.length<=12,"sources");
    feed.sources.forEach(s=>{keys(s,["id","label","checked_at","status","note"]);text(s.id,80);text(s.label,160);stamp(s.checked_at,now,true);need(["OK","DEGRADED","UNAVAILABLE","NOT VERIFIED"].includes(s.status),"source health");text(s.note);});unique(feed.sources.map(s=>s.id));
    need(Array.isArray(feed.evidence)&&feed.evidence.length<=1000,"evidence");
    feed.evidence.forEach(e=>{keys(e,["id","title","classification","sha256","commit","tree","accepted_at","accepted_date","scope"]);text(e.id,120);text(e.title);text(e.scope);need(CLASS.includes(e.classification),"evidence classification");hex(e.sha256,64,true);hex(e.commit,40,true);hex(e.tree,40,true);stamp(e.accepted_at,now,true);date(e.accepted_date,true);if(["SOURCE ACCEPTED","INTEGRATION ACCEPTED"].includes(e.classification))need(e.commit!==null&&e.tree!==null&&e.sha256!==null&&(e.accepted_at!==null||e.accepted_date!==null),"unbound accepted source");});unique(feed.evidence.map(e=>e.id));
    const evidenceIDs=new Set(feed.evidence.map(e=>e.id));const refs=a=>{strings(a);need(a.every(x=>evidenceIDs.has(x)),"unknown evidence reference");unique(a);};
    need(Array.isArray(feed.work_items)&&feed.work_items.length<=300,"work items");
    feed.work_items.forEach(w=>{keys(w,["id","title","lane","milestone_ids","classification","state","writer","activity_at","activity_basis","next_action","blockers","evidence_ids"]);["id","title","writer","next_action"].forEach(k=>text(w[k]));need(["spock","remocommand","shared"].includes(w.lane),"work lane");strings(w.milestone_ids,32);need(w.milestone_ids.every(id=>IDS.includes(id)),"work milestone");unique(w.milestone_ids);need(CLASS.includes(w.classification),"work classification");need(["ACTIVE","PENDING REVIEW","BLOCKED","IDLE","UNKNOWN"].includes(w.state),"work state");stamp(w.activity_at,now,true);need(["SOURCE EDIT","TEST RUN","RECEIPT","DECLARED","UNKNOWN"].includes(w.activity_basis),"activity basis");if(w.state==="ACTIVE")need(w.activity_at!==null&&["SOURCE EDIT","TEST RUN"].includes(w.activity_basis),"active without verified work");strings(w.blockers);refs(w.evidence_ids);if(w.classification==="SOURCE ACCEPTED")need(w.evidence_ids.some(id=>feed.evidence.find(e=>e.id===id).classification==="SOURCE ACCEPTED"),"accepted work without acceptance");});unique(feed.work_items.map(w=>w.id));
    need(Array.isArray(feed.milestones)&&feed.milestones.length===32,"exactly 32 milestones");unique(feed.milestones.map(m=>m.id));
    const childIDs=[];
    feed.milestones.forEach((m,i)=>{keys(m,["id","label","group","state","scope","evidence_at","evidence_ids","remaining","dependencies","next_action","children","work_item_ids"]);need(m.id===IDS[i],"milestone order");["label","group","scope","next_action"].forEach(k=>text(m[k]));need(STATES.includes(m.state),"milestone state");stamp(m.evidence_at,now,true);refs(m.evidence_ids);strings(m.remaining);strings(m.dependencies);need(m.next_action.length>0,"next action missing");need(Array.isArray(m.children)&&m.children.length<=100,"children");m.children.forEach(c=>{keys(c,["id","title","lane","state","note","blocker","evidence_ids"]);["id","title","note","blocker"].forEach(k=>text(c[k]));need(["spock","remocommand","shared","unassigned"].includes(c.lane)&&STATES.includes(c.state),"child state/lane");refs(c.evidence_ids);childIDs.push(c.id);});strings(m.work_item_ids);need(m.work_item_ids.every(id=>feed.work_items.some(w=>w.id===id&&w.milestone_ids.includes(m.id))),"work mapping");if(m.state==="VERIFIED COMPLETE")need(m.evidence_ids.some(id=>feed.evidence.find(e=>e.id===id).classification==="MILESTONE DISPOSITION"),"completion without explicit milestone disposition");});unique(childIDs);
    keys(feed.lanes,["spock","remocommand"]);for(const lane of ["spock","remocommand"]){const item=feed.lanes[lane];keys(item,["current_item_id","note"]);text(item.note);need(feed.work_items.some(w=>w.id===item.current_item_id&&w.lane===lane),"lane current item");}
    keys(feed.panels,["advances","critical_path","blockers","decisions"]);Object.values(feed.panels).forEach(a=>strings(a,100));
    return feed;
  }
  async function verify(feed, now=Date.now()) { validate(feed,now);need(await checksum(feed)===feed.checksum,"feed checksum mismatch");return feed; }
  function counts(feed) {const m=feed.milestones,linked=new Set(m.flatMap(x=>x.work_item_ids)),items=new Map(m.flatMap(x=>x.children).map(c=>[c.id,c]));for(const w of feed.work_items.filter(w=>linked.has(w.id)))if(!items.has(w.id))items.set(w.id,{state:w.classification==="SOURCE ACCEPTED"?"SOURCE ACCEPTED":w.state==="PENDING REVIEW"?"READY FOR AUDIT":w.state==="BLOCKED"?"BLOCKED":"NOT VERIFIED"});const children=[...items.values()];return {total:m.length,complete:m.filter(x=>x.state==="VERIFIED COMPLETE").length,partial:m.filter(x=>["PARTIAL","IN PROGRESS"].includes(x.state)).length,unreconciled:m.filter(x=>!["VERIFIED COMPLETE","PARTIAL","IN PROGRESS"].includes(x.state)).length,audit:children.filter(x=>x.state==="READY FOR AUDIT").length,integration:children.filter(x=>["SOURCE ACCEPTED","INTEGRATION PENDING"].includes(x.state)).length,blocked:children.filter(x=>x.state==="BLOCKED").length};}
  function freshness(feed, now=Date.now()) {const age=(now-Date.parse(feed.generated_at))/1000;return age < -60?"INVALID":age>feed.expected_refresh_seconds*2?"STALE":feed.sources.some(s=>s.status!=="OK")?"DEGRADED":"CURRENT";}
  function activity(work, now=Date.now()) {if(work.state==="ACTIVE"){const age=(now-Date.parse(work.activity_at))/1000;return age>=-60&&age<=600?(work.activity_basis==="TEST RUN"?"TESTING":"CODING"):"UNKNOWN";}return {"PENDING REVIEW":"READY_FOR_AUDIT",BLOCKED:"BLOCKED",IDLE:"IDLE",UNKNOWN:"UNKNOWN"}[work.state];}
  const api={IDS,STATES,CLASS,need,text,canonical,parseJSON,checksum,validate,verify,counts,freshness,activity};root.RTAStatus=api;if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(globalThis);
