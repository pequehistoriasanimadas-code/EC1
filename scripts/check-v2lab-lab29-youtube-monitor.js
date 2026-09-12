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

assert(/MONITOR_FPS\s*=\s*15/.test(ui),'Monitor normal debe permanecer a 15 FPS');
assert(/MONITOR_BUSY_FPS\s*=\s*5/.test(ui),'Monitor debe mantenerse vivo a 5 FPS durante carga IA/TTS/GPU');
assert(ui.includes('monitorCaptureInterval'),'El controlador Lab.29 debe elegir la cadencia efectiva');
assert(ui.includes('__ecMonitorRuntimeDiagnostics'),'Lab.29 debe exponer diagnóstico mínimo del monitor');
assert(ui.includes('ecMonitor29Image')&&ui.includes('card.innerHTML'),'Lab.29 debe asumir la única superficie activa de captura');
assert(/productionGpuBusy\(\)/.test(ui),'La cadencia reducida debe depender de la carga de producción');
assert(!/if\(productionGpuBusy\(\)\)\{[\s\S]{0,350}return;\}/.test(ui),'La carga de IA/TTS no debe congelar el monitor Lab.29');
assert(/MONITOR_FPS\s*=\s*15/.test(baseMonitor),'Se preserva la base de monitor 15 FPS de Lab.28');

require('./check-v2lab-auto-ux-lab29');
require('./check-v2lab-ux-regression-lab29');
console.log('Lab.29 YouTube persistence + monitor adaptive cadence checks: OK');
