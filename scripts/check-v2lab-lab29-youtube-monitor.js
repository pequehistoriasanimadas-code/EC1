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

// Regresión de encuadre adaptativo: solo videos de espera y contenidos.
const output=read('src/output.js');
const standbyOutput=read('src/output-0331.js');
const standbyCss=read('src/output-0331.css');
const renderer0331=read('src/renderer-0331.js');
assert(output.includes('applyAdaptiveVideoFit(cannedVideo)'),'Contenidos deben recalcular object-fit según proporción del video y del Output');
assert(output.includes("cannedVideo.addEventListener('loadedmetadata'"),'Contenidos deben analizar dimensiones intrínsecas al cargar metadata');
assert(standbyOutput.includes('applyAdaptiveVideoFit(video)'),'Standby debe recalcular object-fit según proporción del video y del Output');
assert(standbyOutput.includes("video.addEventListener('loadedmetadata'"),'Standby debe analizar dimensiones intrínsecas al cargar metadata');
assert(!output.includes('applyAdaptiveVideoFit(img)'),'Las imágenes de notas deben conservar cover + movimiento y quedar fuera del encuadre adaptativo de video');
assert(/#standbyVideo\{object-fit:contain/.test(standbyCss),'Standby debe usar contain como fallback seguro hasta conocer la proporción del video');
assert(renderer0331.includes('standbyFileName'),'La tarjeta de standby debe mostrar solo el nombre del archivo, no la ruta completa');
assert(renderer0331.includes('Se reproduce en loop y se adapta automáticamente al formato 16:9 / 9:16 del Output.'),'La tarjeta de standby debe usar la explicación compacta aprobada');
assert(!renderer0331.includes('Usa la misma transición configurada en Transiciones.'),'La tarjeta de standby no debe conservar la explicación técnica redundante');

require('./check-v2lab-auto-ux-lab29');
require('./check-v2lab-ux-regression-lab29');
require('./check-v2lab-global-ui-ownership-lab29');
console.log('Lab.29 YouTube persistence + single monitor adaptive cadence + adaptive video framing checks: OK');
