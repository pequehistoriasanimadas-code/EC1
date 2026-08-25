'use strict';

const cheerio=require('cheerio');

const CACHE_TTL_MS=10*60*1000;
const CACHE_MAX=300;
const MAX_BYTES=4*1024*1024;
const cache=new Map();
const STRONG_LOCK_RE=/(?:\bsolo\s+(?:para\s+)?suscriptores?\b|\bexclusiv[oa]\s+(?:para\s+)?suscriptores?\b|\bcontenido\s+(?:exclusivo|premium)\s+(?:para\s+)?suscriptores?\b|\bsuscr[ií]bete\s+(?:para|y)\s+(?:continuar|seguir|leer)(?:\s+leyendo)?\b|\binicia\s+sesi[oó]n\s+para\s+(?:continuar|leer)(?:\s+leyendo)?\b|\bsubscriber\s+only\b|\bmembers?\s+only\b)/i;

function cleanText(value){return String(value||'').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/\s+/g,' ').trim();}
function normalizeDate(value){const raw=cleanText(value);if(!raw)return'';const d=new Date(raw);return Number.isNaN(d.getTime())?'':d.toISOString();}
function walk(value,fn,depth=0){if(value==null||depth>10)return;if(Array.isArray(value)){value.forEach(x=>walk(x,fn,depth+1));return;}if(typeof value!=='object')return;fn(value);for(const v of Object.values(value))if(v&&typeof v==='object')walk(v,fn,depth+1);}
function jsonLdObjects($){const out=[];$('script[type="application/ld+json"]').each((_,el)=>{try{const parsed=JSON.parse($(el).contents().text());Array.isArray(parsed)?out.push(...parsed):out.push(parsed);}catch{}});return out;}
function parseArticleMetadata(html,pageUrl=''){
  const $=cheerio.load(String(html||'')),objects=jsonLdObjects($),meta=(selector,attr='content')=>cleanText($(selector).first().attr(attr)||'');
  let jsonDate='',jsonDescription='';
  for(const obj of objects)walk(obj,node=>{if(!jsonDate&&node.datePublished)jsonDate=String(node.datePublished);if(!jsonDescription&&typeof node.description==='string')jsonDescription=node.description;});
  const pubDate=normalizeDate(
    meta('meta[property="article:published_time"]')||
    meta('meta[name="article:published_time"]')||
    meta('meta[itemprop="datePublished"]')||
    meta('meta[name="datePublished"]')||
    meta('meta[name="parsely-pub-date"]')||
    jsonDate||
    $('time[datetime]').first().attr('datetime')||''
  );
  const description=cleanText(
    meta('meta[property="og:description"]')||
    meta('meta[name="description"]')||
    meta('meta[name="twitter:description"]')||
    jsonDescription
  ).slice(0,1600);
  // Use HTML rather than .text() so adjacent block elements keep a separator;
  // otherwise “suscriptores” + the next block can concatenate and hide a word boundary.
  const visibleText=cleanText($('body').html()||$('body').text()).slice(0,80000);
  const strongLock=STRONG_LOCK_RE.test(visibleText);
  return{pubDate,description,publicPreview:description,strongLock,pageUrl:String(pageUrl||'')};
}
async function readLimited(res){if(!res.body)return'';const reader=res.body.getReader(),decoder=new TextDecoder('utf-8');let total=0,out='';try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>MAX_BYTES){try{await reader.cancel();}catch{}break;}out+=decoder.decode(value,{stream:true});}out+=decoder.decode();return out;}finally{try{reader.releaseLock();}catch{}}}
function getCached(url){const x=cache.get(url);if(!x)return null;if(Date.now()-x.at>CACHE_TTL_MS){cache.delete(url);return null;}return x.value;}
function putCached(url,value){cache.set(url,{at:Date.now(),value});while(cache.size>CACHE_MAX)cache.delete(cache.keys().next().value);}
async function fetchArticleMetadata(url,timeoutMs=15000){
  const key=String(url||'').trim();if(!/^https?:\/\//i.test(key))return{pubDate:'',description:'',publicPreview:'',strongLock:false,pageUrl:key};
  const cached=getCached(key);if(cached)return cached;
  let result={pubDate:'',description:'',publicPreview:'',strongLock:false,pageUrl:key};
  try{
    const res=await fetch(key,{headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) EC-Automatic-News/0.3.24','Accept':'text/html,*/*','Accept-Language':'es-PE,es;q=0.9'},redirect:'follow',signal:AbortSignal.timeout(timeoutMs)});
    if(res.ok){const html=await readLimited(res);result=parseArticleMetadata(html,res.url||key);}
  }catch{}
  putCached(key,result);return result;
}

module.exports={fetchArticleMetadata,parseArticleMetadata,normalizeDate,STRONG_LOCK_RE};
