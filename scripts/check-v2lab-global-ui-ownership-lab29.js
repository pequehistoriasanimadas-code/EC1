'use strict';
const fs=require('fs');
const assert=require('assert');
const read=file=>fs.readFileSync(file,'utf8');

const lab29=read('src/renderer-lab29.js');
const auto=read('src/renderer-auto-ux-lab29.js');
const cleanup=read('src/renderer-ux-cleanup-lab29.js');
const audio=read('src/renderer-audio-ux-lab29.js');
const design=read('src/renderer-emission-design-repair-lab29.js');

assert(!lab29.includes('card.innerHTML'),'Lab.29 no debe reconstruir la tarjeta del monitor ni destruir controles ajenos');
assert(!lab29.includes('ecMonitor29Image'),'Lab.29 no debe crear una segunda superficie de monitor');
assert(!lab29.includes('replaceMonitorCard'),'Lab.29 no debe reemplazar el monitor base');
assert(lab29.includes('productionGpuBusy()'),'Lab.29 debe conservar el refresco adaptativo durante carga IA/TTS');
assert(lab29.includes('ecMonitorImage'),'El refresco adaptativo debe reutilizar la superficie del monitor base');
assert(lab29.includes('__youtubePromoConfigLab29'),'La configuración de Promo YouTube debe conservar la ruta persistente dedicada');

assert(cleanup.includes('ecYoutubePromoControls'),'Contenidos/Anuncios debe esperar a que YouTube cree sus controles antes de reparentar tarjetas');
assert(/installCannedLayout[\s\S]*ecYoutubePromoControls/.test(cleanup),'El layout de Contenidos debe preservar el host YouTube antes de mover tarjetas');

assert(/function prerequisites\(\)[\s\S]*processStart[\s\S]*emissionStart/.test(auto),'Automático debe arrancar solo con nodos base estables');
assert(/reconcileLateNodes/.test(auto),'Automático debe reconciliar nodos tardíos');
assert(auto.includes('ecAutoMonitorControls'),'Automático debe mantener un host estable para controles de emisión');
assert(auto.includes('ec28EmissionPanel'),'Automático debe recuperar Ahora al aire cuando aparezca tarde');
assert(auto.includes('ecYoutubePromoEnabled'),'Automático debe recuperar Promo YouTube cuando aparezca tarde');

assert(audio.includes("profile:changed"),'Audio y locución debe rehidratar/reconciliar la UX al cambiar de perfil');
assert(design.includes('repairNotePreview')&&design.includes('repairPromoPreview'),'Diseño debe mantener reparación dedicada de Nota y Promo');
assert(!/function repairPreview\(\)[\s\S]{0,1500}compactDesignLayout\(\)/.test(design),'Diseño no debe reparentar estructura durante cada repaint');

console.log('Global Lab.29 UI ownership checks: OK');
