'use strict';
const fs=require('fs');
const path=require('path');
const cp=require('child_process');
const root=path.resolve(__dirname,'..'),file=path.join(root,'package.json'),raw=fs.readFileSync(file,'utf8');
let exit=1;
try{
  const legacy={...JSON.parse(raw),version:'0.3.15'};fs.writeFileSync(file,JSON.stringify(legacy,null,2)+'\n','utf8');
  const r=cp.spawnSync(process.execPath,[path.join(__dirname,'check.js')],{cwd:root,stdio:'inherit'});exit=Number.isInteger(r.status)?r.status:1;
}finally{fs.writeFileSync(file,raw,'utf8');}
if(exit!==0)process.exit(exit);
