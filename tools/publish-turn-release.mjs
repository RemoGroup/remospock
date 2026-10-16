/* Exact static release/rollback; preserves the current verified JSON feed. Dry run by default. */
import {execFileSync} from 'node:child_process';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const C=createRequire(import.meta.url)('../status-core.js');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const repository='RemoGroup/remospock',branch='gh-pages',feed='road-to-alpha-status.json',packet='RTA-PER-TURN-REPORTING-P0-g0001';
const hash=b=>createHash('sha256').update(b).digest('hex');
const git=(...args)=>execFileSync('git',['-C',root,...args],{stdio:['ignore','pipe','ignore']});
export function transition(current,from,to){
 C.need(C.canonical(current)===C.canonical(from),'static predecessor drift');
 return [...new Set([...Object.keys(from),...Object.keys(to)])].filter(p=>from[p]!==to[p]).map(p=>({path:p,mode:'100644',type:'blob',sha:to[p]||null}));
}
export async function publish(grantFile,{execute=false,rollback=false}={}){
 const g=C.parseJSON(await readFile(grantFile,'utf8'));
 C.need((!execute||g.authorized===true)&&g.owner==='Tim Stoner'&&g.packet===packet&&g.repository===repository&&g.branch===branch,'exact activation grant required');
 const candidate=git('rev-parse','HEAD').toString().trim();C.need(candidate===g.source_commit,'frozen source mismatch');
 const from=rollback?g.candidate_public_tree:g.previous_public_tree,to=rollback?g.previous_public_tree:g.candidate_public_tree;
 C.need(from&&to&&!Object.hasOwn(from,feed)&&!Object.hasOwn(to,feed),'static grant maps required');
 const api=(endpoint)=>JSON.parse(execFileSync('gh',['api',endpoint],{encoding:'utf8',stdio:['ignore','pipe','ignore']}));
 const reference=api('repos/'+repository+'/git/ref/heads/'+branch),parent=reference.object.sha,tree=api('repos/'+repository+'/git/trees/'+parent+'?recursive=1');C.need(!tree.truncated,'complete tree required');
 C.need(tree.tree.every(x=>x.type==='blob'||x.type==='tree'),'unexpected tree object');
 const current=Object.fromEntries(tree.tree.filter(x=>x.type==='blob'&&x.path!==feed).map(x=>[x.path,x.sha]));const changes=transition(current,from,to);C.need(changes.length>0,'no release change');
 const prior=api('repos/'+repository+'/contents/'+feed+'?ref='+parent),bytes=Buffer.from(prior.content.replace(/\s/g,''),'base64');await C.verify(C.parseJSON(bytes.toString('utf8')));
 const manifest=g.candidate_sha256;C.need(manifest&&Object.keys(manifest).length===Object.keys(g.candidate_public_tree).length,'full candidate manifest required');
 for(const [p,digest] of Object.entries(manifest)){C.need(!p.includes('..')&&!path.isAbsolute(p),'manifest path');const b=git('show',candidate+':'+p);C.need(hash(b)===digest,'candidate byte drift');C.need(createHash('sha1').update(Buffer.concat([Buffer.from('blob '+b.length+'\0'),b])).digest('hex')===g.candidate_public_tree[p],'candidate blob identity');}
 const result={mode:execute?'EXECUTE':'DRY_RUN',direction:rollback?'ROLLBACK':'RELEASE',expected_parent:parent,changed_paths:changes.map(x=>x.path),preserved_feed_sha256:hash(bytes)};
 if(!execute)return result;
 const temp=await mkdtemp(path.join(tmpdir(),'rta-static-'));
 const post=async(endpoint,body,method='POST')=>{const file=path.join(temp,'request.json');await writeFile(file,JSON.stringify(body));return JSON.parse(execFileSync('gh',['api','--method',method,'repos/'+repository+'/'+endpoint,'--input',file],{encoding:'utf8',stdio:['ignore','pipe','ignore']}));};
 try{
  for(const change of changes){if(!change.sha)continue;const ref=rollback?g.previous_source_commit:candidate;const b=git('show',ref+':'+change.path);const expected=change.sha;const blob=await post('git/blobs',{content:b.toString('base64'),encoding:'base64'});C.need(blob.sha===expected,'uploaded blob identity');}
  const t=await post('git/trees',{base_tree:tree.sha,tree:changes}),commit=await post('git/commits',{message:(rollback?'Rollback':'Activate')+' bounded per-turn reporting',tree:t.sha,parents:[parent]});
  await post('git/refs/heads/'+branch,{sha:commit.sha,force:false},'PATCH');
  const verified=api('repos/'+repository+'/git/trees/'+commit.sha+'?recursive=1');C.need(!verified.truncated,'readback tree');C.need(C.canonical(Object.fromEntries(verified.tree.filter(x=>x.type==='blob'&&x.path!==feed).map(x=>[x.path,x.sha])))===C.canonical(to),'static readback');C.need(verified.tree.find(x=>x.path===feed)?.sha===prior.sha,'feed preservation');
  return {...result,commit:commit.sha,tree:t.sha,github_verified:true,pages_readback:'REQUIRED BEFORE ACTIVATION IS QUALIFIED'};
 }finally{C.need(path.resolve(temp).startsWith(path.resolve(tmpdir())+path.sep)&&path.basename(temp).startsWith('rta-static-'),'temporary cleanup ceiling');await rm(temp,{recursive:true,force:true});}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const [grant,...flags]=process.argv.slice(2);C.need(grant&&flags.every(x=>['--execute','--rollback'].includes(x)),'grant and bounded flags required');console.log(JSON.stringify(await publish(grant,{execute:flags.includes('--execute'),rollback:flags.includes('--rollback')})));}catch(e){console.error('Static reporting publication refused: '+e.message);process.exitCode=2;}
}
