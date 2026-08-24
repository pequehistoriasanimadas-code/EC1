const cheerio=require('cheerio');
const crypto=require('crypto');

const MAX_ARTICLE_BYTES=12*1024*1024;
const CTA_RE=/\b(?:consulta|revisa|conoce|mira|ingresa|entra|descubre|encuentra)\s+(?:todos?\s+los?\s+detalles?\s+)?(?:aquí|aca)|\b(?:más|mayor)\s+información\s+(?:aquí|aca)|\bhaz\s+clic\s+aquí/i;
const ARTICLE_SELECTORS=['article','[itemprop="articleBody"]','[data-testid="article-body"]','.story-contents','.story-content','.article-body','.article__body','.article-content','.nota-body','.content-body','main'];
async function readHtmlLimited(res,maxBytes=MAX_ARTICLE_BYTES){
  const declared=Number(res.headers.get('content-length')||0);if(declared>maxBytes)throw new Error(`contenido demasiado grande (${Math.ceil(declared/1048576)} MB)`);if(!res.body)return'';
  const reader=res.body.getReader(),decoder=new TextDecoder('utf-8');let total=0,out='';try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>maxBytes){try{await reader.cancel();}catch{}throw new Error(`contenido excede ${Math.round(maxBytes/1048576)} MB`);}out+=decoder.decode(value,{stream:true});}out+=decoder.decode();return out;}finally{try{reader.releaseLock();}catch{}}
}
function cleanText(value){return String(value||'').replace(/\s+/g,' ').trim();}
function fingerprint(value){return crypto.createHash('sha1').update(String(value||'')).digest('hex');}
function chooseContainer($){
  let best=$('body'),bestScore=0;
  for(const sel of ARTICLE_SELECTORS){$(sel).each((_,el)=>{const node=$(el),paragraphs=node.find('p').filter((__,p)=>cleanText($(p).text()).length>30).length,chars=cleanText(node.text()).length,score=paragraphs*220+Math.min(chars,16000);if(score>bestScore){bestScore=score;best=node;}});}return best;
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
function globalParagraphBody($){
  const reject=/^(lee también|también puedes leer|te puede interesar|suscríbete|regístrate|publicidad|newsletter|síguenos|contenido patrocinado|recomendamos|últimas noticias)/i,seen=new Set(),out=[];
  $('p').each((_,el)=>{const t=cleanText($(el).text());if(t.length<40||reject.test(t))return;const k=t.toLowerCase();if(seen.has(k))return;seen.add(k);out.push(t);});return out.join('\n\n');
}
function jsonLdBodies($){
  const found=[];const visit=v=>{if(!v)return;if(Array.isArray(v)){v.forEach(visit);return;}if(typeof v!=='object')return;for(const [k,val] of Object.entries(v)){if((k==='articleBody'||k==='text')&&typeof val==='string'){const t=cleanText(val);if(t.length>=120)found.push(t);}else if(val&&typeof val==='object')visit(val);}};
  $('script[type="application/ld+json"]').each((_,el)=>{const raw=$(el).contents().text();if(!raw)return;try{visit(JSON.parse(raw));}catch{}});return found.sort((a,b)=>b.length-a.length);
}
function absoluteUrl(href,base){try{return new URL(String(href||''),base).href;}catch{return'';}}
function parseArticleHtml(html,pageUrl){
  const $=cheerio.load(html),ampHref=$('link[rel="amphtml"]').first().attr('href')||'',jsonBodies=jsonLdBodies($);
  const meta=(key,attr='property')=>$(`meta[${attr}="${key}"]`).attr('content')||'',title=meta('og:title')||cleanText($('h1').first().text())||cleanText($('title').text()),image=meta('og:image'),description=meta('og:description')||meta('description','name')||'',category=meta('article:section')||'',author=meta('author','name')||cleanText($('[rel="author"]').first().text())||'';
  $('script,style,noscript,svg,nav,footer,header,aside,form,iframe').remove();const container=chooseContainer($),rawContainerText=cleanText(container.text()),sourceHadCTA=CTA_RE.test(rawContainerText)||container.find('a').toArray().some(a=>CTA_RE.test(cleanText($(a).text()))),blocks=structuredBlocks($,container);
  let body=blocks.join('\n\n'),mode='article';const globalBody=globalParagraphBody($),jsonBody=jsonBodies[0]||'';
  if(globalBody.length>body.length*1.35&&globalBody.length>500){body=globalBody;mode='global-paragraphs';}
  if(jsonBody.length>body.length*1.15&&jsonBody.length>500){body=jsonBody;mode='jsonld';}
  if(body.length<180&&globalBody.length>body.length){body=globalBody;mode='global-paragraphs';}
  if(body.length<120&&jsonBody.length>body.length){body=jsonBody;mode='jsonld';}
  body=body.slice(0,30000);return{title,image,description,category,author,body,sourceHadCTA,ampUrl:absoluteUrl(ampHref,pageUrl),extractionMode:mode};
}
async function fetchHtmlPage(url,timeoutMs=25000){
  let res;try{res=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) EC-Automatic-News/0.3.21','Accept':'text/html,*/*','Accept-Language':'es-PE,es;q=0.9,en;q=0.6'},redirect:'follow',signal:AbortSignal.timeout(timeoutMs)});}catch(e){throw new Error(`Artículo: ${e.name==='TimeoutError'?'tiempo de espera agotado':(e.message||e)}`);}
  if(!res.ok)throw new Error(`Artículo: HTTP ${res.status}`);const type=String(res.headers.get('content-type')||'');if(type&&!/html|text\//i.test(type))throw new Error(`Artículo: contenido no HTML (${type})`);let html;try{html=await readHtmlLimited(res);}catch(e){throw new Error(`Artículo: ${e.message||e}`);}return{html,finalUrl:res.url||url};
}
function extractionLabel(mode,chars,ampUsed=false){if(chars<300)return ampUsed?`AMP breve · ${chars} caracteres`:`Extracción breve · ${chars} caracteres`;if(mode==='jsonld')return`JSON-LD · ${chars} caracteres`;if(ampUsed)return`Artículo AMP · ${chars} caracteres`;return`Artículo completo · ${chars} caracteres`;}
async function fetchArticle(url){
  const value=String(url||'').trim();if(!/^https?:\/\//i.test(value))throw new Error('Artículo: URL inválida');const first=await fetchHtmlPage(value),primary=parseArticleHtml(first.html,first.finalUrl);let selected=primary,finalUrl=first.finalUrl,ampUsed=false;
  if(primary.body.length<700&&primary.ampUrl&&primary.ampUrl!==first.finalUrl){
    try{const amp=await fetchHtmlPage(primary.ampUrl,18000),parsed=parseArticleHtml(amp.html,amp.finalUrl);if(parsed.body.length>primary.body.length+180||parsed.body.length>=700){selected={...parsed,image:parsed.image||primary.image,title:parsed.title||primary.title,description:parsed.description||primary.description,category:parsed.category||primary.category,author:parsed.author||primary.author,sourceHadCTA:parsed.sourceHadCTA||primary.sourceHadCTA};finalUrl=amp.finalUrl;ampUsed=true;}}catch{}
  }
  const sourceChars=String(selected.body||'').length,extractionWarning=sourceChars<300,contentFingerprint=fingerprint(`${selected.title}\n${selected.description}\n${selected.body}`),extractionLabelText=extractionLabel(selected.extractionMode,sourceChars,ampUsed);
  return{title:selected.title,image:selected.image,description:selected.description,category:selected.category,author:selected.author,body:selected.body,sourceHadCTA:selected.sourceHadCTA,contentFingerprint,finalUrl,sourceChars,extractionMode:ampUsed?'amp':selected.extractionMode,extractionWarning,extractionLabel:extractionLabelText,ampUsed};
}

module.exports={fetchArticle,readHtmlLimited,MAX_ARTICLE_BYTES,CTA_RE,structuredBlocks,fingerprint,parseArticleHtml,jsonLdBodies,globalParagraphBody};
