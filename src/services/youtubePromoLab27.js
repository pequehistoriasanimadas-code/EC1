'use strict';
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const https=require('https');

const TTL_MS=24*60*60*1000;
const LEADS=new Set([5,7,10]);
const identityCache=new Map();

function clone(v){return v==null?v:JSON.parse(JSON.stringify(v));}
function normalizeLeadSeconds(value){const n=Math.round(Number(value)||0);return LEADS.has(n)?n:10;}
function normalizePromo(raw={}){
  const links=raw?.links&&typeof raw.links==='object'&&!Array.isArray(raw.links)?clone(raw.links):{};
  const videos=raw?.videos&&typeof raw.videos==='object'&&!Array.isArray(raw.videos)?clone(raw.videos):{};
  return{enabled:raw?.enabled===true,leadSeconds:normalizeLeadSeconds(raw?.leadSeconds),links,videos};
}
function parseYouTubeVideoId(value){
  const raw=String(value||'').trim();if(!raw)return'';
  try{
    const u=new URL(raw),host=u.hostname.toLowerCase().replace(/^www\./,'');let id='';
    if(host==='youtu.be')id=u.pathname.split('/').filter(Boolean)[0]||'';
    else if(host==='youtube.com'||host==='m.youtube.com'||host==='music.youtube.com'){
      if(u.pathname==='/watch')id=u.searchParams.get('v')||'';
      else{const p=u.pathname.split('/').filter(Boolean);if(['shorts','live','embed'].includes(p[0]))id=p[1]||'';}
    }
    return /^[A-Za-z0-9_-]{6,20}$/.test(id)?id:'';
  }catch{return'';}
}
function canonicalUrl(videoId){return videoId?`https://www.youtube.com/watch?v=${videoId}`:'';}
function hashParts(parts){const h=crypto.createHash('sha256');for(const p of parts)h.update(p);return h.digest('hex');}
function contentIdentity(item={}){
  const file=String(item.path||''),name=String(item.name||path.basename(file)||'').normalize('NFKC').toLocaleLowerCase('es');let st=null;
  try{st=fs.statSync(file);}catch{}
  const size=Math.max(0,Number(st?.size??item.sizeBytes)||0),mtime=Math.round(Number(st?.mtimeMs??item.mtimeMs)||0),cacheKey=`${file}|${size}|${mtime}`;
  if(identityCache.has(cacheKey))return identityCache.get(cacheKey);
  let digest='';
  if(file&&st?.isFile()){
    let fd=null;try{
      fd=fs.openSync(file,'r');const span=Math.min(65536,size),head=Buffer.alloc(span),tail=Buffer.alloc(span);if(span){fs.readSync(fd,head,0,span,0);fs.readSync(fd,tail,0,span,Math.max(0,size-span));}digest=hashParts([Buffer.from('gec-youtube-content-v1\0'),Buffer.from(String(size)),head,tail]);
    }catch{}finally{if(fd!==null)try{fs.closeSync(fd);}catch{}}
  }
  if(!digest)digest=hashParts([Buffer.from('gec-youtube-content-fallback-v1\0'),Buffer.from(name),Buffer.from('|'+String(size))]);
  const key=`ytc1_${digest}`;identityCache.set(cacheKey,key);return key;
}
function request(url,{timeoutMs=12000,binary=false}={}){
  return new Promise((resolve,reject)=>{
    let settled=false;const done=(err,val)=>{if(settled)return;settled=true;err?reject(err):resolve(val);};
    const req=https.get(url,{headers:{'User-Agent':'GEC-Automatic-News/2.0'}},res=>{
      const code=Number(res.statusCode)||0;if(code>=300&&code<400&&res.headers.location){res.resume();return request(new URL(res.headers.location,url).href,{timeoutMs,binary}).then(v=>done(null,v),done);}
      const chunks=[];let total=0;res.on('data',c=>{total+=c.length;if(total>12*1024*1024){req.destroy(new Error('Respuesta demasiado grande'));return;}chunks.push(c);});res.on('end',()=>{const buf=Buffer.concat(chunks);if(code<200||code>=300){let detail='';try{detail=JSON.parse(buf.toString('utf8'))?.error?.message||'';}catch{}return done(new Error(detail||`YouTube HTTP ${code}`));}done(null,{buffer:buf,contentType:String(res.headers['content-type']||''),statusCode:code});});
    });req.setTimeout(timeoutMs,()=>req.destroy(new Error('Tiempo de espera agotado al consultar YouTube')));req.on('error',done);
  });
}
function bestThumbnail(snippet={}){const t=snippet.thumbnails||{};for(const k of ['maxres','standard','high','medium','default'])if(t[k]?.url)return String(t[k].url);return'';}
async function fetchVideoSnippets(videoIds,apiKey){
  const ids=[...new Set((videoIds||[]).map(String).filter(x=>/^[A-Za-z0-9_-]{6,20}$/.test(x)))];if(!ids.length)return new Map();if(!String(apiKey||'').trim())throw new Error('Configura la API Key de YouTube');
  const out=new Map();
  for(let i=0;i<ids.length;i+=50){const batch=ids.slice(i,i+50),u=new URL('https://www.googleapis.com/youtube/v3/videos');u.searchParams.set('part','snippet');u.searchParams.set('id',batch.join(','));u.searchParams.set('key',String(apiKey).trim());const r=await request(u.href);let json;try{json=JSON.parse(r.buffer.toString('utf8'));}catch{throw new Error('YouTube devolvió una respuesta inválida');}for(const row of json.items||[]){const id=String(row?.id||''),s=row?.snippet||{};if(!id)continue;out.set(id,{videoId:id,canonicalUrl:canonicalUrl(id),title:String(s.title||'').trim(),channel:String(s.channelTitle||'').trim(),thumbnailUrl:bestThumbnail(s)});}}
  return out;
}
function extensionFor(contentType,url=''){const c=String(contentType||'').toLowerCase();if(c.includes('png'))return'.png';if(c.includes('webp'))return'.webp';if(c.includes('gif'))return'.gif';const ext=path.extname(new URL(url).pathname).toLowerCase();return['.jpg','.jpeg','.png','.webp','.gif'].includes(ext)?(ext==='.jpeg'?'.jpg':ext):'.jpg';}
async function downloadThumbnail(url,destinationBase){
  if(!url)throw new Error('El video no tiene miniatura disponible');const r=await request(url,{binary:true});if(!/^image\//i.test(r.contentType)||r.buffer.length<128)throw new Error('La miniatura de YouTube no es una imagen válida');const ext=extensionFor(r.contentType,url),dest=`${destinationBase}${ext}`,tmp=`${dest}.tmp-${process.pid}-${Date.now()}`;fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(tmp,r.buffer);try{fs.renameSync(tmp,dest);}catch{fs.copyFileSync(tmp,dest);try{fs.rmSync(tmp,{force:true});}catch{}}return dest;
}
function thumbnailDataUrl(file){try{const b=fs.readFileSync(file),ext=path.extname(file).toLowerCase(),mime=ext==='.png'?'image/png':ext==='.webp'?'image/webp':ext==='.gif'?'image/gif':'image/jpeg';return`data:${mime};base64,${b.toString('base64')}`;}catch{return'';}}
function needsRefresh(row,now=Date.now()){const at=Date.parse(row?.updatedAt||'');return!(at>0)||now-at>=TTL_MS;}

module.exports={TTL_MS,normalizeLeadSeconds,normalizePromo,parseYouTubeVideoId,canonicalUrl,contentIdentity,fetchVideoSnippets,downloadThumbnail,thumbnailDataUrl,needsRefresh};
