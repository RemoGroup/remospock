/* Isolated PostgreSQL qualification server; never connects to production. */
import http from 'node:http';import {readFile,writeFile,mkdir} from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';import {randomBytes} from 'node:crypto';import {createHandler} from '../supabase/functions/rta-turn-reporting/handler.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),privateDir=process.env.RTA_TEST_PRIVATE,database=process.env.RTA_TEST_DB||'postgres';if(!/^[a-z][a-z0-9_]*$/.test(database))throw Error('test database identity');
if(!privateDir)throw Error('private test directory required');await mkdir(privateDir,{recursive:true});
const keys={'spock-g1':{lane:'spock',secret:randomBytes(32).toString('hex')},'remocommand-g1':{lane:'remocommand',secret:randomBytes(32).toString('hex')}};
await writeFile(path.join(privateDir,'local-test-keys.json'),JSON.stringify(keys),{flag:'wx'});
const literal=s=>"'"+s.replaceAll("'","''")+"'";
const sql=q=>execFileSync('docker',['exec','-i','rta-turn-qualification-20261015','psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d',database],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const rpc=async(name,b)=>{if(name==='rta_read_turn_snapshot'){const result=sql('set role service_role; select coalesce(jsonb_agg(x),\'[]\'::jsonb) from public.rta_read_turn_snapshot() x;');return JSON.parse(result);}const q='set role service_role; select public.rta_record_turn_event('+[literal(b.p_writer),literal(b.p_lane),literal(JSON.stringify(b.p_event))+'::jsonb',literal(b.p_body_hash)].join(',')+');';return JSON.parse(sql(q));};
const api=createHandler({writerKeys:keys,origins:['http://127.0.0.1:8771','https://remogroup.github.io'],rpc});
let offline=false;
const server=http.createServer(async(req,res)=>{try{
 if(req.url==='/test/offline'){offline=req.method==='POST';res.writeHead(200);res.end('{}');return;}
 if(req.url?.startsWith('/report')){
  if(offline){res.writeHead(503);res.end('{}');return;}
  const chunks=[];for await(const chunk of req)chunks.push(chunk);const raw=Buffer.concat(chunks);const request=new Request('http://127.0.0.1:8771'+req.url,{method:req.method,headers:req.headers,...(raw.length?{body:raw}: {})});const result=await api(request);res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));return;
 }
 const name=req.url?.split('?')[0]==='/'?'index.html':decodeURIComponent(req.url?.split('?')[0].slice(1)||'index.html');const file=path.resolve(root,name);if(!file.startsWith(root+path.sep)||name.includes('..')||name.startsWith('.git'))throw Error('path');let bytes=await readFile(file);
 if(name==='index.html')bytes=Buffer.from(bytes.toString('utf8').replace('https://rrxazizrluzodkmgjbmy.supabase.co/functions/v1/rta-turn-reporting','http://127.0.0.1:8771/report'));
 res.writeHead(200,{'Content-Type':name.endsWith('.html')?'text/html':name.endsWith('.js')?'text/javascript':'application/json','Cache-Control':'no-store'});res.end(bytes);
 }catch{res.writeHead(500);res.end('Local qualification request failed.');}});
server.listen(8771,'127.0.0.1',()=>console.log(JSON.stringify({server:'LOCAL_QUALIFICATION_ONLY',port:8771,storage:'Native PostgreSQL 17',keys:'PRIVATE; NOT PRINTED'})));
