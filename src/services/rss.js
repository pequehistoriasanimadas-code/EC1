const { XMLParser } = require('fast-xml-parser');
const cheerio = require('cheerio');

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
  cdataPropName: '#cdata'
});

const EC_LATEST_WEB = 'https://elcomercio.pe/feed/';

function arrayify(v) { return v == null ? [] : (Array.isArray(v) ? v : [v]); }
function text(v) {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.map(text).find(Boolean) || '';
  if (typeof v === 'object') {
    for (const k of ['#text', '#cdata', '__cdata', 'value', '@_href', '@_url']) {
      if (v[k] != null) {
        const t = text(v[k]);
        if (t) return t;
      }
    }
  }
  return '';
}
function cleanHtml(s) {
  if (!s) return '';
  return cheerio.load(`<div>${s}</div>`)('div').text().replace(/\s+/g, ' ').trim();
}
function firstImageFromHtml(s) {
  if (!s) return '';
  const $ = cheerio.load(String(s));
  return $('img').first().attr('src') || $('img').first().attr('data-src') || $('img').first().attr('data-lazy-src') || '';
}
function extractLink(item) {
  const values = arrayify(item?.link);
  for (const v of values) {
    if (typeof v === 'string') return v.trim();
    if (v && typeof v === 'object') {
      const href = v['@_href'] || v['@_url'] || v.href || v.url || v['#text'] || v['#cdata'];
      if (href) return String(href).trim();
    }
  }
  return text(item?.guid || item?.url || item?.loc).trim();
}
function mediaUrl(item) {
  const enclosure = Array.isArray(item?.enclosure) ? item.enclosure[0] : item?.enclosure;
  if (enclosure && (enclosure['@_url'] || enclosure.url)) return enclosure['@_url'] || enclosure.url;
  const keys = ['media:content', 'media:thumbnail', 'media_content', 'media_thumbnail', 'image'];
  for (const k of keys) {
    const first = Array.isArray(item?.[k]) ? item[k][0] : item?.[k];
    if (typeof first === 'string' && /^https?:/i.test(first)) return first;
    if (first && typeof first === 'object') {
      const u = first['@_url'] || first['@_href'] || first.url || first.href;
      if (u) return String(u);
    }
  }
  const encoded = text(item?.['content:encoded'] || item?.encoded || item?.content || '');
  return firstImageFromHtml(encoded) || firstImageFromHtml(text(item?.description));
}
function discoverEntries(doc) {
  const direct = [
    doc?.rss?.channel?.item,
    doc?.rss?.channel?.items?.item,
    doc?.channel?.item,
    doc?.feed?.entry,
    doc?.rdf?.item,
    doc?.['rdf:RDF']?.item
  ].flatMap(arrayify).filter(Boolean);
  if (direct.length) return direct;

  const found = [];
  const seen = new Set();
  function walk(node, depth=0) {
    if (!node || depth > 9) return;
    if (Array.isArray(node)) { node.forEach(x=>walk(x,depth+1)); return; }
    if (typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    const title = text(node.title);
    const link = extractLink(node);
    if (title && link && (node.description != null || node.summary != null || node.pubDate != null || node.published != null || node.guid != null)) {
      found.push(node);
      return;
    }
    Object.values(node).forEach(v=>walk(v,depth+1));
  }
  walk(doc);
  return found;
}
function parseFeed(xml, feed) {
  const doc = parser.parse(xml);
  const items = discoverEntries(doc);
  return items.map((item, index) => {
    const link = extractLink(item);
    return {
      id: `${feed.id}:${index}:${text(item.guid || link)}`,
      feedId: feed.id,
      feedName: feed.name,
      title: cleanHtml(text(item.title)),
      link,
      description: cleanHtml(text(item.description || item.summary || item.subtitle || item['media:description'])),
      category: cleanHtml(text(item.category?.['@_term'] || item.category || item['dc:subject'] || '')),
      pubDate: text(item.pubDate || item.published || item.updated || item['dc:date']),
      author: cleanHtml(text(item['dc:creator'] || item.author?.name || item.author || '')),
      image: mediaUrl(item)
    };
  }).filter(x => x.title && /^https?:\/\//i.test(x.link));
}
function parseHtmlLatest(html, feed, baseUrl=EC_LATEST_WEB) {
  const $ = cheerio.load(html);
  const out = [];
  const seen = new Set();
  $('h1 a[href],h2 a[href],h3 a[href],article a[href]').each((_,a)=>{
    if (out.length >= 120) return false;
    const href = $(a).attr('href') || '';
    let link='';
    try { link = new URL(href, baseUrl).href; } catch { return; }
    if (!/elcomercio\.pe/i.test(link) || seen.has(link)) return;
    const title = $(a).text().replace(/\s+/g,' ').trim();
    if (title.length < 18) return;
    seen.add(link);
    const article = $(a).closest('article,li,div');
    const description = article.find('p').first().text().replace(/\s+/g,' ').trim();
    const image = article.find('img').first().attr('src') || article.find('img').first().attr('data-src') || '';
    out.push({
      id:`${feed.id}:web:${out.length}:${link}`,
      feedId:feed.id, feedName:feed.name, title, link,
      description, category:'', pubDate:'', author:'', image
    });
  });
  return out;
}
function parseAlternateSource(source, feed, baseUrl=EC_LATEST_WEB) {
  let items=[];
  const looksXml=/xml/i.test(source.contentType||'') || /^\s*<\?xml|^\s*<(rss|feed|rdf:RDF)/i.test(source.body||'');
  if(looksXml){
    try{items=parseFeed(source.body,feed);}catch{}
    if(items.length)return {items,mode:'XML_FALLBACK',detail:`Usando fuente alternativa ${baseUrl}`};
  }
  if(/html/i.test(source.contentType||'') || /<html[\s>]/i.test(source.body||'')){
    items=parseHtmlLatest(source.body,feed,source.finalUrl||baseUrl);
    if(items.length)return {items,mode:'WEB_FALLBACK',detail:`Usando fuente alternativa ${baseUrl}`};
  }
  return {items:[],mode:'UNRECOGNIZED',detail:`La fuente alternativa ${baseUrl} no contiene noticias reconocibles`};
}
function isEcLatestArc(url='') {
  return /elcomercio\.pe\/arc\/outboundfeeds\/rss\/category\/ultimas-noticias/i.test(url);
}
async function requestText(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 EC-Automatic-News/0.3',
      'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html, */*'
    },
    redirect:'follow',
    signal:AbortSignal.timeout(20000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return {body:await res.text(), contentType:res.headers.get('content-type')||'', finalUrl:res.url||url};
}
async function fetchFeedDetailed(feed) {
  let primary;
  try {
    primary = await requestText(feed.url);
  } catch (e) {
    if (!isEcLatestArc(feed.url)) throw new Error(`RSS ${feed.name}: ${e.message}`);
    const alt = await requestText(EC_LATEST_WEB);
    const fallback=parseAlternateSource(alt,feed,EC_LATEST_WEB);
    if (!fallback.items.length) throw new Error(`RSS ${feed.name}: ${e.message}; fuente alternativa sin resultados`);
    return fallback;
  }

  let items=[];
  let parseError='';
  const looksXml = /xml/i.test(primary.contentType) || /^\s*<\?xml|^\s*<(rss|feed|rdf:RDF)/i.test(primary.body);
  if (looksXml) {
    try { items = parseFeed(primary.body, feed); } catch (e) { parseError=e.message; }
    if (items.length) return {items, mode:'XML', detail:'RSS XML reconocido'};
  }

  if (/html/i.test(primary.contentType) || /<html[\s>]/i.test(primary.body)) {
    items=parseHtmlLatest(primary.body,feed,primary.finalUrl||feed.url);
    if(items.length) return {items,mode:'HTML',detail:'Fuente web reconocida'};
  }

  if (isEcLatestArc(feed.url)) {
    try {
      const alt = await requestText(EC_LATEST_WEB);
      const fallback=parseAlternateSource(alt,feed,EC_LATEST_WEB);
      if (fallback.items.length) return fallback;
    } catch (e) {
      parseError = parseError || e.message;
    }
  }
  return {items:[], mode:'UNRECOGNIZED', detail:parseError ? `Formato no reconocido: ${parseError}` : 'Fuente accesible, pero no se encontraron noticias reconocibles'};
}
async function fetchFeed(feed) { return (await fetchFeedDetailed(feed)).items; }
async function testFeed(feed) {
  const r=await fetchFeedDetailed(feed);
  return {ok:r.items.length>0,count:r.items.length,mode:r.mode,detail:r.detail};
}
async function loadAll(feeds) {
  const active = feeds.filter(f => f.enabled && f.url);
  const settled = await Promise.allSettled(active.map(fetchFeedDetailed));
  const items = [], errors = [], feedStatus=[];
  settled.forEach((r, i) => {
    const feed=active[i];
    if (r.status === 'fulfilled') {
      items.push(...r.value.items);
      feedStatus.push({id:feed.id,name:feed.name,ok:r.value.items.length>0,count:r.value.items.length,mode:r.value.mode,detail:r.value.detail});
    } else {
      const error=r.reason?.message || String(r.reason);
      errors.push({ feed: feed.name, error });
      feedStatus.push({id:feed.id,name:feed.name,ok:false,count:0,mode:'ERROR',detail:error});
    }
  });
  const seen = new Set();
  const dedup = items.filter(x => {
    const key = x.link.trim();
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  });
  dedup.sort((a,b) => {
    const da=Date.parse(a.pubDate||'')||0, db=Date.parse(b.pubDate||'')||0;
    return db-da;
  });
  return { items: dedup, errors, feedStatus };
}

module.exports = { parseFeed, parseHtmlLatest, fetchFeed, fetchFeedDetailed, testFeed, loadAll };
