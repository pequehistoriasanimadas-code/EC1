'use strict';
const fs=require('fs');
const assert=require('assert');
const read=file=>fs.readFileSync(file,'utf8');

const pkg=JSON.parse(read('package.json'));
assert.strictEqual(pkg.version,'2.0.0-lab.28','La build debe identificarse como Lab.28');
assert(pkg.scripts.check.includes('check-v2lab-stabilization-lab28.js'),'npm check debe ejecutar el gate de Lab.28');
assert((pkg.build.files||[]).includes('scripts/check-v2lab-stabilization-lab28.js'),'El gate Lab.28 debe quedar dentro del paquete para auditoría');

for(const file of [
  'src/services/releaseV2Stabilization.js',
  'src/renderer-stabilization-lab28.js',
  'src/control-stabilization-lab28.css',
  'src/output-stabilization-lab28.js',
  'src/output-stabilization-lab28.css'
])assert(fs.existsSync(file),`Falta ${file}`);

const boot=read('src/bootstrap-v2lab.js');
assert(boot.includes("releaseV2Stabilization")&&boot.includes('installReleaseV2Stabilization'),'Bootstrap debe instalar la capa de estabilización Lab.28');

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
assert(/MONITOR_FPS\s*=\s*15/.test(monitor),'Monitor interno debe quedar fijo en 15 FPS');
assert(/MONITOR_FRAME_MS\s*=\s*Math\.round\(1000\/MONITOR_FPS\)/.test(monitor),'La cadencia del monitor debe derivarse de MONITOR_FPS');
assert(monitor.includes('productionGpuBusy()'),'El monitor debe mantener prioridad de IA/TTS/GPU');
const legacyMonitor=read('src/renderer-monitor-live-lab27.js');
assert(!legacyMonitor.includes('setInterval'),'No puede quedar un segundo loop de captura del monitor');
assert(!legacyMonitor.includes('outputMonitorFrame()'),'El suplemento Lab.27 no debe duplicar capturePage');

// Lab.29 regression gates: YouTube state must survive unrelated settings saves and
// the monitor must remain live (reduced cadence) while IA/TTS is busy.
const youtubeRelease=read('src/services/releaseV2YoutubePromo.js');
const youtubeUi=read('src/renderer-youtube-promo.js');
assert(/preserveYoutubePromoState|protectedYoutubePromo|youtubePromoProtected/i.test(youtubeRelease),'Lab.29 debe proteger YouTube de guardados genéricos stale');
assert(/action==='configure'/.test(youtubeRelease),'Lab.29 debe guardar enabled/leadSeconds por una ruta dedicada');
assert(/command\(['"]configure['"]/.test(youtubeUi),'La UI YouTube debe usar comando dedicado para enabled/leadSeconds');
assert(!/async function saveGlobal\(\)[\s\S]{0,900}saveSettings\(s\)/.test(youtubeUi),'saveGlobal no debe sobrescribir links/videos con una copia stale');
assert(/MONITOR_BUSY_FPS\s*=\s*5/.test(monitor),'Durante IA/TTS el monitor debe seguir vivo a 5 FPS');
assert(!/if\(productionGpuBusy\(\)\)\{[\s\S]{0,350}return;\}/.test(monitor),'IA/TTS no debe congelar completamente el monitor');
assert(/monitorCaptureInterval|effectiveMonitorInterval|busyFrameMs/i.test(monitor),'Debe existir una cadencia adaptativa de captura');
assert(/__ecMonitorRuntimeDiagnostics/.test(monitor),'Debe quedar diagnóstico mínimo de FPS efectivo del monitor');

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
assert(worker.includes('exaggeration = float(params.get("exaggeration", 0.42))'),'Lab.28 no debe sustituir la expresividad configurada de Chatterbox');
assert(worker.includes('cfg = float(params.get("cfgWeight", 0.35))'),'Lab.28 no debe sustituir el CFG configurado de Chatterbox');
assert(worker.includes('production_temperature')||worker.includes('productionTemperature'),'Chatterbox debe conservar temperatura de producción estable');
assert(worker.includes('variant = "latam"'),'Chatterbox debe seguir restringido a Latinoamérica');

console.log('Lab.28/29 stabilization gates: perfiles + exclusivas + YouTube persistente + monitor adaptativo + UX + Chatterbox estable: OK');
