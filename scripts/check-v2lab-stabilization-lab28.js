'use strict';
const fs=require('fs');
const assert=require('assert');
const read=file=>fs.readFileSync(file,'utf8');

const pkg=JSON.parse(read('package.json'));
assert.strictEqual(pkg.version,'2.0.0-lab.29','La build debe identificarse como Lab.29');
assert(pkg.scripts.check.includes('check-v2lab-stabilization-lab28.js'),'npm check debe ejecutar el gate de estabilización heredado');
assert((pkg.build.files||[]).includes('scripts/check-v2lab-stabilization-lab28.js'),'El gate de estabilización debe quedar dentro del paquete para auditoría');

for(const file of [
  'src/services/releaseV2Stabilization.js',
  'src/renderer-stabilization-lab28.js',
  'src/control-stabilization-lab28.css',
  'src/output-stabilization-lab28.js',
  'src/output-stabilization-lab28.css',
  'src/services/releaseV2Lab29.js',
  'src/renderer-lab29.js'
])assert(fs.existsSync(file),`Falta ${file}`);

const boot=read('src/bootstrap-v2lab.js');
assert(boot.includes("releaseV2Stabilization")&&boot.includes('installReleaseV2Stabilization'),'Bootstrap debe instalar la capa de estabilización Lab.28');
assert(boot.includes("releaseV2Lab29")&&boot.includes('installReleaseV2Lab29'),'Bootstrap debe instalar la corrección Lab.29 después de Lab.28');

const stabilization=read('src/services/releaseV2Stabilization.js');
assert(stabilization.includes("optimization-lab28.json"),'La optimización debe tener estado asociado al perfil activo');
assert(stabilization.includes('profileDir(profileId)'),'El sidecar de optimización debe guardarse dentro del perfil');
assert(stabilization.includes("optimization-v2:status")&&stabilization.includes("optimization-v2:commit")&&stabilization.includes("optimization-v2:clear"),'Lab.28 debe reemplazar los IPC de optimización por la versión por perfil');
assert(stabilization.includes('publicFallback')&&stabilization.includes("publicOnly:true"),'La preparación debe usar fallback público cuando toca exclusiva y no hay una elegible');
assert(stabilization.includes('No hay exclusiva ni noticia pública elegible'),'El productor solo debe esperar cuando tampoco exista una pública');
assert(stabilization.includes('youtubePromo')&&stabilization.includes('ctaText'),'La promo real del contenido debe llevar el CTA configurado');
assert(/mediaRole\|\|''\)[\s\S]*content/.test(stabilization)||stabilization.includes("role==='content'"),'La promo debe limitarse a CONTENIDOS');
assert(stabilization.includes("role==='ad'")&&stabilization.includes('youtubePromo:null'),'Los ANUNCIOS deben limpiar cualquier promo de YouTube');

const monitor=read('src/renderer-lan-output.js');
assert(/MONITOR_FPS\s*=\s*15/.test(monitor),'Monitor interno base debe quedar en 15 FPS');
assert(/MONITOR_FRAME_MS\s*=\s*Math\.round\(1000\/MONITOR_FPS\)/.test(monitor),'La cadencia base debe derivarse de MONITOR_FPS');
assert(monitor.includes('productionGpuBusy()'),'El monitor base debe mantener detección de carga IA/TTS/GPU');
const legacyMonitor=read('src/renderer-monitor-live-lab27.js');
assert(!legacyMonitor.includes('setInterval'),'No puede quedar el segundo loop Lab.27');
assert(!legacyMonitor.includes('outputMonitorFrame()'),'El suplemento Lab.27 no debe duplicar capturePage');

const lab29Release=read('src/services/releaseV2Lab29.js');
const lab29Ui=read('src/renderer-lab29.js');
assert(lab29Release.includes('preserveYoutubePromoState'),'Lab.29 debe proteger YouTube de guardados genéricos stale');
assert(lab29Release.includes('baseLoad.call(this)'),'La protección debe releer el estado persistido antes de guardar');
assert(lab29Release.includes('__youtubePromoConfigLab29'),'La configuración enabled/lead debe tener una ruta dedicada');
assert(lab29Ui.includes('__youtubePromoConfigLab29'),'La UI debe usar la ruta dedicada para enabled/leadSeconds');
assert(!/saveYoutubeConfig\(\)[\s\S]{0,800}youtubePromo\.links\s*=/.test(lab29Ui),'La UI de configuración no debe reescribir links/videos');
assert(lab29Release.includes('protectedYoutubePromo'),'El guard debe conservar íntegros links/videos ya persistidos');
assert(/MONITOR_FPS\s*=\s*15/.test(lab29Ui),'Monitor Lab.29 debe operar a 15 FPS en estado normal');
assert(/MONITOR_BUSY_FPS\s*=\s*5/.test(lab29Ui),'Monitor Lab.29 debe seguir vivo a 5 FPS durante IA/TTS');
assert(lab29Ui.includes('monitorCaptureInterval'),'Lab.29 debe tener una cadencia adaptativa de captura');
assert(lab29Ui.includes('__ecMonitorRuntimeDiagnostics'),'Debe quedar diagnóstico mínimo de FPS efectivo');
assert(lab29Ui.includes("card.innerHTML=")&&lab29Ui.includes('ecMonitor29Image'),'Lab.29 debe reemplazar los IDs del monitor para neutralizar el capturador base sin crear capturas dobles');
assert(!/if\(productionGpuBusy\(\)\)\{[\s\S]{0,300}return;\}/.test(lab29Ui),'La carga IA/TTS no debe congelar el monitor Lab.29');

const ui=read('src/renderer-stabilization-lab28.js');
assert(ui.includes('Promo de YouTube')&&ui.includes('ecYoutubePromoCtaTextLab28'),'Diseño de emisión debe incluir CTA editable de YouTube');
assert(ui.includes("OPTIMIZADA ✓")&&ui.includes('SIN OPTIMIZAR'),'El badge de optimización debe reflejar el perfil activo');
assert(ui.includes('SOLICITANDO')&&ui.includes('Esperando a Windows'),'Permisos de red deben mostrar feedback inmediato de UAC');
assert(ui.includes('lab28-auto-compact'),'La pantalla Automático debe usar el layout compacto de estabilización');
assert(/optObserver\.observe\(badge,\{childList:true,characterData:true,subtree:true\}\)/.test(ui),'El observer del badge no debe observar atributos que él mismo actualiza');
const css=read('src/control-stabilization-lab28.css');
assert(css.includes('lab28-auto-compact')&&css.includes('exclusive-frequency-row'),'El CSS Lab.28 debe reducir apilado vertical sin ocultar controles principales');

const out=read('src/output-stabilization-lab28.js');
assert(out.includes('.ec-youtube-promo-kicker')&&out.includes('ctaText'),'Output debe renderizar el CTA recibido en la promo real');
assert(out.includes("kind!=='canned'")&&out.includes("role!=='content'"),'Output no debe mostrar CTA fuera de contenidos');

const tts=read('src/services/ttsLabRuntime.js'),worker=read('src/tts_lab_worker.py');
assert(tts.includes("automaticConsistency")&&tts.includes('productionSeed')&&tts.includes("'stable-v1'"),'Producción TTS debe fijar identidad/seed estable automáticamente');
assert(tts.includes("identity=id==='chatterbox'")&&tts.includes("+'|'+variant"),'El seed Chatterbox debe depender de la voz de referencia y variante');
assert(worker.includes('exaggeration = float(params.get("exaggeration", 0.42))'),'Lab.29 no debe sustituir la expresividad configurada de Chatterbox');
assert(worker.includes('cfg = float(params.get("cfgWeight", 0.35))'),'Lab.29 no debe sustituir el CFG configurado de Chatterbox');
assert(worker.includes('production_temperature')||worker.includes('productionTemperature'),'Chatterbox debe conservar temperatura de producción estable');
assert(worker.includes('variant = "latam"'),'Chatterbox debe seguir restringido a Latinoamérica');

require('./check-v2lab-emission-layout');
console.log('Lab.29 stabilization gates: YouTube persistente + monitor adaptativo + perfiles/exclusivas/UX/TTS preservados: OK');
