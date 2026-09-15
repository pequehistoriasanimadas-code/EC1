'use strict';
const fs=require('fs');
const os=require('os');
const path=require('path');
const assert=require('assert');
const read=file=>fs.readFileSync(file,'utf8');

const pkg=JSON.parse(read('package.json'));
assert.strictEqual(pkg.version,'2.0.0-lab.29','La build debe identificarse como Lab.29');
assert(pkg.scripts.check.includes('check-v2lab-stabilization-lab28.js'),'npm check debe ejecutar el gate de estabilización heredado');
assert((pkg.build.files||[]).includes('scripts/check-v2lab-stabilization-lab28.js'),'El gate de estabilización debe quedar dentro del paquete para auditoría');

for(const file of [
  'src/services/releaseV2Stabilization.js',
  'src/services/releaseV2GlobalOptimizationLab29.js',
  'src/renderer-stabilization-lab28.js',
  'src/control-stabilization-lab28.css',
  'src/output-stabilization-lab28.js',
  'src/output-stabilization-lab28.css',
  'src/services/releaseV2Lab29.js',
  'src/renderer-lab29.js'
])assert(fs.existsSync(file),`Falta ${file}`);

const boot=read('src/bootstrap-v2lab.js');
assert(boot.includes("releaseV2Stabilization")&&boot.includes('installReleaseV2Stabilization'),'Bootstrap debe instalar la capa de estabilización Lab.28');
assert(boot.includes("releaseV2GlobalOptimizationLab29")&&boot.includes('installMachineGlobalOptimizationLab29'),'Bootstrap debe instalar el puente de optimización global Lab.29');
assert(boot.indexOf('installReleaseV2Stabilization')<boot.indexOf('installMachineGlobalOptimizationLab29'),'El puente global debe instalarse después de Lab.28 para reemplazar su IPC por perfil');
assert(boot.includes("releaseV2Lab29")&&boot.includes('installReleaseV2Lab29'),'Bootstrap debe instalar la corrección Lab.29 después de Lab.28');

const stabilization=read('src/services/releaseV2Stabilization.js');
assert(stabilization.includes("optimization-lab28.json"),'La optimización debe mantener sidecar de compatibilidad asociado al perfil activo');
assert(stabilization.includes('profileDir(profileId)'),'El sidecar de optimización debe guardarse dentro del perfil');
assert(stabilization.includes("optimization-v2:status")&&stabilization.includes("optimization-v2:commit")&&stabilization.includes("optimization-v2:clear"),'Lab.28 debe conservar IPC base para que Lab.29 pueda reemplazarlo');
const globalOptimization=read('src/services/releaseV2GlobalOptimizationLab29.js');
assert(globalOptimization.includes('function globalProductionProfile'),'Debe existir una fuente canónica global del perfil de producción por computadora');
assert(globalOptimization.includes('promoteCompatibleSideProfile'),'Debe poder recuperar una optimización válida de Lab28 anterior y promoverla al estado global');
assert(globalOptimization.includes('syncActiveProfileOptimization'),'Un perfil nuevo o recién activado debe vincularse al perfil global compatible sin repetir benchmark');
assert(globalOptimization.includes('atomicJson(fidelity.profileFile(base),profile)'),'Optimizar debe persistir el perfil de producción global además del vínculo del perfil activo');
assert(globalOptimization.includes('global-machine-profile'),'El sidecar por perfil debe registrar que reutiliza la optimización global de esta computadora');
assert(globalOptimization.includes('pending:!!profile?.localAi?.required'),'Un LocalRuntime todavía no iniciado no debe convertir una optimización válida en SIN OPTIMIZAR');
assert(globalOptimization.includes('perfil de otra computadora'),'La reutilización debe bloquear fingerprints de otra máquina');
assert(stabilization.includes('publicFallback')&&stabilization.includes("publicOnly:true"),'La preparación debe usar fallback público cuando toca exclusiva y no hay una elegible');
assert(stabilization.includes('No hay exclusiva ni noticia pública elegible'),'El productor solo debe esperar cuando tampoco exista una pública');
assert(stabilization.includes('youtubePromo')&&stabilization.includes('ctaText'),'La promo real del contenido debe llevar el CTA configurado');
assert(/mediaRole\|\|''\)[\s\S]*content/.test(stabilization)||stabilization.includes("role==='content'"),'La promo debe limitarse a CONTENIDOS');
assert(stabilization.includes("role==='ad'")&&stabilization.includes('youtubePromo:null'),'Los ANUNCIOS deben limpiar cualquier promo de YouTube');

// Regresión real: una optimización hecha en El Comercio debe sobrevivir al crear/activar Gestión.
const {getProfileManager}=require('../src/services/profileManager0329');
const fidelity=require('../src/services/releaseV2ProductionFidelity');
const stabilizationApi=require('../src/services/releaseV2Stabilization');
const globalApi=require('../src/services/releaseV2GlobalOptimizationLab29');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gec-global-optimization-lab29-'));
try{
  const m=getProfileManager(tmp),localConfig={label:'RTX 3080',ctx:4096,gpuLayers:99,batch:512,ubatch:192,threads:6,parallel:1,prio:-1,poll:0,warmup:false};
  const defaults={ai:{primary:'local',backup1:'claude',backup2:'gemini',localAutoTuned:true,localTunedConfig:localConfig,lastLocalBenchmark:{tokensPerSec:108.2,coexistenceMode:'gpu-coordinated',coordinatedValidated:true}},tts:{engine:'chatterbox',referenceVoiceId:'LOCUTOR',engineParams:{chatterbox:{}},speed:1},visual:{},rssFeeds:[],rssPartialClose:{},exclusiveClose:{},canned:{},documents:{processed:{}},automation:{}};
  const comercio=m.create({name:'El Comercio',color:'#F7C600',defaults}),gestion=m.create({name:'Gestión',color:'#EC4899',defaults});
  const settings={...defaults,optimization0321:{version:'2.0-lab.25',fingerprint:'THIS-PC',hardwareLabel:'RTX 3080 · 12 GB',voice:{medianRtf:.68},local:{coexistenceMode:'gpu-coordinated'}}};
  const profile=fidelity.buildProfile(settings,{fingerprint:'THIS-PC',hardwareLabel:'RTX 3080 · 12 GB',localResult:{recommendedConfig:localConfig,recommendedId:'gpu99',recommendedLabel:'GPU completa',summary:{tokensPerSec:108.2,coexistenceMode:'gpu-coordinated',coordinatedValidated:true}},ttsResult:{stableRealtimeFactor:.68,worstRealtimeFactor:.68},pipelineMode:'gpu-coordinated',validated:true});
  const oldSide=stabilizationApi.sideFile(tmp,comercio.id);fs.mkdirSync(path.dirname(oldSide),{recursive:true});fs.writeFileSync(oldSide,JSON.stringify({schemaVersion:1,cleared:false,optimization0321:settings.optimization0321,productionProfile:profile,source:'lab28-profile-optimizer'},null,2));
  m.activate(gestion.id);
  assert(!fs.existsSync(fidelity.profileFile(tmp)),'La fixture debe empezar como #859: solo sidecar por perfil, sin canónico global');
  const promoted=globalApi.promoteCompatibleSideProfile(tmp,settings);assert(promoted&&promoted.id===profile.id,'Gestión debe recuperar la optimización compatible creada antes en El Comercio');
  assert(fs.existsSync(fidelity.profileFile(tmp)),'La migración debe crear active-production-profile.json global');
  const resolved=globalApi.globalProductionProfile(tmp,settings);assert(resolved.compatible&&resolved.profile?.id===profile.id,'El perfil global recuperado debe quedar compatible en la misma computadora');
  const linked=globalApi.syncActiveProfileOptimization(tmp,settings,resolved.profile);assert(linked?.productionProfile?.id===profile.id&&linked?.source==='global-machine-profile','Gestión debe quedar vinculada al global sin benchmark nuevo');
  const managementSide=JSON.parse(fs.readFileSync(stabilizationApi.sideFile(tmp,gestion.id),'utf8'));assert.strictEqual(managementSide.productionProfile.id,profile.id);assert.strictEqual(managementSide.optimization0321.fingerprint,'THIS-PC');
  const otherMachine=globalApi.globalProductionProfile(tmp,{...settings,optimization0321:{...settings.optimization0321,fingerprint:'OTHER-PC'}},{allowPromotion:false});assert.strictEqual(otherMachine.compatible,false,'No debe reutilizarse el perfil si cambia la computadora');
  const otherEngine=globalApi.globalProductionProfile(tmp,{...settings,tts:{...settings.tts,engine:'qwen3tts',engineParams:{qwen3tts:{}}}},{allowPromotion:false});assert.strictEqual(otherEngine.compatible,false,'Cambiar motor TTS debe exigir reoptimización');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}

const monitor=read('src/renderer-lan-output.js');
assert(/MONITOR_FPS\s*=\s*15/.test(monitor),'Monitor interno base debe quedar en 15 FPS');
assert(/MONITOR_FRAME_MS\s*=\s*Math\.round\(1000\/MONITOR_FPS\)/.test(monitor),'La cadencia base debe derivarse de MONITOR_FPS');
assert(monitor.includes('productionGpuBusy()'),'El monitor base debe mantener detección de carga IA/TTS/GPU');
assert(monitor.includes('ecMonitorImage')&&monitor.includes('ecMonitorState'),'renderer-lan-output debe ser el único propietario de la superficie del monitor');
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
assert(/MONITOR_FPS\s*=\s*15/.test(lab29Ui),'Lab.29 debe conocer la cadencia normal de 15 FPS del monitor base');
assert(/MONITOR_BUSY_FPS\s*=\s*5/.test(lab29Ui),'Lab.29 debe mantener el monitor vivo a 5 FPS durante IA/TTS');
assert(lab29Ui.includes('monitorCaptureInterval'),'Lab.29 debe aportar la cadencia suplementaria durante carga de producción');
assert(lab29Ui.includes('__ecMonitorRuntimeDiagnostics'),'Debe quedar diagnóstico mínimo de FPS efectivo');
assert(lab29Ui.includes('ecMonitorImage')&&lab29Ui.includes('ecMonitorState'),'Lab.29 debe reutilizar la superficie del monitor base');
assert(!lab29Ui.includes('ecMonitor29Image')&&!lab29Ui.includes('replaceMonitorCard')&&!lab29Ui.includes('card.innerHTML'),'Lab.29 no debe reconstruir ni duplicar la superficie del monitor');
assert(lab29Ui.includes('productionGpuBusy()'),'El suplemento de 5 FPS debe depender de la carga IA/TTS/GPU');

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
require('./check-v2lab-emission-design-v2');
require('./check-v2lab-manual-content-selection');
require('./check-v2lab-audio-ux-lab29');
console.log('Lab.29 stabilization gates: YouTube persistente + monitor único/adaptativo + optimización global/perfiles/exclusivas/UX/TTS + próximo contenido manual preservados: OK');
