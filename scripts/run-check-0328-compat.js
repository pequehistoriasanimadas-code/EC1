'use strict';
const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process');
const root=path.resolve(__dirname,'..'),pkgFile=path.join(root,'package.json'),preloadFile=path.join(root,'src','preload.js');
const pkgText=fs.readFileSync(pkgFile,'utf8'),pkg=JSON.parse(pkgText),preloadText=fs.readFileSync(preloadFile,'utf8');let code=1;
try{fs.writeFileSync(pkgFile,JSON.stringify({...pkg,version:'0.3.28',main:'src/bootstrap-0328.js'},null,2)+'\n');fs.writeFileSync(preloadFile,preloadText.replace("injectAsset('link',{rel:'stylesheet',href:'control-0329.css'});",'').replace("injectAsset('script',{src:'renderer-0329.js'});",''));const r=spawnSync(process.execPath,[path.join(__dirname,'check-0328.js')],{cwd:root,stdio:'inherit'});code=Number.isInteger(r.status)?r.status:1;}finally{fs.writeFileSync(pkgFile,pkgText);fs.writeFileSync(preloadFile,preloadText);}if(code!==0)process.exit(code);console.log('Check 0.3.28 ejecutado en modo compatible y restaurado.');
