const cheerio = require('cheerio');

const MAX_ARTICLE_BYTES=12*1024*1024;
async function readHtmlLimited(res,maxBytes=MAX_ARTICLE_BYTES){
  const declared=Number(res.headers.get('content-length')||0);
  if(declared>maxBytes)throw new Error(`contenido demasiado grande (${Math.ceil(declared/1048576)} MB)`);
  if(!res.body)return'';
  const reader=res.body.getReader();const decoder=new TextDecoder('utf-8');let total=0,out='';
  try{
    while(true){
      const {done,value}=await reader.read();if(done)break;
      total+=value.byteLength;if(total>maxBytes){try{await reader.cancel();}catch{}throw new Error(`contenido excede ${Math.round(maxBytes/1048576)} MB`);}
      out+=decoder.decode(value,{stream:true});
    }
    out+=decoder.decode();return out;
  }finally{try{reader.releaseLock();}catch{}}
}

async function fetchArticle(url) {
  const value=String(url||'').trim();
  if(!/^https?:\/\//i.test(value))throw new Error('Artículo: URL inválida');
  let res;
  try {
    res = await fetch(value, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) EC-Automatic-News/0.3.11', 'Accept': 'text/html,*/*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(25000)
    });
  } catch (e) {
    throw new Error(`Artículo: ${e.name==='TimeoutError'?'tiempo de espera agotado':(e.message||e)}`);
  }
  if (!res.ok) throw new Error(`Artículo: HTTP ${res.status}`);
  const type=String(res.headers.get('content-type')||'');
  if(type && !/html|text\//i.test(type)) throw new Error(`Artículo: contenido no HTML (${type})`);
  let html;
  try{html=await readHtmlLimited(res);}catch(e){throw new Error(`Artículo: ${e.message||e}`);}
  const $ = cheerio.load(html);
  $('script,style,noscript,svg,nav,footer,header,aside').remove();
  const meta = (key, attr='property') => $(`meta[${attr}="${key}"]`).attr('content') || '';
  const title = meta('og:title') || $('h1').first().text().trim() || $('title').text().trim();
  const image = meta('og:image');
  const description = meta('og:description') || meta('description','name') || '';
  const category = meta('article:section') || '';
  const author = meta('author','name') || $('[rel="author"]').first().text().trim() || '';
  const candidates = ['article p','[itemprop="articleBody"] p','.story-contents p','.article-body p','main p'];
  let paragraphs = [];
  for (const sel of candidates) {
    const arr = $(sel).map((_,el)=>$(el).text().replace(/\s+/g,' ').trim()).get().filter(t=>t.length>30);
    if (arr.length >= 3) { paragraphs = arr; break; }
  }
  if (paragraphs.length < 3) paragraphs = $('p').map((_,el)=>$(el).text().replace(/\s+/g,' ').trim()).get().filter(t=>t.length>50);
  const unique = [];
  const seen = new Set();
  for (const p of paragraphs) { if (!seen.has(p)) { seen.add(p); unique.push(p); } }
  return { title, image, description, category, author, body: unique.join('\n\n').slice(0, 24000), finalUrl: res.url || value };
}

module.exports = { fetchArticle, readHtmlLimited, MAX_ARTICLE_BYTES };
