/* Independent work layer; never writes formal status, counters or acceptance timestamps. */
(() => {
  'use strict';const C=window.RTATurn,endpoint=document.body.dataset.turnUrl;
  let snapshot=null,failed=false,busy=false,lastSuccess=0;const current=new Map();
  const node=(tag,value,cls)=>{const e=document.createElement(tag);e.textContent=value;if(cls)e.className=cls;return e;};
  const time=s=>new Intl.DateTimeFormat('en-US',{timeZone:'America/Phoenix',hour:'numeric',minute:'2-digit',second:'2-digit'}).format(new Date(s))+' AZ';
  function section(record){
    const e=record.event,el=node('section','', 'turn-work');el.dataset.turnEvent=e.event_id;el.dataset.turnObservedAt=e.observed_at;el.dataset.turnLane=e.lane;el.append(node('strong',record.title+' · '+C.activity(record)),node('div',record.packet+' · '+e.lane+' · ENGINEER REPORTED'),node('div','Observed '+time(e.observed_at)+' · received '+time(record.received_at)),node('div',e.changed_files+' source files changed · '+e.checks_passed+' checks passed · '+e.checks_failed+' checks failed'));
    for(const [label,list] of [['Work finished this turn',e.completed],['Remaining work',e.remaining],['Blockers',e.blockers]]){el.append(node('b',label));const ul=document.createElement('ul');for(const s of list.length?list:[label==='Work finished this turn'?'No semantic closeout supplied; observed file/check counts are shown.':'No additional detail reported.'])ul.append(node('li',s));el.append(ul);}
    el.append(node('div','Next: '+e.next_action));if(e.phase==='REPORT INCOMPLETE')el.append(node('div','Turn ended without a complete work summary.','turn-warning'));return el;
  }
  function paint(){
    const health=document.querySelector('[data-turn-health]');if(health)health.textContent=!snapshot?(failed?'LIVE WORK UNAVAILABLE':'LIVE WORK CONNECTING'):(failed||Date.now()-lastSuccess>10000?'LIVE WORK REPORTING DELAYED':'LIVE WORK CONNECTED')+' · last event '+(snapshot.records.length?time(snapshot.records[0].event.observed_at):'none received');
    if(!snapshot)return;
    const grouped=new Map();for(const r of snapshot.records){const key=r.event.binding_id;const previous=grouped.get(key);if(!previous||r.cursor>previous.cursor)grouped.set(key,r);}
    const history=snapshot.records.filter(r=>r.event.kind==='turn_end'&&r.event.summary_complete&&r.cursor!==grouped.get(r.event.binding_id)?.cursor).slice(0,8);
    const signature=C.canonical([...grouped.values(),...history].map(r=>[r.cursor,C.activity(r)]));
    for(const card of document.querySelectorAll('[data-mb]')){
      const records=[...grouped.values()].filter(r=>r.milestone_ids.includes(card.dataset.mb));let container=card.querySelector('[data-turn-work]');
      if(!container){container=node('div','');container.dataset.turnWork='';card.append(container);}if(container.dataset.signature===signature)continue;container.dataset.signature=signature;container.replaceChildren();for(const r of records)container.append(section(r));const prior=history.filter(r=>r.milestone_ids.includes(card.dataset.mb));if(prior.length){const details=document.createElement('details');details.append(node('summary','Recent finished turns — engineer reported'));for(const r of prior)details.append(section(r));container.append(details);}
    }
    for(const lane of ['spock','remocommand']){
      const card=document.querySelector('[data-live-card="'+lane+'"]');if(!card)continue;const records=[...grouped.values()].filter(r=>r.event.lane===lane).sort((a,b)=>b.cursor-a.cursor);
      let pane=card.querySelector('[data-turn-lane]');if(!pane){pane=node('div','');pane.dataset.turnLane='';card.append(pane);}
      if(pane.dataset.signature!==signature){pane.dataset.signature=signature;pane.replaceChildren();if(records[0])pane.append(section(records[0]));}
      const latest=records[0];if(latest){const phase=Date.now()-lastSuccess>10000?'ACTIVITY UNKNOWN':C.activity(latest);card.querySelector('[data-f="status"]').textContent=phase;const sb=card.querySelector('.sb');sb.dataset.status=phase;sb.dataset.motion=phase==='CODING'?'active':phase==='TESTING'?'testing':'none';card.querySelector('[data-f="title"]').textContent=latest.title;}
    }
  }
  async function load(){if(busy||document.hidden||!endpoint)return;busy=true;try{
    const response=await fetch(endpoint,{cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(2500)});if(!response.ok)throw Error('feed');const s=await C.snapshot(C.parse(await response.text()));
    if(snapshot&&s.cursor<snapshot.cursor)throw Error('rollback');
    for(const r of s.records){const old=current.get(r.event.event_id);const canonical=C.canonical(r);if(old&&old!==canonical)throw Error('equivocation');}
    for(const r of s.records)current.set(r.event.event_id,C.canonical(r));if(current.size>512){const keep=[...current.entries()].slice(-256);current.clear();for(const [k,v] of keep)current.set(k,v);}
    snapshot=s;failed=false;lastSuccess=Date.now();paint();
  }catch{failed=true;paint();}finally{busy=false;}}
  window.addEventListener('rta:baseline-painted',paint);window.addEventListener('rta:telemetry-painted',paint);document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
  load();setInterval(load,2000);setInterval(paint,1000);
})();
