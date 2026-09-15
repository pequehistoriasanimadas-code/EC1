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
  'src/services/releaseV2WindowSizingLab29.js',
  'src/services/releaseV2FinalCorrectionsLab29.js',
  'src/renderer-final-corrections-lab29.js',
  'src/control-final-corrections-lab29.css',
  'src/output-youtube-promo-v2-lab29.js',
  'src/output-youtube-promo-v2-lab29.css',
  'src/chatterbox_pause_cleanup_lab29.py'
])assert(fs.existsSync(file),`Falta ${file}`);

const design=read('src/renderer-emission-design-repair-lab29.js');
const designCss=read('src/control-emission-design-repair-lab29.css');
const auto=read('src/renderer-auto-ux-lab29.js');
const polish=read('src/renderer-final-ux-polish-lab29.js');
const polishCss=read('src/control-final-ux-polish-lab29.css');
const repairRelease=read('src/services/releaseV2UxRepairLab29.js');
const windowSizing=read('src/services/releaseV2WindowSizingLab29.js');
const bootstrap=read('src/bootstrap-v2lab.js');
const finalService=read('src/services/releaseV2FinalCorrectionsLab29.js');
const finalRenderer=read('src/renderer-final-corrections-lab29.js');
const finalCss=read('src/control-final-corrections-lab29.css');
const promoOutput=read('src/output-youtube-promo-v2-lab29.js');
const promoOutputCss=read('src/output-youtube-promo-v2-lab29.css');
const outputWeb=read('src/output-web.html');
const chatterCleanup=read('src/chatterbox_pause_cleanup_lab29.py');
new Function(polish);
new Function(windowSizing);
new Function(finalService);
new Function(finalRenderer);
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
const modelKeyBody=(finalService.match(/function modelOptimizationKey\(tts=\{\}\)\{([\s\S]*?)\n\}/)||[])[1]||'';
assert(modelKeyBody.includes("'qwen3tts:reference:base'"),'Qwen Base debe tener una sola optimización por máquina/modelo');
assert(!modelKeyBody.includes('referenceVoiceId'),'La clave canónica no debe depender de la voz de referencia');
assert(finalService.includes('tts-model-optimizations-lab29.json'),'La caché por modelo debe vivir fuera de los perfiles');
assert(finalService.includes("k.startsWith('qwen3tts:reference:')"),'Debe migrar las optimizaciones antiguas ligadas a una voz');
assert(finalService.includes("filter(x=>!/^reference=/.test(x))"),'La firma canónica del runtime/modelo debe ignorar la voz de referencia');
assert(finalService.includes('fineTunedModelId'),'Los modelos Qwen fine-tuned deben conservar optimización independiente');
assert(finalService.includes('referencia Qwen distinta')&&finalService.includes('voz de referencia Chatterbox distinta'),'Una diferencia solo de voz debe rehabilitar el perfil de producción del mismo modelo');

// Promo YouTube: defaults aprobados, edición numérica estable y Preview = Output para 16:9/9:16.
for(const token of ["preset:'custom',centerXPercent:50,centerYPercent:82,widthPercent:84,minHeightPercent:23.8,ctaFontSize:30,titleFontSize:40,channelFontSize:30,backgroundOpacity:.66,thumbnailScale:1.45","preset:'custom',centerXPercent:46.4,centerYPercent:76,widthPercent:78,minHeightPercent:12,ctaFontSize:25,titleFontSize:35,channelFontSize:25,backgroundOpacity:.70,thumbnailScale:.97"]){
  assert(finalService.includes(token),`Persistencia debe conocer el default aprobado: ${token}`);
  assert(finalRenderer.includes(token),`Reset UI debe usar el default aprobado: ${token}`);
}
assert(finalRenderer.includes("n.addEventListener('blur',commitNumber)")&&finalRenderer.includes("e.key==='Enter'"),'Los campos numéricos Promo deben validar al terminar, no en cada tecla');
assert(!finalRenderer.includes("n.addEventListener('input',commitNumber)"),'La cifra no debe normalizarse durante cada pulsación');
for(const key of ['centerXPercent','centerYPercent','widthPercent','minHeightPercent','paddingPercent','gapPx'])assert(promoOutput.includes(key),`Output Promo debe consumir ${key}`);
assert(promoOutput.includes("window.ECAPI.on('output:design'")&&promoOutput.includes("window.ECAPI.on('output:story'"),'Output Promo debe responder al diseño en vivo y al snapshot de cada contenido');
assert(finalService.includes('youtubePromoDesign')&&finalService.includes('design:promo.design'),'El snapshot de contenido debe transportar el diseño Promo efectivo');
assert(promoOutputCss.includes('translate(-50%,-50%)')&&promoOutputCss.includes('--yt-v2-width'),'El Output debe usar geometría centrada V2 en vez de ancho fijo antiguo');
assert(outputWeb.includes('output-youtube-promo-v2-lab29.css')&&outputWeb.includes('output-youtube-promo-v2-lab29.js'),'LAN debe usar el mismo renderer V2 de Promo');

// Recuperación activada debe verse activada.
assert(finalCss.includes('.ec-canned-recovery-toggle input:checked + .switch-ui'),'El switch visual de Recuperación debe pintar estado ON');
assert(finalCss.includes('transform:translateX'),'El switch visual de Recuperación debe mover el indicador al encender');

// Mientras un contenido está al aire, el anuncio posterior debe proyectarse debajo.
assert(finalService.includes('function fixProjectedQueueOrder'),'Debe existir reparación final de orden de cola');
assert(finalService.includes("kind==='canned'")&&finalService.includes("r.sourceType==='ad'")&&finalService.includes('Después del contenido'),'Contenido AL AIRE debe preceder a su anuncio programado');
assert(finalService.includes('displayPosition:n')&&finalService.includes('sessionSeq:n'),'La numeración debe recalcularse tras corregir el orden');

// Chatterbox: limpieza externa conservadora sobre el WAV final, sin tocar chunk/temperatura/modelo.
assert(finalService.includes("String(id)!=='chatterbox'")&&finalService.includes('chatterbox_pause_cleanup_lab29.py'),'Solo Chatterbox debe pasar por el nuevo postprocesado');
assert(chatterCleanup.includes('pause_cleanup_strong_events')&&chatterCleanup.includes('pause_cleanup_weak_events'),'Debe distinguir burst fuerte y residuo débil');
assert(chatterCleanup.includes('duration_preserved'),'La limpieza debe preservar sincronía/duración');
execFileSync('python',['scripts/check-v2lab-chatterbox-tail.py'],{stdio:'inherit'});

assert(bootstrap.includes("releaseV2FinalCorrectionsLab29")&&bootstrap.indexOf('releaseV2FinalCorrectionsLab29')>bootstrap.indexOf('releaseV2UxRepairLab29'),'La capa final debe instalarse después de compatibilidad/UX existentes');
require('./check-v2lab-settings-ux-lab29.js');
require('./check-v2lab-canned-ux-lab29.js');
console.log('Final Lab.29 UI stability checks: OK');
