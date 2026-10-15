/* Read-only evidence checks -> strictly sanitized public feed. No publication here. */
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const require=createRequire(import.meta.url),C=require('../status-core.js');
const hash=b=>createHash('sha256').update(b).digest('hex');
const clone=o=>structuredClone(o);
const authority=['OWNER_RELAYED_EXACT_IDENTITY','INDEPENDENT_VERIFIED_RECEIPT'];
export function applyReceipt(feed,receipt){
  const r=receipt;C.need(r&&typeof r==='object'&&r.public_record,'normalized receipt required');
  C.need(authority.includes(r.verification),'receipt authority unverified');
  const evidence=r.public_record;C.need(/^[0-9a-f]{64}$/.test(r.raw_sha256)&&evidence.sha256===r.raw_sha256,'receipt hash mismatch');
  const existing=feed.evidence.find(e=>e.id===evidence.id);if(existing){C.need(C.canonical(existing)===C.canonical(evidence),'contradictory receipt identity');return false;}
  if(r.kind==='SOURCE_ACCEPTANCE'){
    C.need(evidence.classification==='SOURCE ACCEPTED'&&evidence.commit&&evidence.tree,'accepted source identity missing');
    C.need(r.work_item&&r.work_item.classification==='SOURCE ACCEPTED','work classification');
    C.need(r.work_item.evidence_ids.includes(evidence.id),'acceptance reference missing');
    const ix=feed.work_items.findIndex(w=>w.id===r.work_item.id);if(ix<0)feed.work_items.push(clone(r.work_item));else{const old=feed.work_items[ix];C.need(old.lane===r.work_item.lane&&C.canonical(old.milestone_ids)===C.canonical(r.work_item.milestone_ids),'existing packet scope changed');feed.work_items[ix]={...clone(r.work_item),evidence_ids:[...new Set([...old.evidence_ids,...r.work_item.evidence_ids])]};}
    for(const id of r.work_item.milestone_ids){const m=feed.milestones.find(m=>m.id===id);C.need(m,'unmapped milestone');if(!m.work_item_ids.includes(r.work_item.id))m.work_item_ids.push(r.work_item.id);}
    // A source correction never changes a milestone disposition or its historical cutoff.
    const candidate=evidence.accepted_at||evidence.accepted_date,prior=feed.latest_accepted_engineering_event.at||feed.latest_accepted_engineering_event.date;
    if(candidate&&(!prior||candidate>=prior))feed.latest_accepted_engineering_event={at:evidence.accepted_at,date:evidence.accepted_date,precision:evidence.accepted_at?'second':'day',basis:evidence.title};
  }else if(r.kind==='MILESTONE_DISPOSITION'){
    C.need(evidence.classification==='MILESTONE DISPOSITION'&&r.explicit_milestone_authority===true,'milestone grant required');
    const next=r.milestone,ix=feed.milestones.findIndex(m=>m.id===next?.id);C.need(ix>=0&&next.label===feed.milestones[ix].label&&next.group===feed.milestones[ix].group,'governing milestone identity');
    C.need(next.evidence_ids.includes(evidence.id)&&evidence.accepted_at,'dated milestone evidence required');
    C.need(r.supersedes_sha256===hash(Buffer.from(C.canonical(feed.milestones[ix]))),'wrong previous disposition');
    C.need(next.state!=='VERIFIED COMPLETE'||(next.remaining.length===0&&next.children.every(c=>c.state==='VERIFIED COMPLETE')),'incomplete mandatory requirements');
    C.need(!feed.milestones[ix].evidence_at||Date.parse(evidence.accepted_at)>Date.parse(feed.milestones[ix].evidence_at),'out-of-order milestone disposition');
    feed.milestones[ix]=clone(next);feed.last_milestone_disposition_change={at:evidence.accepted_at,date:evidence.accepted_at.slice(0,10),precision:'second',basis:evidence.title};
    if(Date.parse(evidence.accepted_at)>Date.parse(feed.milestone_evidence_cutoff))feed.milestone_evidence_cutoff=evidence.accepted_at;
  }else throw new Error('unadmitted receipt kind');
  feed.evidence.push(clone(evidence));return true;
}
export async function build(registry,previous,checks,now=new Date().toISOString()){
  const feed=clone(registry.baseline);for(const receipt of registry.accepted_receipts||[])applyReceipt(feed,receipt);
  if(previous){await C.verify(previous);C.need(Date.parse(now)>=Date.parse(previous.generated_at),'generation clock rollback');C.need(registry.previous_feed_checksum===previous.checksum,'registry is not reconciled to latest published feed');for(const accepted of previous.evidence.filter(e=>['SOURCE ACCEPTED','MILESTONE DISPOSITION','INTEGRATION ACCEPTED'].includes(e.classification)))C.need(feed.evidence.some(e=>e.id===accepted.id&&C.canonical(e)===C.canonical(accepted)),'accepted evidence lost');
    const formal=m=>{const copy={...m};delete copy.work_item_ids;return C.canonical(copy);};
    for(const old of previous.milestones){const next=feed.milestones.find(m=>m.id===old.id);if(formal(old)!==formal(next))C.need((registry.accepted_receipts||[]).some(r=>r.kind==='MILESTONE_DISPOSITION'&&r.explicit_milestone_authority===true&&r.milestone?.id===old.id&&!previous.evidence.some(e=>e.id===r.public_record.id)&&r.supersedes_sha256===hash(Buffer.from(C.canonical(old)))&&C.canonical(r.milestone)===C.canonical(next)),'milestone changed without a new exact authorized disposition');}
  }
  feed.revision=previous?previous.revision+1:1;feed.generated_at=now;feed.last_evidence_check=now;feed.sources=checks;
  feed.checksum=await C.checksum(feed);await C.verify(feed);return feed;
}
async function actualChecks(registry){
  const now=()=>new Date().toISOString(),checks=[];
  let ok=0;for(const source of registry.local_git_sources||[]){try{const args=source.external_git?['--git-dir='+source.external_git]:['-C',source.root];const raw=execFileSync('git',[...args,'show','-s','--format=%T',source.commit],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();C.need(raw===source.tree,'source tree mismatch');ok++;}catch{checks.push({id:'git-'+source.id,label:source.label,checked_at:now(),status:'DEGRADED',note:'Frozen source identity could not be reverified; no source or milestone promotion.'});}}
  if(ok)checks.push({id:'local-git',label:'Accepted / candidate Git identities',checked_at:now(),status:'OK',note:ok+' frozen commit/tree identities rechecked. A Git commit alone is not an acceptance.'});
  for(const source of registry.private_exact_envelope_sources||[]){try{const raw=await readFile(source.private_path);C.need(raw.length===source.bytes&&hash(raw)===source.sha256,'exact envelope changed');checks.push({id:'envelope-'+source.packet,label:source.packet+' accepted source envelope',checked_at:now(),status:'OK',note:'Exact retained envelope byte count and SHA-256 rechecked. Independent local source acceptance is preserved; no integration or milestone promotion.'});}catch{checks.push({id:'envelope-'+source.packet,label:source.packet+' accepted source envelope',checked_at:now(),status:'DEGRADED',note:'Retained envelope could not be reverified on this check. Prior independent acceptance remains recorded; no new promotion.'});}}
  try{const response=await fetch('https://api.github.com/repos/RemoGroup/remospock/branches/gh-pages',{headers:{Accept:'application/vnd.github+json','User-Agent':'RoadToAlpha-status-check'},signal:AbortSignal.timeout(10000)});C.need(response.ok,'GitHub check');const data=await response.json();C.need(/^[0-9a-f]{40}$/.test(data.commit?.sha),'GitHub identity');checks.push({id:'github',label:'Public dashboard GitHub branch',checked_at:now(),status:'OK',note:'Public branch metadata read successfully; no completion inferred from branch activity.'});}catch{checks.push({id:'github',label:'Public dashboard GitHub branch',checked_at:now(),status:'UNAVAILABLE',note:'GitHub metadata check failed. Retained engineering evidence is not promoted.'});}
  // The connected Drive reader writes this private attestation only after a real check.
  const drive=registry.coordination_check;C.need(drive&&Date.parse(drive.checked_at)<=Date.now()+60000,'coordination attestation');
  const stale=Date.now()-Date.parse(drive.checked_at)>20*60000;
  checks.push({id:'coordination',label:'Authorized coordination receipts',checked_at:drive.checked_at,status:stale?'DEGRADED':drive.status,note:stale?'Coordination check is older than20minutes; retained receipts remain visible.':drive.note});
  return checks;
}
export async function refresh(registryPath,outputPath,previousPath=null){
  const registry=C.parseJSON(await readFile(registryPath,'utf8'));
  if(previousPath){registry.previous_feed_checksum=C.parseJSON(await readFile(previousPath,'utf8')).checksum;}
  const previous=previousPath?C.parseJSON(await readFile(previousPath,'utf8')):null;
  const checks=await actualChecks(registry);const feed=await build(registry,previous,checks);
  await mkdir(path.dirname(outputPath),{recursive:true});const temp=outputPath+'.pending';await writeFile(temp,JSON.stringify(feed,null,2)+'\n',{flag:'wx'});await rename(temp,outputPath);return feed;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const [registry,output,previous]=process.argv.slice(2);C.need(registry&&output,'private registry and output paths required');const f=await refresh(registry,output,previous);console.log(JSON.stringify({revision:f.revision,checksum:f.checksum,generated_at:f.generated_at,health:C.freshness(f),counts:C.counts(f),publication:'NONE'}));}catch(e){console.error('Status refresh refused: '+e.message);process.exitCode=2;}
}
