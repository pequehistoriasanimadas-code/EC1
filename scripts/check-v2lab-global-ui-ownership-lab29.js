'use strict';
const fs=require('fs');
const assert=require('assert');
const read=file=>fs.readFileSync(file,'utf8');

for(const file of [
  'src/renderer-lab29.js',
  'src/renderer-auto-ux-lab29.js',
  'src/renderer-ux-cleanup-lab29.js',
  'src/renderer-audio-profile-sync-lab29.js',
  'src/renderer-emission-design-repair-lab29.js',
  'src/services/releaseV2UxRepairLab29.js',
  'src/services/releaseV2StartupUiAudit.js'
])assert(fs.existsSync(file),`Falta ${file}`);

const lab29=read('src/renderer-lab29.js');
const auto=read('src/renderer-auto-ux-lab29.js');
const cleanup=read('src/renderer-ux-cleanup-lab29.js');
const audioSync=read('src/renderer-audio-profile-sync-lab29.js');
const design=read('src/renderer-emission-design-repair-lab29.js');
const uxRelease=read('src/services/releaseV2UxRepairLab29.js');
const startupAudit=read('src/services/releaseV2StartupUiAudit.js');
const boot=read('src/bootstrap-v2lab.js');
const workflow=read('.github/workflows/build-windows.yml');
new Function(audioSync);
new Function(startupAudit);

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

assert(audioSync.includes("profile:changed"),'Audio y locución debe rehidratarse al cambiar de perfil');
assert(audioSync.includes('getSettings'),'Audio debe releer ajustes efectivos del perfil activo');
assert(audioSync.includes('referenceVoiceId')&&audioSync.includes('v2ReferenceVoice'),'Audio debe recuperar la voz de referencia seleccionada por perfil');
assert(audioSync.includes('v2TtsEngine')&&audioSync.includes('v2VoiceStyle'),'Audio debe recuperar motor y estilo por perfil');
assert(uxRelease.includes("renderer-audio-profile-sync-lab29.js"),'La sincronización de Audio por perfil debe inyectarse en Control');
assert(uxRelease.includes('injectAutoNowGuard'),'Automático debe tener recuperación acotada de Ahora al aire');
assert(!uxRelease.includes('new MutationObserver'),'La recuperación de Ahora al aire no debe observar todo el DOM ni crear bucles de mutación');
assert(/tries\+\+<120/.test(uxRelease),'La recuperación de Ahora al aire debe tener reintentos acotados');

assert(design.includes('repairNotePreview')&&design.includes('repairPromoPreview'),'Diseño debe mantener reparación dedicada de Nota y Promo');
assert(!/function repairPreview\(\)[\s\S]{0,1500}compactDesignLayout\(\)/.test(design),'Diseño no debe reparentar estructura durante cada repaint');

assert(startupAudit.includes('CONTROL_UI_REGRESSION_OK')&&startupAudit.includes('CONTROL_UI_REGRESSION_FAIL'),'Startup smoke debe registrar éxito/fallo de la auditoría real del DOM final');
for(const id of ['ecAutoOperatorStrip','ecAutoMonitorControls','ec28EmissionPanel','ecEmissionV2PreviewCard','ecYoutubePromoEnabled','v2TtsEngine'])assert(startupAudit.includes(id),`Startup smoke debe comprobar ${id}`);
assert(startupAudit.includes('__EC_FINAL_UI_READY__')&&startupAudit.includes('__gecV2TtsLabUi'),'La auditoría debe bloquear CONTROL_UI_READY hasta que el DOM final sea válido');
assert(boot.includes("releaseV2StartupUiAudit")&&boot.indexOf('releaseV2StartupUiAudit')<boot.indexOf("require('./bootstrap-0332')"),'La auditoría debe instalarse antes de crear Control');
assert(workflow.includes('--startup-smoke')&&workflow.includes('CONTROL_UI_READY:'),'Windows Portable debe ejecutar el arranque real que queda bloqueado por la auditoría final');

console.log('Global Lab.29 UI ownership checks: OK');
