'use strict';
const fs=require('fs');
const assert=require('assert');

const legacy=fs.readFileSync('src/renderer-lan-output.js','utf8');
assert(legacy.includes('optimizerActive()'),'El monitor heredado debe conservar la detección del optimizador');
assert(legacy.includes('outputMonitorFrame()'),'El monitor heredado debe capturar el Output');

const supplementPath='src/renderer-monitor-live-lab27.js';
assert(fs.existsSync(supplementPath),'Lab.27 debe incluir el refresco suplementario del monitor durante producción');
const supplement=fs.readFileSync(supplementPath,'utf8');
assert(supplement.includes('outputMonitorFrame()'),'El refresco Lab.27 debe pedir frames del Output');
assert(/aiBusy|voiceBusy|gpuStageBusy/.test(supplement),'El refresco Lab.27 debe reconocer cuándo el monitor heredado queda bloqueado por producción');
assert(/optimizer/i.test(supplement),'El refresco Lab.27 debe respetar la pausa del optimizador');
assert(/900/.test(supplement),'El refresco Lab.27 debe conservar una cadencia aproximada de 900 ms');
assert(/document\.hidden/.test(supplement),'El refresco Lab.27 no debe capturar con la UI oculta');
console.log('Lab.27 monitor production refresh: OK');
