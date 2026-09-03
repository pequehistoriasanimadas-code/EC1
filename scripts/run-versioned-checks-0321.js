'use strict';
const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');
const root=path.resolve(__dirname,'..'),pkgFile=path.join(root,'package.json'),originalText=fs.readFileSync(pkgFile,'utf8'),original=JSON.parse(originalText),legacy=['check-0316.js','check-0317.js','check-0318.js','check-0319.js','check-0320.js'];
let failed=false;
try{
  const compat={...original,version:'0.3.20'};fs.writeFileSync(pkgFile,JSON.stringify(compat,null,2)+'\n','utf8');
  for(const script of legacy){const r=spawnSync(process.execPath,[path.join(__dirname,script)],{cwd:root,stdio:'inherit'});if(r.status!==0){failed=true;break;}}
}finally{fs.writeFileSync(pkgFile,originalText,'utf8');}
if(failed)process.exit(1);
const current=JSON.parse(fs.readFileSync(pkgFile,'utf8'));if(current.version!=='0.3.21'){console.error('No se restauró package.json 0.3.21 después de checks compatibles');process.exit(1);}console.log('Checks históricos 0.3.16–0.3.20 ejecutados en modo compatible y package 0.3.21 restaurado.');
