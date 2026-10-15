/* Exactly one public path, using existing gh authentication and a separate owner grant. */
import {readFile,mkdtemp,writeFile,unlink,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const C=createRequire(import.meta.url)('../status-core.js');
const sha=b=>createHash('sha256').update(b).digest('hex');
const repository='RemoGroup/remospock',branch='gh-pages',feedPath='road-to-alpha-status.json';
export function validateGrant(grant,sourceHashes){
  C.need(grant.authorized===true&&grant.owner==='Tim Stoner'&&grant.repository===repository&&grant.branch===branch,'exact public feed grant missing');
  C.need(grant.allowed_public_paths?.length===1&&grant.allowed_public_paths[0]===feedPath,'publication path ceiling');
  for(const [file,digest] of Object.entries(sourceHashes))C.need(grant.source_sha256?.[file]===digest,'updater source changed after grant');
  C.need(grant.approved_public_tree&&typeof grant.approved_public_tree==='object','approved static tree missing');
  return true;
}
export async function publish(feedFile,grantFile,{execute=false,api=null}={}){
  const files=['status-core.js','tools/refresh-status.mjs','tools/publish-status.mjs'],root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const hashes={};for(const name of files)hashes[name]=sha(await readFile(path.join(root,name)));
  const grant=C.parseJSON(await readFile(grantFile,'utf8'));validateGrant(grant,hashes);
  const bytes=await readFile(feedFile),feed=C.parseJSON(bytes.toString('utf8'));await C.verify(feed);
  C.need(Date.now()-Date.parse(feed.generated_at)<5*60000,'fresh verified build required');
  const call=api||((endpoint)=>JSON.parse(execFileSync('gh',['api',endpoint],{encoding:'utf8',stdio:['ignore','pipe','ignore']})));
  const reference=await call('repos/'+repository+'/git/ref/heads/'+branch),tree=await call('repos/'+repository+'/git/trees/'+reference.object.sha+'?recursive=1');
  C.need(!tree.truncated,'complete public tree required');
  const actual=Object.fromEntries(tree.tree.filter(x=>x.type==='blob'&&x.path!==feedPath).map(x=>[x.path,x.sha]));
  C.need(C.canonical(actual)===C.canonical(grant.approved_public_tree),'published static tree differs from exact approved package');
  const prior=await call('repos/'+repository+'/contents/'+feedPath+'?ref='+branch);const previous=C.parseJSON(Buffer.from(prior.content.replace(/\s/g,''),'base64').toString('utf8'));await C.verify(previous);
  C.need(feed.revision===previous.revision+1&&Date.parse(feed.generated_at)>=Date.parse(previous.generated_at),'feed predecessor mismatch');
  for(const old of previous.evidence.filter(e=>['SOURCE ACCEPTED','INTEGRATION ACCEPTED','MILESTONE DISPOSITION'].includes(e.classification)))C.need(feed.evidence.some(e=>e.id===old.id&&C.canonical(e)===C.canonical(old)),'accepted evidence removed');
  const body={message:'Refresh sanitized Road-to-Alpha engineering evidence',branch,sha:prior.sha,content:bytes.toString('base64')};
  if(!execute)return {mode:'DRY_RUN',path:feedPath,revision:feed.revision,sha256:sha(bytes),expected_parent:reference.object.sha};
  C.need(!api,'injected API may not publish');const temp=await mkdtemp(path.join(tmpdir(),'rta-feed-'));
  try{const request=path.join(temp,'request.json');await writeFile(request,JSON.stringify(body),{flag:'wx'});const result=JSON.parse(execFileSync('gh',['api','--method','PUT','repos/'+repository+'/contents/'+feedPath,'--input',request],{encoding:'utf8',stdio:['ignore','pipe','ignore']}));C.need(result.commit?.sha&&result.content?.sha,'publication receipt missing');const readback=await call('repos/'+repository+'/contents/'+feedPath+'?ref='+branch);C.need(sha(Buffer.from(readback.content.replace(/\s/g,''),'base64'))===sha(bytes),'published bytes mismatch');return {mode:'PUBLISHED',path:feedPath,commit:result.commit.sha,revision:feed.revision,sha256:sha(bytes)};}finally{await unlink(path.join(temp,'request.json')).catch(()=>{});await rmdir(temp).catch(()=>{});}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const [feed,grant,flag]=process.argv.slice(2);C.need(feed&&grant&&(!flag||flag==='--execute'),'feed, exact grant, optional --execute required');console.log(JSON.stringify(await publish(feed,grant,{execute:flag==='--execute'})));}catch(e){console.error('Public feed publication refused: '+e.message);process.exitCode=2;}
}
