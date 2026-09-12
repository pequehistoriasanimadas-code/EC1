'use strict';
const fs=require('fs');
const assert=require('assert');
const read=file=>fs.readFileSync(file,'utf8');

for(const file of ['src/renderer-auto-ux-lab29.js','src/control-auto-ux-lab29.css']){
  assert(fs.existsSync(file),`Falta ${file}`);
}

const ui=read('src/renderer-auto-ux-lab29.js');
const css=read('src/control-auto-ux-lab29.css');
const lab29=read('src/renderer-lab29.js');
const queue=read('src/renderer-0332.js');

for(const id of [
  'ecAutoOperatorStrip','ecAutoLeft','ecAutoRight','ecAutoQueueActions',
  'ecAutoPrepSettingsHost','ecAutoExclusiveHost','ecAutoNowHost',
  'ecAutoEmissionHost','ecAutoSessionHost'
]) assert(ui.includes(id),`Falta host estable ${id}`);

assert(lab29.includes('renderer-auto-ux-lab29.js'),'Lab.29 debe cargar el nuevo UX Automático');
assert(ui.includes("q('#cannedEnabled')?.closest('.switch-row')"),'Debe mover el switch original de Contenidos');
assert(ui.includes("q('#ecYoutubePromoEnabled')?.closest('.switch-row')"),'Debe mover el switch original de Promo YouTube');
assert(ui.includes("q('#processStart')")&&ui.includes("q('#processPause')")&&ui.includes("q('#processResume')")&&ui.includes("q('#processStop')"),'Debe reutilizar los controles originales de preparación');
assert(ui.includes("q('#emissionStart')")&&ui.includes("q('#emissionPause')")&&ui.includes("q('#emissionResume')")&&ui.includes("q('#emissionStop')"),'Debe reutilizar los controles originales de emisión');
assert(ui.includes("q('#sessionCounters')"),'Debe reutilizar los contadores de sesión existentes');
assert(ui.includes("q('#ecLanMonitorCard')"),'Debe mover el monitor existente, no crear otro');
assert(ui.includes("q('#exclusiveSchedule0324')"),'Debe conservar la tarjeta exclusiva existente');
assert(ui.includes("q('.queue-card')")||ui.includes("q('#queue')?.closest('.queue-card')"),'Debe reutilizar la Cola de emisión existente');

assert(!ui.includes('renderQueue='),'El UX no puede apropiarse del renderer de cola');
assert(!ui.includes('outputMonitorFrame('),'El UX no puede crear un segundo capturador de monitor');
assert(!ui.includes('saveSettings('),'El UX no puede crear una segunda autoridad de persistencia para switches movidos');
assert(!/createElement\(['"]input['"]\)/.test(ui),'No debe clonar switches con inputs nuevos');
assert(!/PRÓXIMO|Próximo contenido/.test(ui),'No debe crear tarjeta o badge redundante de próximo contenido');
assert(!/ec-auto-row-icon|queue-item[^\n]{0,180}(?:svg|icon)/i.test(ui),'No debe añadir iconos decorativos a las tarjetas de cola');
assert(queue.includes('technicalHtml(row)')&&queue.includes('queue-meta')&&queue.includes('queue-exclusive'),'La cola estable debe conservar metadata, detalles técnicos y EXCLUSIVO');

assert(ui.includes("window.ECAPI.on?.('automation:state'")||ui.includes("window.ECAPI.on('automation:state'"),'Debe sincronizar resúmenes desde automation:state');
assert(ui.includes("window.ECAPI.on?.('output:state'")||ui.includes("window.ECAPI.on('output:state'"),'Debe sincronizar Ahora al aire/Output desde output:state');
assert(ui.includes("profile:changed"),'Debe rehidratar idempotentemente al cambiar de perfil');

assert(css.includes('.ec-auto-operator-grid'),'Debe existir el grid principal del operador');
assert(css.includes('grid-template-columns'),'Debe existir layout de dos columnas');
assert(css.includes('@media(max-width:1180px)'),'El layout debe apilarse por CSS en el breakpoint estable');
assert(!/window\.addEventListener\(['"]resize/.test(ui),'No debe reparentar DOM en resize');
assert(!/ResizeObserver/.test(ui),'El nuevo UX no necesita ResizeObserver para reordenar');
assert(css.includes('#openOutput::before')&&css.includes('monitor'),'Abrir Output debe usar icono visual de monitor');
assert(css.includes('.nav::before'),'La navegación debe usar una familia consistente de iconos');
assert(!/\.queue-item[^\{]*::before|\.queue-type[^\{]*::before|\.queue-item[^\{]*\.ec-icon/.test(css),'Las tarjetas de cola no deben recibir iconos decorativos');

console.log('check-v2lab-auto-ux-lab29: OK · consola Automático estable, sin duplicar autoridades ni iconos en tarjetas');
