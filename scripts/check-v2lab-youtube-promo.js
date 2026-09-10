'use strict';
const fs=require('fs');
const assert=require('assert');

for(const file of [
  'src/services/youtubePromoLab27.js',
  'src/services/releaseV2YoutubePromo.js',
  'src/services/releaseV2Stabilization.js',
  'src/renderer-youtube-promo.js',
  'src/renderer-stabilization-lab28.js',
  'src/control-youtube-promo.css',
  'src/control-stabilization-lab28.css',
  'src/output-youtube-promo.js',
  'src/output-youtube-promo.css',
  'src/output-stabilization-lab28.js',
  'src/output-stabilization-lab28.css'
])assert(fs.existsSync(file),`Falta ${file}`);

const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
assert(pkg.scripts.check.includes('check-v2lab-youtube-promo.js'),'La suite principal debe ejecutar la prueba de promo YouTube');

const core=require('../src/services/youtubePromoLab27');
for(const [url,id] of [
  ['https://www.youtube.com/watch?v=dQw4w9WgXcQ','dQw4w9WgXcQ'],
  ['https://youtu.be/dQw4w9WgXcQ','dQw4w9WgXcQ'],
  ['https://www.youtube.com/shorts/dQw4w9WgXcQ','dQw4w9WgXcQ'],
  ['https://www.youtube.com/live/dQw4w9WgXcQ','dQw4w9WgXcQ']
])assert.strictEqual(core.parseYouTubeVideoId(url),id,`No se pudo interpretar ${url}`);
assert.strictEqual(core.parseYouTubeVideoId('https://example.com/watch?v=dQw4w9WgXcQ'),'');
for(const n of [5,7,10])assert.strictEqual(core.normalizeLeadSeconds(n),n);
assert.strictEqual(core.normalizeLeadSeconds(9),10);
const normalized=core.normalizePromo({});
assert.strictEqual(normalized.enabled,false);
assert.strictEqual(normalized.leadSeconds,10);
assert.deepStrictEqual(normalized.links,{});
assert.deepStrictEqual(normalized.videos,{});
assert.strictEqual(core.TTL_MS,24*60*60*1000);

const release=fs.readFileSync('src/services/releaseV2YoutubePromo.js','utf8');
assert(release.includes('youtube-promo-machine.json'),'La API key debe vivir fuera de perfiles');
assert(/encryptSecret/.test(release)&&/decryptSecret/.test(release),'La API key debe usar cifrado de SettingsStore');
assert(!/canned\.youtubePromo\.(?:apiKey|apiKeyEnc|keyEnc)\s*=/.test(release),'La API key no debe asignarse ni persistirse dentro del perfil');
assert(/delete out\.canned\.youtubePromo\.apiKey/.test(release)&&/delete out\.canned\.youtubePromo\.apiKeyEnc/.test(release)&&/delete out\.canned\.youtubePromo\.keyEnc/.test(release),'El guardado de perfil debe purgar cualquier secreto heredado');
assert(/videoId/.test(release),'La integración debe deduplicar por videoId');
assert(/decorate/.test(release),'La librería debe decorar contenidos con snapshot de promo');
assert(/mediaRole/.test(release)||/adsFolder/.test(release),'Los anuncios deben quedar fuera de la promo');

// Lab.27 parcheaba el prototipo base; Lab.28 debe envolver el AutomationEngine efectivo
// después de release0331 y justo antes de enviar el payload final al Output.
const stab=fs.readFileSync('src/services/releaseV2Stabilization.js','utf8');
assert(stab.includes("const {AutomationEngine}=require('./automation0325')"),'Lab.28 debe parchear el AutomationEngine usado realmente por release0331');
assert(stab.includes('installActualYoutubeSnapshot'),'Falta integración final de promo en la ruta real de contenido');
assert(/role==='content'&&this\.currentCanned\?\.youtubePromo/.test(stab),'Todo contenido vinculado debe llevar su promo al Output');
assert(/role==='ad'[^\n]*youtubePromo:null/.test(stab),'Los anuncios nunca deben heredar una promo');
assert(stab.includes('promoCta'),'El payload final debe incluir el CTA configurable');
const boot=fs.readFileSync('src/bootstrap-v2lab.js','utf8');
assert(boot.indexOf('releaseV2YoutubePromo')<boot.indexOf('releaseV2Stabilization'),'Lab.28 debe envolver la ruta de playback después de instalar Lab.27');

const ui=fs.readFileSync('src/renderer-youtube-promo.js','utf8');
for(const text of ['Promo YouTube','Actualizar YouTube','Vincular','Actualizar','Programar como próximo','Cancelar próximo','5 s','7 s','10 s'])assert(ui.includes(text),`Falta UX: ${text}`);
assert(!/visualizaciones|hace \d|fecha de publicación/i.test(ui),'La UI no debe mostrar visualizaciones ni fecha');
assert(/max-height|youtube/i.test(fs.readFileSync('src/control-youtube-promo.css','utf8')),'La lista debe tener UX compacta/scroll');

const lab28Ui=fs.readFileSync('src/renderer-stabilization-lab28.js','utf8');
assert(lab28Ui.includes("#tab-emission")&&lab28Ui.includes('Promo de YouTube'),'El CTA editable debe vivir en Diseño de emisión');
assert(lab28Ui.includes('youtubePromoCtaText'),'El texto de CTA debe persistirse como ajuste de perfil');
assert(lab28Ui.includes("String(input.value??'')"),'El usuario debe poder guardar el CTA vacío');
const lab28Out=fs.readFileSync('src/output-stabilization-lab28.js','utf8');
assert(lab28Out.includes('promo.ctaText'),'Output debe usar el CTA incluido en el snapshot');
assert(lab28Out.includes('lab28-empty'),'Output debe ocultar el kicker cuando el CTA está vacío');

const preload=fs.readFileSync('src/preload.js','utf8');
assert(preload.includes('cannedScheduleSpecific'),'Debe preservarse Programar como próximo');
assert(preload.includes('cannedCancelSpecific'),'Debe preservarse Cancelar selección manual');
const profilePolicy=fs.readFileSync('src/services/profilePolicy0329.js','utf8');
assert(profilePolicy.includes('reservePath'),'Debe preservarse la reserva manual de contenido');
assert(profilePolicy.includes('pickPath'),'Debe preservarse la selección específica');
const release0331=fs.readFileSync('src/services/release0331.js','utf8');
assert(release0331.includes('p.playCanned=async function'),'La capa 0.3.31 debe conservar su ruta actual de playback');
assert(/specific|reserve|manual|scheduled/i.test(release0331),'La ruta de contenido específico/manual debe seguir presente');

const out=fs.readFileSync('src/output-youtube-promo.js','utf8');
assert(out.includes('clearYouTubePromo'),'Debe existir una limpieza única de promo');
assert(/mediaRole[^\n]{0,100}ad|ad[^\n]{0,100}mediaRole/.test(out),'La promo debe excluir anuncios');
assert(/kind[^\n]{0,120}canned|canned[^\n]{0,120}kind/.test(out),'La promo debe limitarse a contenidos');
assert(/timeupdate/.test(out),'La aparición debe seguir el tiempo restante del video');
assert(/leadSeconds/.test(out),'Debe usar el umbral global 5/7/10');
assert(/ended/.test(out)&&/error/.test(out)&&/stop/.test(out),'Debe limpiarse en fin, error y stop');
assert(/fade|opacity|visible/.test(out),'Debe activar fade in');
const css=fs.readFileSync('src/output-youtube-promo.css','utf8');
assert(/opacity/.test(css)&&/transition/.test(css),'La promo debe tener fade in CSS');
assert(/\.ec-youtube-promo\.instant-clear\{[^}]*opacity:0!important;[^}]*transition:none!important/.test(css),'La retirada debe ser instantánea y sin fade out');
assert(/\.ec-youtube-promo-kicker\.lab28-empty\{[^}]*display:none!important/.test(fs.readFileSync('src/output-stabilization-lab28.css','utf8')),'CTA vacío no debe dejar espacio visual');

const web=fs.readFileSync('src/output-web.html','utf8');
assert(web.includes('output-youtube-promo.css')&&web.includes('output-youtube-promo.js'),'Output LAN debe cargar la promo');
const lan=fs.readFileSync('src/services/outputLanServer.js','utf8');
assert(lan.includes("'output-youtube-promo.js'")&&lan.includes("'output-youtube-promo.css'"),'Output LAN debe servir los assets base de promo');
assert(boot.includes('releaseV2Stabilization'),'Bootstrap debe instalar la estabilización Lab.28');

console.log('Lab.28 YouTube content promo: ruta real de playback + CTA editable + trigger 5/7/10 OK');