'use strict';
const fs=require('fs');
const assert=require('assert');
const {execFileSync}=require('child_process');
const read=file=>fs.readFileSync(file,'utf8');

for(const file of [
  'src/renderer-emission-design-repair-lab29.js',
  'src/control-emission-design-repair-lab29.css',
  'src/renderer-auto-ux-lab29.js',
  'src/control-auto-ux-lab29.css',
  'src/renderer-final-ux-polish-lab29.js',
  'src/control-final-ux-polish-lab29.css',
  'src/services/releaseV2WindowSizingLab29.js'
])assert(fs.existsSync(file),`Falta ${file}`);

const design=read('src/renderer-emission-design-repair-lab29.js');
const designCss=read('src/control-emission-design-repair-lab29.css');
const auto=read('src/renderer-auto-ux-lab29.js');
const polish=read('src/renderer-final-ux-polish-lab29.js');
const polishCss=read('src/control-final-ux-polish-lab29.css');
const repairRelease=read('src/services/releaseV2UxRepairLab29.js');
const windowSizing=read('src/services/releaseV2WindowSizingLab29.js');
const bootstrap=read('src/bootstrap-v2lab.js');
const emissionEditor=read('src/renderer-emission-design-v2.js');
const emissionCore=read('src/services/emissionDesignLab29.js');
const promoOutput=read('src/output-youtube-promo.js');
const promoService=read('src/services/releaseV2YoutubePromo.js');
const cannedCss=read('src/control-canned-ux-lab29.css');
const queuePlanner=read('src/services/release0332.js');
const v2Lab=read('src/services/releaseV2Lab.js');
const productionFidelity=read('src/services/releaseV2ProductionFidelity.js');
const worker=read('src/tts_lab_worker.py');
new Function(polish);
new Function(windowSizing);
new Function(emissionEditor);
new Function(promoOutput);

const prereq=(auto.match(/function prerequisites\(\)\{([\s\S]*?)\n\s*\}/)||[])[1]||'';
for(const late of ['ecLanMonitorCard','ecYoutubePromoEnabled','ec28EmissionPanel','sessionCounters']){
  assert(!prereq.includes(late),`Automático no debe bloquear instalación base esperando ${late}`);
}
assert(/function (attach|reconcile)LateNodes\(/.test(auto),'Automático debe reconciliar nodos tardíos de forma independiente');
assert(auto.includes("profile:changed")&&/(attach|reconcile)LateNodes/.test(auto),'Cambio de perfil debe reconciliar nodos tardíos');

const repairPreview=(design.match(/function repairPreview\(\)\{([\s\S]*?)\n\s*\}/)||[])[1]||'';
assert(!repairPreview.includes('compactDesignLayout()'),'repairPreview no debe reparentar estructura en cada repaint');
assert(/function repairPromoPreview\(/.test(design),'Promo debe tener reparación WYSIWYG dedicada');
assert(design.includes("baseThumb=vertical?300:250")||design.includes("vertical?300:250"),'Promo debe usar miniatura base real 300/250 px');
assert(design.includes('ctaFontSize')&&design.includes('titleFontSize')&&design.includes('channelFontSize'),'Promo debe aplicar tamaños tipográficos nativos');
assert(!/ctaFontSize\s*\*\s*\.3/.test(design)&&!/titleFontSize\s*\*\s*\.3/.test(design),'Repair final no debe reducir tipografía Promo antes de escalar stage');
assert(/function syncModeButtons\(/.test(design),'Nota/Promo deben sincronizar estado visual de ambos botones');
assert(design.includes('verticalVideoBackgroundOptions'),'Diseño debe compactar Fondo videos 9:16');
assert(designCss.includes('ec-v2-vertical-bg-compact'),'Fondo videos 9:16 debe tener CSS compacto dedicado');

// Pulido final aprobado: exclusivas, bibliotecas, Audio, Ajustes y ciclo de contenidos.
assert(polish.includes('compactExclusiveCopy'),'Debe eliminar el texto largo lateral de Contenido exclusivo');
assert(polish.includes('ecAudioPronOptionsRow'),'Pronunciación debe reunir sus tres switches en una sola fila');
assert(polish.includes("q('#ec27AudioLeft')")&&polish.includes("q('#ec27AudioRight')"),'Audio debe conservar las dos columnas existentes');
assert(polish.includes('ec29SettingsClosuresGrid'),'Cierres automáticos deben compartir una fila 50/50');
assert(polish.includes('ecCannedCycleBlock'),'Ciclo de contenidos debe vivir dentro de Próximo contenido / selección');
assert(polishCss.includes('#adsLibraryCard')&&polishCss.includes('align-self:stretch'),'Anuncios debe igualar el ancho de Contenidos disponibles');
assert(polishCss.includes('#ecCannedRecoveryEnabled')&&polishCss.includes('opacity:0'),'El checkbox nativo de recuperación no debe quedar visible junto al slider');
assert(polishCss.includes('.ec29-closures-grid')&&polishCss.includes('repeat(2,minmax(0,1fr))'),'Cierres automáticos deben ser mitad y mitad');
assert(polishCss.includes('#ec29SettingsQueueCard .queue-colors input[type="color"]'),'Apariencia de la cola debe mostrar los selectores de color');
assert(polishCss.includes('.ec-audio-pron-options-row')&&polishCss.includes('repeat(3,minmax(0,1fr))'),'Los tres controles de pronunciación deben quedar en una línea');
assert(repairRelease.includes("injectFile(win,'control-final-ux-polish-lab29.css','css')"),'Debe inyectar el CSS final después de las capas anteriores');
assert(repairRelease.includes("injectFile(win,'renderer-final-ux-polish-lab29.js','js')"),'Debe inyectar el JS final después de las capas anteriores');

// Nueva iteración: persistencia automática, pipeline útil, cola compacta y tamaño inicial normal.
assert(polish.includes('hideManualSaveActions'),'Ajustes y Audio deben ocultar sus botones de guardado global');
assert(polish.includes('installAutomaticPersistence'),'Ajustes y Audio deben instalar guardado automático');
assert(polish.includes("q('#save')?.click()"),'Autosave debe reutilizar el guardado maestro existente');
assert(polish.includes("'#claudeKey'")&&polish.includes("'#geminiKey'"),'Autosave no debe interceptar credenciales que requieren Guardar y probar');
assert(polish.includes('syncPipelineDetail')&&polish.includes('ecAutoPipelineDetail'),'Pipeline detenido no debe duplicar el estado superior y el modo activo debe vivir en Preparación');
assert(polishCss.includes('#tab-auto #queue.queue-list')&&polishCss.includes('grid-auto-rows:max-content'),'La cola debe usar filas de altura de contenido');
assert(polishCss.includes('align-content:start'),'La cola no debe estirar una sola tarjeta para llenar su altura');
assert(polishCss.includes('#tab-auto #queue.queue-list>.queue-item')&&polishCss.includes('align-self:start'),'Cada tarjeta de cola debe conservar altura automática');
assert(polishCss.includes('#tab-settings .settings-save'),'El guardado global de Ajustes debe quedar oculto');
assert(windowSizing.includes('TARGET_WIDTH=1700')&&windowSizing.includes('TARGET_HEIGHT=1000'),'La ventana normal debe apuntar a 1700×1000');
assert(windowSizing.includes('screen.getDisplayMatching')&&windowSizing.includes('workArea'),'El tamaño inicial debe adaptarse al área útil real del monitor');
assert(windowSizing.includes('setBounds'),'La ventana debe redimensionarse como ventana normal');
assert(!windowSizing.includes('.maximize('),'La app no debe iniciar maximizada');
assert(bootstrap.includes("releaseV2WindowSizingLab29")&&bootstrap.indexOf('releaseV2WindowSizingLab29')<bootstrap.indexOf("require('./bootstrap-0332')"),'El ajuste de ventana debe instalarse antes de crear la ventana principal');

// Septiembre 14: optimización global por máquina + modelo TTS, no por perfil/voz.
const optimizationKeyBody=(v2Lab.match(/function optimizationKey\(tts=\{\}\)\{([\s\S]*?)\n\}/)||[])[1]||'';
const runtimeSigBody=(v2Lab.match(/function ttsRuntimeSignature\(tts=\{\}\)\{([\s\S]*?)\n\}/)||[])[1]||'';
assert(optimizationKeyBody.includes("qwen3tts:reference:base"),'Qwen base debe compartir una optimización entre voces y perfiles');
assert(!optimizationKeyBody.includes('referenceVoiceId'),'La clave de optimización no debe depender de la voz de referencia');
assert(!runtimeSigBody.includes('referenceVoiceId'),'La firma del runtime/modelo no debe invalidarse al cambiar de voz');
assert(!productionFidelity.includes("reason:'referencia Qwen distinta'")&&!productionFidelity.includes("reason:'voz de referencia Chatterbox distinta'"),'El perfil optimizado debe ser compatible al cambiar solo la voz dentro del mismo modelo TTS');

// Promo YouTube: defaults aprobados, edición numérica estable y Preview = Output para 16:9/9:16.
for(const token of ["preset:'custom',centerXPercent:50,centerYPercent:82,widthPercent:84,minHeightPercent:23.8,ctaFontSize:30,titleFontSize:40,channelFontSize:30,backgroundOpacity:.66,thumbnailScale:1.45","preset:'custom',centerXPercent:46.4,centerYPercent:76,widthPercent:78,minHeightPercent:12,ctaFontSize:25,titleFontSize:35,channelFontSize:25,backgroundOpacity:.70,thumbnailScale:.97"]){
  assert(emissionEditor.includes(token),`Falta default Promo aprobado: ${token}`);
  assert(emissionCore.includes(token),`Normalización debe compartir el mismo default Promo: ${token}`);
}
assert(emissionEditor.includes("n.addEventListener('blur',commitNumber)")&&emissionEditor.includes("e.key==='Enter'"),'Los campos numéricos Promo deben validar al terminar, no en cada tecla');
assert(!emissionEditor.includes("n.addEventListener('input',()=>apply(n))"),'No se debe reescribir el número mientras el usuario lo está tecleando');
for(const key of ['centerXPercent','centerYPercent','widthPercent','minHeightPercent','paddingPercent','gapPx'])assert(promoOutput.includes(key),`Output Promo debe consumir ${key}`);
assert(promoOutput.includes("window.ECAPI.on('output:design'")||promoOutput.includes('window.ECAPI.on("output:design"'),'Output Promo debe reaccionar a cambios de Diseño en vivo');
assert(promoService.includes('youtubePromoDesign')&&promoService.includes('design:'),'El snapshot de contenido debe transportar el diseño Promo efectivo');

// Recuperación activada debe verse activada.
assert(cannedCss.includes('.ec-canned-recovery-toggle input:checked + .switch-ui'),'El switch visual de Recuperación debe pintar estado ON');
assert(cannedCss.includes('transform:translateX'),'El switch visual de Recuperación debe mover el indicador al encender');

// Mientras un contenido está al aire, el anuncio posterior no puede proyectarse por encima.
const currentMediaLine=(queuePlanner.match(/const currentMedia=([^;]+);/)||[])[1]||'';
assert(currentMediaLine.includes("status||'').toUpperCase()==='AL AIRE'"),'La cola debe conservar el medio realmente AL AIRE');
assert(!currentMediaLine.includes("currentKind==='canned'&&r.sourceType==='ad'"),'Un anuncio programado después del contenido no debe tratarse como medio actual');

// Chatterbox debe limpiar también bursts/residuos entre oraciones, preservando duración.
assert(worker.includes('cleanup_chatterbox_pause_residuals'),'Chatterbox necesita limpieza conservadora de residuos internos entre frases');
assert(worker.includes('pause_cleanup_applied'),'El diagnóstico debe registrar cuándo se limpia una pausa interna');
execFileSync('python',['scripts/check-v2lab-chatterbox-tail.py'],{stdio:'inherit'});

require('./check-v2lab-settings-ux-lab29.js');
require('./check-v2lab-canned-ux-lab29.js');
console.log('Final Lab.29 UI stability checks: OK');
