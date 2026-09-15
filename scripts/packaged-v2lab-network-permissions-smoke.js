'use strict';
const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');

const resourcesDir=path.resolve(process.argv[2]||'');
if(!resourcesDir||!fs.existsSync(resourcesDir)){
  console.error('Missing resources directory.');
  process.exit(2);
}

const helper=path.join(resourcesDir,'runtime','network','gec-network-permissions.exe');
if(!fs.existsSync(helper)){
  console.error(`Missing packaged network permission helper: ${helper}`);
  process.exit(3);
}

const result=spawnSync(helper,['--self-test'],{encoding:'utf8',windowsHide:true,timeout:10000});
if(result.error){
  console.error(result.error.message||String(result.error));
  process.exit(4);
}
if(Number(result.status)!==0){
  console.error(result.stderr||result.stdout||`Helper exited with ${result.status}`);
  process.exit(5);
}
let payload=null;
try{payload=JSON.parse(String(result.stdout||'').trim().split(/\r?\n/).filter(Boolean).pop()||'{}');}catch(e){
  console.error(`Invalid helper self-test JSON: ${e.message}`);
  process.exit(6);
}
if(payload?.ok!==true||payload?.mode!=='self-test'||payload?.supported!==true){
  console.error(`Unexpected helper self-test payload: ${JSON.stringify(payload)}`);
  process.exit(7);
}

console.log('packaged-v2lab-network-permissions-smoke: OK · helper present + non-destructive self-test');
