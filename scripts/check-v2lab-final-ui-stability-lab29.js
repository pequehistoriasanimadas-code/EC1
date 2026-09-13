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
  'src/control-final-ux-polish-lab29.css'
])assert(fs.existsSync(file),`Falta ${file}`);

const design=read('src/renderer-emission-design-repair-lab29.js');
const designCss=read('src/control-emission-design-repair-lab29.css');
const auto=read('src/renderer-auto-ux-lab29.js');
const polish=read('src/renderer-final-ux-polish-lab29.js');
const polishCss=read('src/control-final-ux-polish-lab29.css');
const repairRelease=read('src/services/releaseV2UxRepairLab29.js');
new Function(polish);

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
assert(polish.includes('ec29AudioLeft')&&polish.includes('ec29AudioRight'),'Audio debe conservar las dos columnas existentes');
assert(polish.includes('ec29SettingsClosuresGrid'),'Cierres automáticos deben compartir una fila 50/50');
assert(polish.includes('ecCannedCycleBlock'),'Ciclo de contenidos debe vivir dentro de Próximo contenido / selección');
assert(polishCss.includes('#adsLibraryCard')&&polishCss.includes('align-self:stretch'),'Anuncios debe igualar el ancho de Contenidos disponibles');
assert(polishCss.includes('#ecCannedRecoveryEnabled')&&polishCss.includes('opacity:0'),'El checkbox nativo de recuperación no debe quedar visible junto al slider');
assert(polishCss.includes('.ec29-closures-grid')&&polishCss.includes('repeat(2,minmax(0,1fr))'),'Cierres automáticos deben ser mitad y mitad');
assert(polishCss.includes('#ec29SettingsQueueCard .queue-colors input[type="color"]'),'Apariencia de la cola debe mostrar los selectores de color');
assert(polishCss.includes('.ec-audio-pron-options-row')&&polishCss.includes('repeat(3,minmax(0,1fr))'),'Los tres controles de pronunciación deben quedar en una línea');
assert(repairRelease.includes("injectFile(win,'control-final-ux-polish-lab29.css','css')"),'Debe inyectar el CSS final después de las capas anteriores');
assert(repairRelease.includes("injectFile(win,'renderer-final-ux-polish-lab29.js','js')"),'Debe inyectar el JS final después de las capas anteriores');

require('./check-v2lab-settings-ux-lab29.js');
require('./check-v2lab-canned-ux-lab29.js');
console.log('Final Lab.29 UI stability checks: OK');
