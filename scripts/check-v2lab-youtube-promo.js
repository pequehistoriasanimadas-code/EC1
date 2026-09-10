'use strict';
const fs=require('fs');
const assert=require('assert');

for(const file of [
  'src/services/youtubePromoLab27.js',
  'src/services/releaseV2YoutubePromo.js',
  'src/renderer-youtube-promo.js',
  'src/control-youtube-promo.css',
  'src/output-youtube-promo.js',
  'src/output-youtube-promo.css'
])assert(fs.existsSync(file),`Falta ${file}`);

const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
assert.strictEqual(pkg.version,'2.0.0-lab.27','La build debe identificarse como 2.0.0-lab.27');
assert(pkg.scripts.check.includes('check-v2lab-youtube-promo.js'),'La suite principal debe ejecutar la prueba de Lab.27');
assert((pkg.build.files||[]).includes('scripts/check-v2lab-youtube-promo.js'),'El paquete debe incluir la prueba Lab.27 para smoke/auditoría');

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
assert(!/canned\.youtubePromo\.apiKey/.test(release),'La API key no debe persistirse dentro del perfil');
assert(/videoId/.test(release),'La integración debe deduplicar por videoId');
assert(/decorate/.test(release),'La integración debe decorar contenidos con snapshot de promo');
assert(/mediaRole/.test(release)||/adsFolder/.test(release),'Los anuncios deben quedar fuera de la promo');

const ui=fs.readFileSync('src/renderer-youtube-promo.js','utf8');
for(const text of ['Promo YouTube','Actualizar YouTube','Vincular','Actualizar','Programar como próximo','Cancelar próximo','5 s','7 s','10 s'])assert(ui.includes(text),`Falta UX: ${text}`);
assert(!/visualizaciones|hace \d|fecha de publicación/i.test(ui),'La UI no debe mostrar visualizaciones ni fecha');
assert(/max-height|youtube/i.test(fs.readFileSync('src/control-youtube-promo.css','utf8')),'La lista debe tener UX compacta/scroll');

const preload=fs.readFileSync('src/preload.js','utf8');
assert(preload.includes('cannedScheduleSpecific'),'Debe preservarse Programar como próximo');
assert(preload.includes('cannedCancelSpecific'),'Debe preservarse Cancelar selección manual');
const profilePolicy=fs.readFileSync('src/services/profilePolicy0329.js','utf8');
assert(profilePolicy.includes('reservePath'),'Debe preservarse la reserva manual de contenido');
assert(profilePolicy.includes('pickPath'),'Debe preservarse la selección específica');

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
assert(!/transition[^;]*opacity[^;]*out/i.test(css),'No debe existir una animación fade out dedicada');

const web=fs.readFileSync('src/output-web.html','utf8');
assert(web.includes('output-youtube-promo.css')&&web.includes('output-youtube-promo.js'),'Output LAN debe cargar la promo');
const lan=fs.readFileSync('src/services/outputLanServer.js','utf8');
assert(lan.includes("'output-youtube-promo.js'")&&lan.includes("'output-youtube-promo.css'"),'Output LAN debe servir los assets de promo Lab.27');
const boot=fs.readFileSync('src/bootstrap-v2lab.js','utf8');
assert(boot.includes('releaseV2YoutubePromo'),'Bootstrap debe instalar Lab.27');

console.log('Lab.27 YouTube content promo: OK');
