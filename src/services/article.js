const cheerio=require('cheerio');
const crypto=require('crypto');

const MAX_ARTICLE_BYTES=12*1024*1024;
const CTA_RE=/\b(?:consulta|revisa|conoce|mira|ingresa|entra|descubre|encuentra)\s+(?:todos?\s+los?\s+detalles?\s+)?(?:aquí|aca)|\b(?:más|mayor)\s+información\s+(?:aquí|aca)|\bhaz\s+clic\s+aquí/i;
async function readHtmlLimited(res,maxBytes=MAX_ARTICLE_BYTES){
  const declared=Number(res.headers.get('content-length')||0);if(declared>maxBytes)throw new Error(`contenido demasiado grande (${Math.ceil(declared/1048576)} MB)`);if(!res.body)return'';
  const reader=res.body.getReader(),decoder=new TextDecoder('utf-8');let total=0,out='';try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>maxBytes){try{await reader.cancel();}catch{}throw new Error(`contenido excede ${Math.round(maxBytes/1048576)} MB`);}out+=decoder.decode(value,{stream:true});}out+=decoder.decode();return out;}finally{try{reader.releaseLock();}catch{}}
}
function cleanText(value){return String(value||'').replace(/\s+/g,' ').trim();}
function fingerprint(value){return crypto.createHash('sha1').update(String(value||'')).digest('hex');}
function chooseContainer($){
  const selectors=['article','[itemprop="articleBody"]','.story-contents','.article-body','main'];let best=$('body'),bestScore=0;
  for(const sel of selectors){$(sel).each((_,el)=>{const node=$(el),paragraphs=node.find('p').filter((__,p)=>cleanText($(p).text()).length>30).length,chars=cleanText(node.text()).length,score=paragraphs*200+Math.min(chars,12000);if(score>bestScore){bestScore=score;best=node;}});}return best;
}
function structuredBlocks($,container){
  const out=[],seen=new Set();const push=(kind,text)=>{const value=cleanText(text);if(value.length<12)return;const key=value.toLowerCase();if(seen.has(key))return;seen.add(key);out.push(kind?`${kind}: ${value}`:value);};
  container.find('p,h2,h3,blockquote,ul li,ol li,table tr').each((_,el)=>{
    const tag=String(el.tagName||el.name||'').toLowerCase(),node=$(el);
    if(tag==='tr'){const cells=node.find('th,td').map((__,cell)=>cleanText($(cell).text())).get().filter(Boolean).slice(0,8);if(cells.length>=2)push('TABLA',cells.join(' | '));return;}
    const value=cleanText(node.text());if(tag==='h2'||tag==='h3')push('SUBTÍTULO',value);else if(tag==='li')push('LISTA',value);else if(tag==='blockquote')push('CITA',value);else push('',value);
  });
  return out;
}

async function fetchArticle(url){
  const value=String(url||'').trim();if(!/^https?:\/\//i.test(value))throw new Error('Artículo: URL inválida');let res;
  try{res=await fetch(value,{headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) EC-Automatic-News/0.3.14','Accept':'text/html,*/*'},redirect:'follow',signal:AbortSignal.timeout(25000)});}catch(e){throw new Error(`Artículo: ${e.name==='TimeoutError'?'tiempo de espera agotado':(e.message||e)}`);}
  if(!res.ok)throw new Error(`Artículo: HTTP ${res.status}`);const type=String(res.headers.get('content-type')||'');if(type&&!/html|text\//i.test(type))throw new Error(`Artículo: contenido no HTML (${type})`);let html;try{html=await readHtmlLimited(res);}catch(e){throw new Error(`Artículo: ${e.message||e}`);}
  const $=cheerio.load(html);$('script,style,noscript,svg,nav,footer,header,aside,form,iframe').remove();const meta=(key,attr='property')=>$(`meta[${attr}="${key}"]`).attr('content')||'',title=meta('og:title')||cleanText($('h1').first().text())||cleanText($('title').text()),image=meta('og:image'),description=meta('og:description')||meta('description','name')||'',category=meta('article:section')||'',author=meta('author','name')||cleanText($('[rel="author"]').first().text())||'';
  const container=chooseContainer($),rawContainerText=cleanText(container.text()),sourceHadCTA=CTA_RE.test(rawContainerText)||container.find('a').toArray().some(a=>CTA_RE.test(cleanText($(a).text()))),blocks=structuredBlocks($,container);
  let body=blocks.join('\n\n');if(body.length<180){body=$('p').map((_,el)=>cleanText($(el).text())).get().filter(t=>t.length>40).join('\n\n');}
  body=body.slice(0,30000);const contentFingerprint=fingerprint(`${title}\n${description}\n${body}`);
  return{title,image,description,category,author,body,sourceHadCTA,contentFingerprint,finalUrl:res.url||value};
}

module.exports={fetchArticle,readHtmlLimited,MAX_ARTICLE_BYTES,CTA_RE,structuredBlocks,fingerprint};