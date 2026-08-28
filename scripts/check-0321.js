'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const ok=(v,m)=>{if(!v)throw new Error(m);};
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

const pkg=JSON.parse(read('package.json'));ok(pkg.version==='0.3.21','package version debe ser 0.3.21');
const loader=read('src/services/version0319RendererLoader.js');ok(/version0321Policy/.test(loader)&&/renderer-0321\.js/.test(loader),'0.3.21 no se carga después de 0.3.20');
const ui=read('src/renderer-0321.js');for(const token of ['Optimizar EC para esta computadora','hideLegacyOptimizers','newsModal0321','Abrir fuente original','extractionWarning','hardwareFingerprint','benchmarkTts','benchmarkLocalAI'])ok(ui.includes(token),`falta ${token} en UI 0.3.21`);
const policy=read('src/services/version0321Policy.js');for(const token of ['sourceProfile','sourceQualityLevel','effectiveTargetSeconds','FUENTE_INSUFICIENTE'])ok(policy.includes(token),`falta ${token} en política de fuente 0.3.21`);
const article=read('src/services/article.js');for(const token of ['jsonLdBodies','amphtml','globalParagraphBody','extractionLabel','sourceChars','extractionWarning'])ok(article.includes(token),`falta ${token} en extractor 0.3.21`);

const {parseArticleHtml}=require(path.join(root,'src/services/article.js'));
const {sourceProfile}=require(path.join(root,'src/services/version0321Policy.js'));
const html=`<!doctype html><html><head><meta property="og:title" content="Prueba"><script type="application/ld+json">{"@type":"NewsArticle","articleBody":"Este es un cuerpo estructurado suficientemente largo para comprobar que EC puede recuperar texto desde JSON LD cuando el contenedor visual del artículo no entrega todos los párrafos necesarios. La información continúa con hechos de prueba y contenido adicional para superar el mínimo."}</script><link rel="amphtml" href="/amp/prueba"></head><body><article><p>Resumen corto visible.</p></article></body></html>`;
const parsed=parseArticleHtml(html,'https://example.com/noticia');ok(parsed.body.length>180&&parsed.extractionMode==='jsonld','JSON-LD no rescata una extracción corta');ok(parsed.ampUrl==='https://example.com/amp/prueba','URL AMP relativa no se resuelve correctamente');
const critical=sourceProfile({body:'x'.repeat(190),sourceChars:190,extractionMode:'article'}),brief=sourceProfile({body:'x'.repeat(500),sourceChars:500}),normal=sourceProfile({body:'x'.repeat(1800),sourceChars:1800});ok(critical.level==='critical'&&critical.targetSeconds===30,'fuente ~190 caracteres no activa guard crítico');ok(brief.level==='brief'&&brief.targetSeconds===45,'fuente breve no reduce duración');ok(normal.level==='normal','fuente suficiente se limita innecesariamente');
console.log('EC 0.3.21 checks OK · optimizador único · modal Noticias · extracción JSON-LD/AMP · guard de fuente breve');
