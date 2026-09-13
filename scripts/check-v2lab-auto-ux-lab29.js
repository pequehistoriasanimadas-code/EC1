'use strict';
const fs=require('fs');
const assert=require('assert');
const read=file=>fs.readFileSync(file,'utf8');

for(const file of ['src/renderer-auto-ux-lab29.js','src/control-auto-ux-lab29.css','src/renderer-canned-ux-lab29.js','src/control-canned-ux-lab29.css']){
  assert(fs.existsSync(file),`Falta ${file}`);
}

const ui=read('src/renderer-auto-ux-lab29.js');
const cannedUi=read('src/renderer-canned-ux-lab29.js');
const css=read('src/control-auto-ux-lab29.css');
const cannedCss=read('src/control-canned-ux-lab29.css');
const release=read('src/services/releaseV2Lab29.js');
const repairRelease=read('src/services/releaseV2UxRepairLab29.js');
const queue=read('src/renderer-0332.js');
const emission=read('src/renderer-0328.js');
new Function(ui);new Function(cannedUi);

for(const id of [
  'ecAutoOperatorStrip','ecAutoLeft','ecAutoRight','ecAutoQueueActions',
  'ecAutoPrepSettingsHost','ecAutoExclusiveHost','ecAutoNowHost',
  'ecAutoEmissionHost','ecAutoSessionHost'
]) assert(ui.includes(id),`Falta host estable ${id}`);
assert(cannedUi.includes('ecAutoAdsToggleHost'),'Falta host estable ecAutoAdsToggleHost');

assert(release.includes("injectFile(win,'renderer-auto-ux-lab29.js')"),'Lab.29 debe inyectar el UX Automático en control.html');
assert(repairRelease.includes("injectFile(win,'renderer-canned-ux-lab29.js','js')"),'El complemento de Contenidos debe inyectarse para mover Anuncios');
assert(ui.includes("q('#cannedEnabled')?.closest('.switch-row')"),'Debe mover el switch original de Contenidos');
assert(cannedUi.includes("q('#adsAfterCanned')?.closest('.switch-row')"),'Debe mover el switch original de Anuncios');
assert(ui.includes("q('#ecYoutubePromoEnabled')?.closest('.switch-row')"),'Debe mover el switch original de Promo YouTube');
assert(cannedUi.includes("insertBefore(host,promo)"),'Anuncios debe insertarse inmediatamente antes de Promo YouTube');
assert(/adsRow[\s\S]{0,500}textContent='Anuncios'/.test(cannedUi)||/const b=adsRow[\s\S]{0,200}textContent='Anuncios'/.test(cannedUi),'El switch movido de anuncios debe mostrarse como “Anuncios” en la franja superior');
assert(cannedUi.includes("adsSwitches:document.querySelectorAll('#adsAfterCanned').length"),'La auditoría debe comprobar que existe un solo switch de Anuncios');
assert(cannedUi.includes('#adsAfterCanned'),'La reconciliación tardía debe contemplar el switch de Anuncios');
assert(ui.includes("q('#processStart')?.closest('.buttons')"),'Debe mover el grupo original de controles de preparación, no clonarlo');
assert(ui.includes("q('#emissionStart')?.closest('.card')"),'Debe mover la tarjeta/control original de emisión, no clonarlo');
assert(ui.includes("q('#sessionCounters')"),'Debe reutilizar los contadores de sesión existentes');
assert(ui.includes("q('#ecLanMonitorCard')"),'Debe mover el monitor existente, no crear otro');
assert(ui.includes("q('#exclusiveSchedule0324')"),'Debe conservar la tarjeta exclusiva existente');
assert(ui.includes("q('.queue-card')")||ui.includes("q('#queue')?.closest('.queue-card')"),'Debe reutilizar la Cola de emisión existente');
assert(ui.includes("q('#ec28EmissionPanel')"),'Ahora al aire debe reutilizar el panel/progreso existente');
assert(emission.includes("panel.id='ec28EmissionPanel'")&&emission.includes('renderEmissionControl'),'renderer-0328 debe seguir siendo la autoridad de Ahora al aire');

assert(!ui.includes('renderQueue='),'El UX no puede apropiarse del renderer de cola');
assert(!cannedUi.includes('renderQueue='),'El complemento de Anuncios tampoco puede tocar el renderer de cola');
assert(!ui.includes('outputMonitorFrame('),'El UX no puede crear un segundo capturador de monitor');
assert(!ui.includes('saveSettings('),'El UX Automático no puede crear una segunda autoridad de persistencia para switches movidos');
assert(!/adsAfterCanned[^\n]{0,220}addEventListener\(['"]change/.test(cannedUi),'Mover Anuncios no debe crear una segunda autoridad de persistencia');
assert(!/ec-auto-row-icon|queue-item[^\n]{0,180}(?:svg|icon)/i.test(ui),'No debe añadir iconos decorativos a las tarjetas de cola');
assert(!/ecAutoNowBadge|ecAutoNowTitle|function\s+renderNow/.test(ui),'No debe existir una segunda autoridad visual para el estado al aire');
assert(queue.includes('technicalHtml(row)')&&queue.includes('queue-meta')&&queue.includes('queue-exclusive'),'La cola estable debe conservar metadata, detalles técnicos y EXCLUSIVO');

assert(ui.includes("window.ECAPI?.on?.('automation:state'")||ui.includes("window.ECAPI.on?.('automation:state'"),'Debe sincronizar resúmenes desde automation:state');
assert(ui.includes("window.ECAPI?.on?.('output:state'")||ui.includes("window.ECAPI.on?.('output:state'"),'Debe sincronizar el resumen de Output desde output:state');
assert(ui.includes("profile:changed")&&cannedUi.includes("profile:changed"),'Debe rehidratar idempotentemente al cambiar de perfil');

assert(css.includes('.ec-auto-operator-grid'),'Debe existir el grid principal del operador');
assert(css.includes('grid-template-columns'),'Debe existir layout de dos columnas');
assert(cannedCss.includes('repeat(8,minmax(0,1fr))'),'La franja superior ancha debe reservar ocho columnas incluyendo Anuncios');
assert(css.includes('@media(max-width:1180px)'),'El layout debe apilarse por CSS en el breakpoint estable');
assert(!/window\.addEventListener\(['"]resize/.test(ui+cannedUi),'No debe reparentar DOM en resize');
assert(!/ResizeObserver/.test(ui+cannedUi),'El nuevo UX no necesita ResizeObserver para reordenar');
assert(css.includes('#openOutput::before')&&css.includes('monitor'),'Abrir Output debe usar icono visual de monitor');
assert(css.includes('.nav::before'),'La navegación debe usar una familia consistente de iconos');
assert(css.includes('#ecAutoNowCard #ec28EmissionPanel .ec28-next{display:none!important}'),'Ahora al aire no debe duplicar el siguiente elemento fuera de la Cola');
assert(!/\.queue-item[^\{]*::before|\.queue-type[^\{]*::before|\.queue-item[^\{]*\.ec-icon/.test(css),'Las tarjetas de cola no deben recibir iconos decorativos');

console.log('check-v2lab-auto-ux-lab29: OK · Automático conserva su layout y mueve Anuncios junto a Contenidos/Promo sin duplicar controles');
