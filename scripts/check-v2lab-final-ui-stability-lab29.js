'use strict';
const fs=require('fs');
const assert=require('assert');
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
new Function(polish);
new Function(windowSizing);

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

require('./check-v2lab-settings-ux-lab29.js');
require('./check-v2lab-canned-ux-lab29.js');
console.log('Final Lab.29 UI stability checks: OK');
