const fs=require('fs');
const path=require('path');
const assert=require('assert');
const {parseArticleHtml}=require('../src/services/article');

function image(html){return parseArticleHtml(html,'https://medio.example/politica/nota-1').image;}

assert.equal(image('<html><head><meta property="og:image" content="https://cdn.example/og.jpg"></head><body><article><p>Texto suficientemente largo para la prueba.</p></article></body></html>'),'https://cdn.example/og.jpg','Debe priorizar og:image');
assert.equal(image('<html><head><meta name="twitter:image" content="/img/twitter.jpg"></head><body><article><p>Texto suficientemente largo para la prueba.</p></article></body></html>'),'https://medio.example/img/twitter.jpg','Debe usar twitter:image si falta og:image');
assert.equal(image('<html><head><script type="application/ld+json">{"@type":"NewsArticle","image":{"url":"https://cdn.example/jsonld.jpg"}}</script></head><body><article><p>Texto suficientemente largo para la prueba.</p></article></body></html>'),'https://cdn.example/jsonld.jpg','Debe usar JSON-LD image');
assert.equal(image('<html><body><article><figure><img data-src="/img/principal.jpg" width="1200" height="675"></figure><p>Texto suficientemente largo para la prueba.</p></article></body></html>'),'https://medio.example/img/principal.jpg','Debe encontrar imagen principal del artículo');

const preload=fs.readFileSync(path.join(__dirname,'..','src','preload.js'),'utf8');
assert(preload.includes('renderer-image-hydration-0324.js'),'La hidratación de miniaturas debe cargarse en control.html');
console.log('Image resolver 0.3.24 OK');
