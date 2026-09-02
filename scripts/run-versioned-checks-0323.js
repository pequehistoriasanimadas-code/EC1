'use strict';
const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');
const root=path.resolve(__dirname,'..'),pkgFile=path.join(root,'package.json'),originalText=fs.readFileSync(pkgFile,'utf8'),original=JSON.parse(originalText);
let failed=false;
function run(script,version){
  const compat={...original,version};fs.writeFileSync(pkgFile,JSON.stringify(compat,null,2)+'\n','utf8');
  const r=spawnSync(process.execPath,[path.join(__dirname,script)],{cwd:root,stdio:'inherit'});if(r.status!==0)failed=true;
}
try{
  for(const script of ['check-0316.js','check-0317.js','check-0318.js','check-0319.js','check-0320.js']){run(script,'0.3.20');if(failed)break;}
  if(!failed)run('check-0321.js','0.3.21');
  if(!failed)run('check-0322.js','0.3.22');
}finally{fs.writeFileSync(pkgFile,originalText,'utf8');}
if(failed)process.exit(1);
const current=JSON.parse(fs.readFileSync(pkgFile,'utf8'));if(current.version!=='0.3.23'){console.error('No se restauró package.json 0.3.23 después de checks compatibles');process.exit(1);}console.log('Checks históricos 0.3.16–0.3.22 ejecutados en modo compatible y package 0.3.23 restaurado.');
