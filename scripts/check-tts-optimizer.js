'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const {candidateThreads,safeThreadCap,median,selectEfficientCandidate}=require('../src/services/ttsOptimizer');

assert.deepStrictEqual(candidateThreads(24),[2,4,6,8,10,12]);
assert.deepStrictEqual(candidateThreads(16),[2,4,6,8]);
assert.deepStrictEqual(candidateThreads(8),[2,4]);
assert.deepStrictEqual(candidateThreads(4),[2]);
assert.deepStrictEqual(candidateThreads(2),[1]);
assert.strictEqual(safeThreadCap(32),12);
assert.strictEqual(safeThreadCap(20),10);
assert.strictEqual(median([1.4,1.0]),1.2);

const winner=selectEfficientCandidate([
  {threads:2,realtimeFactor:2.30,safe:true},
  {threads:4,realtimeFactor:1.75,safe:true},
  {threads:6,realtimeFactor:1.48,safe:true},
  {threads:8,realtimeFactor:1.19,safe:true},
  {threads:10,realtimeFactor:.96,safe:true},
  {threads:12,realtimeFactor:.94,safe:true}
]);
assert.strictEqual(winner.threads,10,'Debe elegir el menor número de hilos dentro de 3% del mejor RTF');
const safeWinner=selectEfficientCandidate([{threads:8,realtimeFactor:1.1,safe:true},{threads:10,realtimeFactor:.9,safe:false,error:'cpu overload'}]);
assert.strictEqual(safeWinner.threads,8,'Nunca debe recomendar una configuración marcada como insegura');

const root=path.join(__dirname,'..');
const kokoro=fs.readFileSync(path.join(root,'src/services/kokoro.js'),'utf8');
const settings=fs.readFileSync(path.join(root,'src/services/settings.js'),'utf8');
const patches=fs.readFileSync(path.join(root,'src/renderer-patches.js'),'utf8');
assert(kokoro.includes('benchmarkCandidate')&&kokoro.includes('ensureWorker(profile,true)'),'El benchmark debe usar el worker persistente real');
assert(kokoro.includes('for(let n=0;n<2;n++)'),'Cada configuración debe medirse al menos dos veces');
assert(kokoro.includes('BENCHMARK_WARMUP'),'Debe existir warm-up antes de medir');
assert(kokoro.includes('performanceThreads'),'El perfil Rápido debe leer los hilos optimizados');
assert(kokoro.includes('startCpuMonitor')&&kokoro.includes('overloadPct=85'),'Debe existir protección de carga de CPU');
assert(kokoro.includes("priority:'below'"),'Kokoro debe ejecutarse con prioridad inferior para dejar margen al sistema');
assert(!kokoro.includes("for(const name of ['safe_streaming','balanced','performance'])"),'No debe quedar el benchmark antiguo de 2/3/6 hilos');
assert(settings.includes('performanceThreads:6'),'Los hilos optimizados deben tener un valor persistente por defecto');
assert(patches.includes("row?.querySelector('.f-name')")||patches.includes("row?.querySelector('.f-name')"),'Nueva RSS debe comenzar en Nombre');
assert(patches.includes('draftFeedIds')&&patches.includes('Completa Nombre y URL'),'Las RSS nuevas no deben colapsar incompletas');
assert(patches.includes("settings.tts.performanceThreads=Math.max(1,Number(r.recommendedThreads)"),'La recomendación real del backend debe guardarse en Ajustes');
console.log('Kokoro optimizer/RSS UX regression checks OK');
