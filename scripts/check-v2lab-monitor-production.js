'use strict';
const fs=require('fs');
const assert=require('assert');

const primary=fs.readFileSync('src/renderer-lan-output.js','utf8');
assert(primary.includes('optimizerActive()'),'El monitor debe conservar la detección del optimizador');
assert(primary.includes('productionGpuBusy()'),'El monitor debe seguir cediendo prioridad a IA/TTS/GPU');
assert(primary.includes('outputMonitorFrame()'),'El monitor debe capturar el Output real');
assert(/MONITOR_FPS\s*=\s*15/.test(primary),'Lab.28 debe fijar el monitor interno a 15 FPS');
assert(/1000\s*\/\s*MONITOR_FPS|Math\.round\(1000\/MONITOR_FPS\)/.test(primary),'La cadencia debe derivarse de 15 FPS');
assert(!/setInterval\([^;]{0,500},\s*900\s*\)/s.test(primary),'El controlador principal ya no debe refrescar el monitor cada 900 ms');
assert(/monitorBusy/.test(primary),'Las capturas no deben superponerse');
assert(/document\.hidden/.test(primary),'El monitor no debe capturar con la UI oculta');

const supplementPath='src/renderer-monitor-live-lab27.js';
assert(fs.existsSync(supplementPath),'Debe conservarse el asset heredado para compatibilidad de builds');
const supplement=fs.readFileSync(supplementPath,'utf8');
assert(!/setInterval/.test(supplement),'El refresco suplementario Lab.27 debe quedar desactivado para evitar un segundo controlador');
assert(!/outputMonitorFrame\(\)/.test(supplement),'El asset heredado no debe realizar capturas duplicadas');
assert(/Lab28|lab28|primary/i.test(supplement),'El no-op debe documentar que Lab.28 usa el controlador principal');

console.log('Lab.28 monitor: 15 FPS · controlador único · prioridad IA/TTS/GPU preservada');