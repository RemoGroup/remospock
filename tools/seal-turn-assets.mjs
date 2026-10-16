import {readFile,writeFile,mkdir} from 'node:fs/promises';import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),digest=b=>'sha256-'+createHash('sha256').update(b).digest('base64');
await mkdir(new URL('supabase/functions/_shared/',root),{recursive:true});await writeFile(new URL('supabase/functions/_shared/turn-core.js',root),await readFile(new URL('turn-core.js',root)));
let html=await readFile(new URL('index.html',root),'utf8');
const style=html.match(/<style>([\s\S]*?)<\/style>/);if(!style)throw Error('Pinned style missing');const stylePolicy=/style-src (?:'|&#x27;)sha256-[^'&]+(?:'|&#x27;)/;if(!stylePolicy.test(html))throw Error('Pinned style policy missing');html=html.replace(stylePolicy,'style-src &#x27;'+digest(Buffer.from(style[1]))+'&#x27;');
for(const name of ['status-core.js','status.js','turn-core.js','turn-status.js']){
 const pin=digest(await readFile(new URL(name,root)));const pattern=new RegExp('(<script src="'+name.replaceAll('.','\\.')+'" integrity=")([^"]+)(")');const match=html.match(pattern);if(!match)throw Error('Missing pinned script '+name);const old=match[2];html=html.replaceAll(old,pin);
}
await writeFile(new URL('index.html',root),html);console.log('Browser script integrity pins and shared validator sealed.');
