const assert=require('assert');
const fs=require('fs');
const path=require('path');
const {parseFeedDetailed,parseHtmlGeneric}=require('../src/services/rss');
const {parseArticleHtml}=require('../src/services/article');
const {applyClosings}=require('../src/services/automation0324');

function ok(name,fn){try{fn();console.log(`OK 0324 · ${name}`);}catch(e){console.error(`FAIL 0324 · ${name}: ${e.message}`);throw e;}}

ok('RSS diagnostics preserve raw and parsed counts',()=>{
  const xml=`<?xml version="1.0"?><rss><channel><item><title>Noticia uno suficientemente larga</title><link>https://medio.test/a</link><description>Resumen uno</description></item><item><title>Noticia dos suficientemente larga</title><link>https://medio.test/b</link><description>Resumen dos</description></item></channel></rss>`;
  const r=parseFeedDetailed(xml,{id:'x',name:'Medio',url:'https://medio.test/rss'});assert.equal(r.rawCount,2);assert.equal(r.parsedCount,2);assert.equal(r.items[0].sourceType,'RSS');
});

ok('generic WEB section parser extracts publisher links only',()=>{
  const html=`<html><body><main><article><h2><a href="/politica/nota-a">Primera noticia relevante del medio para probar</a></h2><p>Bajada informativa de la primera nota.</p></article><article><h2><a href="https://medio.test/economia/nota-b">Segunda noticia relevante del medio para probar</a></h2><p>Bajada informativa de la segunda nota.</p></article><article><h2><a href="https://otro.test/no">Enlace externo que no debe entrar al detector</a></h2></article></main></body></html>`;
  const items=parseHtmlGeneric(html,{id:'web',name:'Medio',url:'https://medio.test/seccion'},'https://medio.test/seccion');assert.equal(items.length,2);assert(items.every(x=>x.sourceType==='WEB'));assert(items.some(x=>/nota-a/.test(x.link)));
});

ok('premium detection recognizes schema and publisher',()=>{
  const html=`<html><head><meta property="og:site_name" content="Diario Prueba"><script type="application/ld+json">{"@type":"NewsArticle","isAccessibleForFree":false,"articleBody":"Texto factual de una noticia suficientemente extensa para la prueba de extracción. Este contenido contiene datos y contexto periodístico adicionales para superar el mínimo de lectura del extractor."}</script></head><body><article><h1>Nota exclusiva</h1><p>Solo para suscriptores. Suscríbete para continuar.</p></article></body></html>`;
  const a=parseArticleHtml(html,'https://medio.test/premium/nota');assert.equal(a.access.status,'SUBSCRIBER_ONLY');assert.equal(a.publisher.name,'Diario Prueba');
});

ok('liveblog extracts a factual earthquake and ignores generic context',()=>{
  const html=`<html><body class="liveblog"><main><div class="liveblog"><article class="update"><time datetime="2026-08-25T11:02:59-05:00"></time><h3>Sismo en San Andrés - Santander, Colombia</h3><p>Magnitud: 2.8. Profundidad: 165 km. Hora local: 2026-08-25 11:02:59. Latitud: 6.79°. Longitud: -72.88°.</p></article><article class="update"><time datetime="2026-08-25T10:00:00-05:00"></time><p>Recuerda preparar una mochila de emergencia y mantener la calma.</p></article></div></main></body></html>`;
  const a=parseArticleHtml(html,'https://medio.test/sismos-lbposting-noticia/');assert(a.isLiveBlog);assert(a.liveEvent);assert.equal(a.liveEvent.magnitude,2.8);assert.equal(a.liveEvent.depthKm,165);assert(/San Andrés/i.test(a.liveEvent.location));assert.equal(a.extractionMode,'liveblog-event');assert(a.liveEvent.id);
});

ok('liveblog without factual event is flagged and not treated as news body',()=>{
  const html=`<html><body class="liveblog"><div class="liveblog"><article class="update"><p>Qué hacer durante un sismo: conserva la calma y ubica zonas seguras.</p></article></div></body></html>`;
  const a=parseArticleHtml(html,'https://medio.test/temblor-lbposting/');assert(a.isLiveBlog);assert.equal(a.liveblogNoEvent,true);assert.equal(a.liveEvent,null);
});

ok('exclusive closing has priority over partial closing',()=>{
  const story={feedId:'f',feedName:'Diario',title:'Nota'},article={access:{status:'SUBSCRIBER_ONLY'},sourceHadCTA:true,publisher:{name:'Diario',web:'diario.test'}},result={status:'OK',sourceQuality:'PARCIAL',script:'Texto de la noticia.'},settings={exclusiveClose:{enabled:true,template:'Este contenido es exclusivo de {medio}. Para leer la nota, visita {web}.'},rssFeeds:[{id:'f',publisherName:'Diario',publisherWeb:'diario.test',accessMode:'auto',exclusiveCtaEnabled:true,exclusiveCtaTemplate:'Este contenido es exclusivo de {medio}. Para leer la nota, visita {web}.',partialCtaEnabled:true,partialCtaTemplate:'Más información en {web}.'}]};
  const r=applyClosings(story,article,result,settings);assert.equal(r.result.isExclusive,true);assert(/exclusivo de Diario/i.test(r.result.script));assert(!/Más información/.test(r.result.script));
});

ok('0.3.24 UI files expose voice, font, transition and duration features',()=>{
  const renderer=fs.readFileSync(path.join(__dirname,'../src/renderer-0324.js'),'utf8'),preload=fs.readFileSync(path.join(__dirname,'../src/preload.js'),'utf8'),output=fs.readFileSync(path.join(__dirname,'../src/output-0324.js'),'utf8');assert(renderer.includes('customVoiceManager'));assert(renderer.includes('fmtDuration(x.durationSec)'));assert(renderer.includes("transitionType"));assert(preload.includes("voices:import"));assert(preload.includes("fonts:refresh"));assert(output.includes('exclusiveBadge'));
});

console.log('EC 0.3.24 regression checks: OK');
