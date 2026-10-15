import '../_shared/turn-core.js';
const C=globalThis.RTATurn;
const encoder=new TextEncoder();
const digest=async b=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(x=>x.toString(16).padStart(2,'0')).join('');
export async function signature(key,bytes){const k=await crypto.subtle.importKey('raw',encoder.encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);return [...new Uint8Array(await crypto.subtle.sign('HMAC',k,bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
function equal(a,b){if(a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0;}
export function createHandler({url,backendKey,writerKeys,origins,fetcher=fetch,now=()=>Date.now(),rpc=null}){
  const call=rpc|| (async(name,body)=>{const headers={apikey:backendKey,'Content-Type':'application/json'};if(backendKey.startsWith('eyJ'))headers.Authorization='Bearer '+backendKey;const r=await fetcher(url+'/rest/v1/rpc/'+name,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(1800)});if(!r.ok)throw Error('storage refused');return r.json();});
  return async req=>{
    const origin=req.headers.get('origin'),cors=origin&&origins.includes(origin)?{'Access-Control-Allow-Origin':origin,Vary:'Origin'}:{};
    const reply=(status,data)=>Response.json(data,{status,headers:{...cors,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    if(origin&&!origins.includes(origin))return reply(403,{error:'origin refused'});
    if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{...cors,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'content-type,x-rta-writer,x-rta-signature'}});
    try{
      if(req.method==='GET'){
        const result=await call('rta_read_turn_snapshot',{});C.need(Array.isArray(result)&&result.length<=128,'projection');for(const r of result)C.record(r,now());
        const body={v:1,generated_at:new Date(now()).toISOString(),cursor:Math.max(0,...result.map(r=>r.cursor)),records:result};body.checksum=await C.checksum(body);return reply(200,body);
      }
      if(req.method!=='POST')return reply(405,{error:'method refused'});
      if(req.headers.get('content-type')?.split(';')[0]!=='application/json')return reply(415,{error:'json required'});
      if(Number(req.headers.get('content-length')||0)>16384)return reply(413,{error:'size'});
      const reader=req.body?.getReader();C.need(reader,'body');let parts=[],length=0;while(true){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>16384){await reader.cancel();return reply(413,{error:'size'});}parts.push(value);}
      const bytes=new Uint8Array(length);let offset=0;for(const v of parts){bytes.set(v,offset);offset+=v.length;}
      const writer=req.headers.get('x-rta-writer')||'',sig=req.headers.get('x-rta-signature')||'',key=writerKeys[writer];
      if(!key||!['spock','remocommand'].includes(key.lane)||typeof key.secret!=='string'||key.secret.length<32||!/^[0-9a-f]{64}$/.test(sig)||!equal(sig,await signature(key.secret,bytes)))return reply(401,{error:'writer authentication refused'});
      const body=C.event(C.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),now());if(body.lane!==key.lane)return reply(403,{error:'lane refused'});
      // Old queued observations remain historical; received_at never refreshes their activity age.
      const result=await call('rta_record_turn_event',{p_writer:writer,p_lane:key.lane,p_event:body,p_body_hash:await digest(bytes)});
      C.need(result&&result.event_id===body.event_id&&Number.isSafeInteger(result.cursor),'receipt');return reply(200,result);
    }catch{return reply(409,{error:'event or storage verification refused'});}
  };
}
