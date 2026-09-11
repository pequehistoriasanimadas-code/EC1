'use strict';
const fs=require('fs');
const assert=require('assert');
const vm=require('vm');

for(const file of [
  'src/services/youtubePromoLab27.js',
  'src/services/youtubePromoDesignLab29.js',
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

const design=require('../src/services/youtubePromoDesignLab29');
const designRoot=design.normalizeYoutubePromoDesignRoot({});
assert.strictEqual(designRoot.ctaText,'Puedes ver el video aquí:');
assert(designRoot.formats['16:9']&&designRoot.formats['9:16'],'La promo debe mantener diseño independiente por formato');

const release=fs.readFileSync('src/services/releaseV2YoutubePromo.js','utf8');
assert(release.includes('youtube-promo-machine.json'),'La API key debe vivir fuera de perfiles');
assert(/encryptSecret/.test(release)&&/decryptSecret/.test(release),'La API key debe usar cifrado de SettingsStore');
assert(!/canned\.youtubePromo\.(?:apiKey|apiKeyEnc|keyEnc)\s*=/.test(release),'La API key no debe asignarse ni persistirse dentro del perfil');
assert(/delete out\.canned\.youtubePromo\.apiKey/.test(release)&&/delete out\.canned\.youtubePromo\.apiKeyEnc/.test(release)&&/delete out\.canned\.youtubePromo\.keyEnc/.test(release),'El guardado de perfil debe purgar cualquier secreto heredado');
assert(/videoId/.test(release),'La integración debe deduplicar por videoId');
assert(/decorate/.test(release),'La librería debe decorar contenidos con snapshot de promo');
assert(/mediaRole/.test(release)||/adsFolder/.test(release),'Los anuncios deben quedar fuera de la promo');

const stab=fs.readFileSync('src/services/releaseV2Stabilization.js','utf8');
assert(stab.includes("const {AutomationEngine}=require('./automation0325')"),'Lab.28 debe parchear el AutomationEngine usado realmente por release0331');
assert(stab.includes('installActualYoutubeSnapshot'),'Falta integración final de promo en la ruta real de contenido');
assert(stab.includes('freshYoutubePromoSnapshot'),'La promo debe volver a resolverse al reproducir para evitar snapshots de reserva obsoletos');
assert(stab.includes("engine?.canned?.list?.(folder)"),'La resolución fresca debe consultar la biblioteca actual sin consumir la reserva');
assert(/if\(role==='content'\).*freshYoutubePromoSnapshot/.test(stab),'Todo contenido debe resolver el estado vigente de su promo al salir al aire');
assert(/role==='ad'[^\n]*youtubePromo:null/.test(stab),'Los anuncios nunca deben heredar una promo');
assert(stab.includes('promoCta'),'El payload final debe incluir el CTA configurable');
assert(stab.includes('normalizeYoutubePromoDesign'),'El payload final debe incluir diseño normalizado por formato');
const boot=fs.readFileSync('src/bootstrap-v2lab.js','utf8');
assert(boot.indexOf('releaseV2YoutubePromo')<boot.indexOf('releaseV2Stabilization'),'Lab.28 debe envolver la ruta de playback después de instalar Lab.27');

const ui=fs.readFileSync('src/renderer-youtube-promo.js','utf8');
for(const text of ['Promo YouTube','Actualizar YouTube','Vincular','Actualizar','Programar como próximo','Cancelar próximo','5 s','7 s','10 s'])assert(ui.includes(text),`Falta UX: ${text}`);
assert(!/visualizaciones|hace \d|fecha de publicación/i.test(ui),'La UI no debe mostrar visualizaciones ni fecha');
assert(/max-height|youtube/i.test(fs.readFileSync('src/control-youtube-promo.css','utf8')),'La lista debe tener UX compacta/scroll');

const lab28Ui=fs.readFileSync('src/renderer-stabilization-lab28.js','utf8');
assert(lab28Ui.includes("#tab-emission")&&lab28Ui.includes('Promo de YouTube'),'El editor de promo debe vivir en Diseño de emisión');
assert(lab28Ui.includes('youtubePromoCtaText'),'El texto de CTA debe mantener compatibilidad con el ajuste heredado');
assert(lab28Ui.includes('youtubePromoDesign'),'El diseño completo debe persistirse como ajuste del perfil');
assert(lab28Ui.includes("String(q('#ecYoutubePromoCtaTextLab28')?.value"),'El usuario debe poder guardar el CTA vacío');
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
assert(out.includes('promo.design')&&out.includes('applyDesign'),'Output debe aplicar el diseño recibido en el snapshot');

// Runtime regression: output:story arma la promo antes de que showCanned() haga video.load().
// Ese load dispara "emptied"; el evento no puede olvidar el snapshot recién armado.
function classList(){const set=new Set();return{add:(...x)=>x.forEach(v=>set.add(v)),remove:(...x)=>x.forEach(v=>set.delete(v)),contains:v=>set.has(v),toggle(v,force){if(arguments.length>1){if(force){set.add(v);return true;}set.delete(v);return false;}if(set.has(v)){set.delete(v);return false;}set.add(v);return true;}};}
const promoRoot={id:'',className:'',dataset:{},style:{setProperty(){}},innerHTML:'',classList:classList(),getBoundingClientRect:()=>({})};
const thumb={src:'',removeAttribute(n){if(n==='src')this.src='';}},kicker={textContent:'',classList:classList()},titleNode={textContent:''},channelNode={textContent:''};
promoRoot.querySelector=sel=>sel.includes('thumb')?thumb:sel.includes('kicker')?kicker:sel.includes('title')?titleNode:channelNode;
const mediaListeners={};
const cannedVideoMock={duration:20,currentTime:0,addEventListener(name,fn){(mediaListeners[name]??=[]).push(fn);},fire(name){for(const fn of mediaListeners[name]||[])fn();}};
const ipcListeners={};
const windowMock={ECAPI:{on(name,fn){(ipcListeners[name]??=[]).push(fn);}},addEventListener(){}};
const documentMock={createElement(){return promoRoot;}};
const stageMock={dataset:{format:'16:9'},appendChild(node){this.child=node;}};
const context={window:windowMock,document:documentMock,stage:stageMock,cannedVideo:cannedVideoMock,requestAnimationFrame:fn=>fn(),setTimeout:fn=>fn(),console};
vm.createContext(context);vm.runInContext(out,context,{filename:'output-youtube-promo.js'});
const storyHandler=ipcListeners['output:story']?.[0];
assert.strictEqual(typeof storyHandler,'function','Output promo no registró output:story');
storyHandler({kind:'canned',mediaRole:'content',youtubePromo:{enabled:true,videoId:'abc123xyz',title:'Video vinculado',channel:'Canal',thumbnailDataUrl:'data:image/jpeg;base64,AAAA',leadSeconds:5,design:{format:'16:9',scale:1}}});
cannedVideoMock.fire('emptied');
cannedVideoMock.currentTime=16;
cannedVideoMock.fire('timeupdate');
assert(promoRoot.classList.contains('visible'),'REGRESIÓN: video.load() disparó emptied y olvidó la promo antes de los últimos segundos');

const css=fs.readFileSync('src/output-youtube-promo.css','utf8');
assert(/opacity/.test(css)&&/transition/.test(css),'La promo debe tener fade in CSS');
assert(/\.ec-youtube-promo\.instant-clear\{[^}]*opacity:0!important;[^}]*transition:none!important/.test(css),'La retirada debe ser instantánea y sin fade out');
assert(/\.ec-youtube-promo-kicker\.lab28-empty\{[^}]*display:none!important/.test(fs.readFileSync('src/output-stabilization-lab28.css','utf8')),'CTA vacío no debe dejar espacio visual');

const web=fs.readFileSync('src/output-web.html','utf8');
assert(web.includes('output-youtube-promo.css')&&web.includes('output-youtube-promo.js'),'Output LAN debe cargar la promo');
const lan=fs.readFileSync('src/services/outputLanServer.js','utf8');
assert(lan.includes("'output-youtube-promo.js'")&&lan.includes("'output-youtube-promo.css'"),'Output LAN debe servir los assets base de promo');
assert(boot.includes('releaseV2Stabilization'),'Bootstrap debe instalar la estabilización Lab.28');

console.log('Lab.29 YouTube content promo: estado fresco en primer playback + diseño por formato + runtime emptied/load + CTA + trigger 5/7/10 OK');
