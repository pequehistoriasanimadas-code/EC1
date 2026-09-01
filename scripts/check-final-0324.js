'use strict';
const assert=require('assert');
const {storyKey,baseStoryKey}=require('../src/services/storyKey0324');
const {parseArticleMetadata}=require('../src/services/articleMetadata0324');
const {correctAccess}=require('../src/services/accessPolicy0324');
const {buildExclusivePublicArticle,exclusiveContextSufficient,chooseNewsItem}=require('../src/services/automation0324');

function testStoryKeys(){
  const a=storyKey('https://www.elcomercio.pe/politica/nota/?utm_source=x&fbclid=1#foo');
  assert.strictEqual(a,'https://elcomercio.pe/politica/nota');
  const live=storyKey('https://elcomercio.pe/lbposting/sismos/?utm_medium=x#ec-event=ABC%201');
  assert.ok(live.includes('#ec-event=ABC%201'));
  assert.ok(!baseStoryKey(live).includes('#ec-event='));
}
function testMetadata(){
  let m=parseArticleMetadata('<meta property="article:published_time" content="2026-08-25T10:15:00-05:00"><meta property="og:description" content="Bajada pública útil.">');
  assert.strictEqual(m.pubDate,'2026-08-25T15:15:00.000Z');assert.strictEqual(m.publicPreview,'Bajada pública útil.');
  m=parseArticleMetadata('<script type="application/ld+json">{"@type":"NewsArticle","datePublished":"2026-08-24T08:00:00-05:00"}</script>');assert.strictEqual(m.pubDate,'2026-08-24T13:00:00.000Z');
  m=parseArticleMetadata('<time datetime="2026-08-23T07:30:00-05:00">23 ago</time>');assert.strictEqual(m.pubDate,'2026-08-23T12:30:00.000Z');
  m=parseArticleMetadata('<body><div>Solo para suscriptores</div><article>Texto visible técnicamente.</article></body>');assert.strictEqual(m.strongLock,true);
  m=parseArticleMetadata('<body>Apple TV ofrece contenido exclusivo relacionado con la liga para sus usuarios.</body>');assert.strictEqual(m.strongLock,false);
}
function testAccess(){
  const locked=correctAccess({sourceChars:9000,contentState:'COMPLETE',body:'cuerpo técnicamente legible',access:{status:'SUBSCRIBER_ONLY',signals:{strongLock:true}}},'https://elcomercio.pe/ecdata/nota/');assert.strictEqual(locked.isExclusive,true);assert.strictEqual(locked.access.status,'SUBSCRIBER_ONLY');
  const falsePositive=correctAccess({sourceChars:1200,contentState:'COMPLETE',body:'Artículo público completo sin aviso de candado.',access:{status:'SUBSCRIBER_ONLY',signals:{schemaLocked:true}}},'https://elcomercio.pe/politica/nota/');assert.strictEqual(falsePositive.isExclusive,false);assert.strictEqual(falsePositive.access.status,'PUBLIC');
}
function testExclusiveSafeSource(){
  const story={title:'Titular',description:'El ministerio anunció tres medidas verificables que entrarán en vigor en septiembre y afectan a varios proyectos.'};
  const article={title:'Titular',description:'La medida fue anunciada este martes y contempla cambios específicos para acelerar proyectos.',publicPreview:'El anuncio incluye tres medidas y una fecha concreta de aplicación.',body:'SECRETO PROTEGIDO QUE NO DEBE LLEGAR A LA IA',sourceChars:9999,contentState:'COMPLETE'};
  const safe=buildExclusivePublicArticle(story,article);assert.ok(!safe.body.includes('SECRETO PROTEGIDO'));assert.strictEqual(safe.protectedBodyOmitted,true);assert.ok(exclusiveContextSufficient(story,article));assert.strictEqual(exclusiveContextSufficient({title:'Solo titular'},{body:'SECRETO'}),false);
}
function testExclusiveScheduling(){
  const pub={status:'LISTA',result:{isExclusive:false},story:{title:'Pública'}},ex={status:'LISTA',result:{isExclusive:true},story:{title:'Exclusiva'}};
  assert.strictEqual(chooseNewsItem([ex,pub],4,true,0),pub,'Debe preferir pública durante la separación');
  assert.strictEqual(chooseNewsItem([ex],4,true,0),ex,'No debe crear silencio si solo hay exclusiva');
  assert.strictEqual(chooseNewsItem([pub,ex],4,true,3),pub,'Cumplir la separación no fuerza una exclusiva');
  assert.strictEqual(chooseNewsItem([ex,pub],4,true,3),ex,'Con separación cumplida conserva el orden normal');
  assert.strictEqual(chooseNewsItem([ex,pub],0,true,0),ex,'Sin límite conserva orden normal');
}

testStoryKeys();testMetadata();testAccess();testExclusiveSafeSource();testExclusiveScheduling();
console.log('check-final-0324: OK');
