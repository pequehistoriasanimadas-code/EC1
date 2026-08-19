const { XMLParser } = require('fast-xml-parser');
const cheerio = require('cheerio');

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', trimValues: true });

function arrayify(v) { return v == null ? [] : (Array.isArray(v) ? v : [v]); }
function text(v) {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (typeof v === 'object' && '#text' in v) return String(v['#text']);
  return '';
}
function cleanHtml(s) {
  if (!s) return '';
  return cheerio.load(`<div>${s}</div>`)('div').text().replace(/\s+/g, ' ').trim();
}
function firstImageFromHtml(s) {
  if (!s) return '';
  const $ = cheerio.load(s);
  return $('img').first().attr('src') || $('img').first().attr('data-src') || '';
}
function mediaUrl(item) {
  const enclosure = item.enclosure;
  if (enclosure && enclosure['@_url']) return enclosure['@_url'];
  const keys = ['media:content', 'media:thumbnail', 'media_content', 'media_thumbnail'];
  for (const k of keys) {
    const v = item[k];
    const first = Array.isArray(v) ? v[0] : v;
    if (first && first['@_url']) return first['@_url'];
  }
  const encoded = item['content:encoded'] || item.encoded || '';
  return firstImageFromHtml(text(encoded)) || firstImageFromHtml(text(item.description));
}

function parseFeed(xml, feed) {
  const doc = parser.parse(xml);
  const channel = doc?.rss?.channel || doc?.feed || {};
  let items = arrayify(channel.item || channel.entry);
  return items.map((item, index) => {
    const link = typeof item.link === 'string' ? item.link : item.link?.['@_href'] || item.guid || '';
    return {
      id: `${feed.id}:${index}:${text(item.guid || link)}`,
      feedId: feed.id,
      feedName: feed.name,
      title: cleanHtml(text(item.title)),
      link: text(link),
      description: cleanHtml(text(item.description || item.summary || item.subtitle)),
      category: cleanHtml(text(item.category?.['@_term'] || item.category || '')),
      pubDate: text(item.pubDate || item.published || item.updated),
      author: cleanHtml(text(item['dc:creator'] || item.author?.name || item.author || '')),
      image: mediaUrl(item)
    };
  }).filter(x => x.title && x.link);
}

async function fetchFeed(feed) {
  const res = await fetch(feed.url, { headers: { 'User-Agent': 'Mozilla/5.0 EC-Automatic-News/1.0', 'Accept': 'application/rss+xml, application/xml, text/xml, */*' } });
  if (!res.ok) throw new Error(`RSS ${feed.name}: HTTP ${res.status}`);
  return parseFeed(await res.text(), feed);
}

async function loadAll(feeds) {
  const active = feeds.filter(f => f.enabled && f.url);
  const settled = await Promise.allSettled(active.map(fetchFeed));
  const items = [];
  const errors = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') items.push(...r.value);
    else errors.push({ feed: active[i].name, error: r.reason?.message || String(r.reason) });
  });
  const seen = new Set();
  const dedup = items.filter(x => {
    const key = x.link.trim();
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
  dedup.sort((a,b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
  return { items: dedup, errors };
}

module.exports = { parseFeed, fetchFeed, loadAll };
