'use strict';
const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process');
const root=path.resolve(__dirname,'..'),pkgFile=path.join(root,'package.json'),preloadFile=path.join(root,'src','preload.js');
const pkgText=fs.readFileSync(pkgFile,'utf8'),pkg=JSON.parse(pkgText),preloadText=fs.readFileSync(preloadFile,'utf8');let code=1;
try{
  fs.writeFileSync(pkgFile,JSON.stringify({...pkg,version:'0.3.30',main:'src/bootstrap-0330.js'},null,2)+'\n');
  fs.writeFileSync(preloadFile,preloadText.replace("injectAsset('link',{rel:'stylesheet',href:'control-0331.css'});",'').replace("injectAsset('script',{src:'renderer-0331.js'});",'').replace("injectAsset('link',{rel:'stylesheet',href:'output-0331.css'});",'').replace("injectAsset('script',{src:'output-0331.js'});",''));
  for(const script of ['check-0330.js','check-0330-final.js']){const r=spawnSync(process.execPath,[path.join(__dirname,script)],{cwd:root,stdio:'inherit'});code=Number.isInteger(r.status)?r.status:1;if(code!==0)break;}
}finally{fs.writeFileSync(pkgFile,pkgText);fs.writeFileSync(preloadFile,preloadText);}
if(code!==0)process.exit(code);console.log('Checks 0.3.30 ejecutados en modo compatible; package 0.3.31 / bootstrap 0.3.31 restaurado.');
