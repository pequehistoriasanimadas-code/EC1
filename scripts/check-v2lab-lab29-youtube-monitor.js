'use strict';
const fs=require('fs');
const assert=require('assert');
const read=file=>fs.readFileSync(file,'utf8');

for(const file of ['src/services/releaseV2Lab29.js','src/renderer-lab29.js'])assert(fs.existsSync(file),`Falta ${file}`);
const release=read('src/services/releaseV2Lab29.js');
const ui=read('src/renderer-lab29.js');
const baseMonitor=read('src/renderer-lan-output.js');
const boot=read('src/bootstrap-v2lab.js');

assert(release.includes('preserveYoutubePromoState'),'Lab.29 debe proteger el estado YouTube frente a saveSettings genérico');
assert(release.includes('baseLoad.call(this)'),'La protección debe releer el estado persistido antes de guardar');
assert(release.includes('protectedYoutubePromo'),'links/videos deben provenir del estado persistido actual');
assert(release.includes('__youtubePromoConfigLab29'),'enabled/leadSeconds deben tener una ruta dedicada');
assert(ui.includes('__youtubePromoConfigLab29'),'La UI debe usar la ruta dedicada de configuración YouTube');
assert(!/saveYoutubeConfig\(\)[\s\S]{0,900}youtubePromo\.links\s*=/.test(ui),'La configuración global no debe reescribir links/videos');
assert(boot.indexOf('releaseV2Stabilization')<boot.indexOf('releaseV2Lab29'),'Lab.29 debe instalarse después de las capas Lab.27/28');

assert(/MONITOR_FPS\s*=\s*15/.test(ui),'Lab.29 debe conocer la cadencia normal del monitor base');
assert(/MONITOR_BUSY_FPS\s*=\s*5/.test(ui),'Monitor debe mantenerse vivo a 5 FPS durante carga IA/TTS/GPU');
assert(ui.includes('monitorCaptureInterval'),'Lab.29 debe aportar captura suplementaria durante producción ocupada');
assert(ui.includes('__ecMonitorRuntimeDiagnostics'),'Lab.29 debe exponer diagnóstico mínimo del monitor');
assert(ui.includes('ecMonitorImage')&&ui.includes('ecMonitorState'),'Lab.29 debe reutilizar la única superficie creada por renderer-lan-output');
assert(!ui.includes('ecMonitor29Image')&&!ui.includes('card.innerHTML')&&!ui.includes('replaceMonitorCard'),'Lab.29 no debe crear o reconstruir una segunda superficie de monitor');
assert(/productionGpuBusy\(\)/.test(ui),'La cadencia reducida debe depender de la carga de producción');
assert(/MONITOR_FPS\s*=\s*15/.test(baseMonitor),'renderer-lan-output conserva la superficie y cadencia base de 15 FPS');
assert(baseMonitor.includes('productionGpuBusy()'),'El monitor base debe ceder durante carga GPU para que Lab.29 aplique el suplemento de 5 FPS');

require('./check-v2lab-auto-ux-lab29');
require('./check-v2lab-ux-regression-lab29');
require('./check-v2lab-global-ui-ownership-lab29');
console.log('Lab.29 YouTube persistence + single monitor adaptive cadence checks: OK');
