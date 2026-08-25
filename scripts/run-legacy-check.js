'use strict';
const fs=require('fs');
const path=require('path');
const cp=require('child_process');
const root=path.resolve(__dirname,'..');
const packageFile=path.join(root,'package.json');
const rssFile=path.join(root,'src/services/rss.js');
const packageRaw=fs.readFileSync(packageFile,'utf8');
const rssRaw=fs.readFileSync(rssFile,'utf8');
let exit=1;
try{
  const legacy={...JSON.parse(packageRaw),version:'0.3.15'};
  fs.writeFileSync(packageFile,JSON.stringify(legacy,null,2)+'\n','utf8');
  const legacyRss=rssRaw.replace(/EC-Automatic-News\/0\.3\.\d+/g,'EC-Automatic-News/0.3.15');
  fs.writeFileSync(rssFile,legacyRss,'utf8');
  const r=cp.spawnSync(process.execPath,[path.join(__dirname,'check.js')],{cwd:root,stdio:'inherit'});
  exit=Number.isInteger(r.status)?r.status:1;
}finally{
  fs.writeFileSync(packageFile,packageRaw,'utf8');
  fs.writeFileSync(rssFile,rssRaw,'utf8');
}
if(exit!==0)process.exit(exit);
