'use strict';
const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');

const root=path.resolve(__dirname,'..');
const pkgFile=path.join(root,'package.json');
const originalText=fs.readFileSync(pkgFile,'utf8');
const original=JSON.parse(originalText);
let status=1;
try{
  const compat={...original,version:'0.3.27',main:'src/bootstrap-0327.js'};
  fs.writeFileSync(pkgFile,JSON.stringify(compat,null,2)+'\n','utf8');
  const r=spawnSync(process.execPath,[path.join(__dirname,'check-0327.js')],{cwd:root,stdio:'inherit'});
  status=Number.isInteger(r.status)?r.status:1;
}finally{
  fs.writeFileSync(pkgFile,originalText,'utf8');
}
const restored=JSON.parse(fs.readFileSync(pkgFile,'utf8'));
if(restored.version!==original.version||restored.main!==original.main){
  console.error(`No se restauró package.json ${original.version} / ${original.main} después del check 0.3.27`);
  process.exit(1);
}
if(status!==0)process.exit(status);
console.log(`Check 0.3.27 ejecutado en modo compatible; package ${original.version} / ${original.main} restaurado.`);
