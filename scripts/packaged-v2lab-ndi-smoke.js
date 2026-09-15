'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');

const resources=path.resolve(process.argv[2]||'');
assert(resources&&fs.existsSync(resources),`Resources empaquetados no encontrados: ${resources}`);
const bridge=path.join(resources,'runtime','ndi','gec-ndi-bridge.exe');
assert(fs.existsSync(bridge),`Bridge NDI empaquetado no encontrado: ${bridge}`);
const r=spawnSync(bridge,['--self-test'],{encoding:'utf8',windowsHide:true,timeout:15000});
if(r.error)throw r.error;
assert.strictEqual(r.status,0,`NDI bridge self-test falló: ${r.stderr||r.stdout}`);
const out=JSON.parse(String(r.stdout||'{}').trim());
assert.strictEqual(out.ok,true);
assert.strictEqual(out.protocol,1);
assert.strictEqual(out.packetHeader,28);
assert(Number(out.videoStruct)>=64&&Number(out.audioStruct)>=56,'ABI NDI bridge inesperada');
console.log('packaged-v2lab-ndi-smoke: OK · native bridge presente · protocolo/ABI válidos');
