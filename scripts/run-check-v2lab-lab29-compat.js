'use strict';
const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');
const root=path.resolve(__dirname,'..'),pkgFile=path.join(root,'package.json'),original=fs.readFileSync(pkgFile,'utf8');
const scriptName=String(process.argv[2]||'check-v2lab.js');
const scriptPath=path.join(__dirname,scriptName);
if(!fs.existsSync(scriptPath))throw new Error(`Check histórico no encontrado: ${scriptName}`);
let result;
try{
  const pkg=JSON.parse(original);pkg.version='2.0.0-lab.28';fs.writeFileSync(pkgFile,JSON.stringify(pkg,null,2)+'\n','utf8');
  result=spawnSync(process.execPath,[scriptPath],{cwd:root,stdio:'inherit'});
}finally{fs.writeFileSync(pkgFile,original,'utf8');}
if(result?.error)throw result.error;
process.exit(Number(result?.status)||0);
