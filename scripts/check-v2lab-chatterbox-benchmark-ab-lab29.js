'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

const perf=read('src/services/releaseV2ChatterboxPerformanceLab29.js');
const runtime=read('src/services/ttsLabRuntime.js');

const installerMatch=perf.match(/function\s+installReleaseV2ChatterboxPerformanceLab29\s*\(\)\s*\{([^}]*)\}/);
assert(installerMatch,'Debe existir installReleaseV2ChatterboxPerformanceLab29');
const installerBody=installerMatch[1];

assert(!installerBody.includes('installBenchmarkPolicy('),'La build A/B no debe instalar el wrapper Lab29 de pre-warmups de Chatterbox');
assert(installerBody.includes('installGpuSwapBatching('),'La build A/B debe conservar el batching GPU SWAP de Lab29');
assert(perf.includes('const GPU_SWAP_BATCH_SIZE=4'),'La build A/B debe conservar el bloque GPU SWAP de 4 etapas');

assert(runtime.includes("const warm=await this.generate(id,text,options)"),'El benchmark base debe conservar su warmup original');
assert(runtime.includes("const runs=[],stableRuns=id==='qwen3tts'?5:3"),'Chatterbox debe conservar las tres corridas estables del benchmark base');

console.log('check-v2lab-chatterbox-benchmark-ab-lab29: OK · benchmark base Chatterbox + GPU SWAP batching conservado');
