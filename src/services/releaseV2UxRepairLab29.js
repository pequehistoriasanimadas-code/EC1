'use strict';
const fs=require('fs');
const path=require('path');
const {app,BrowserWindow}=require('electron');
let installed=false;

function injectFile(win,file,kind='js'){
  try{
    const full=path.join(__dirname,'..',file);
    if(!fs.existsSync(full)||!win||win.isDestroyed())return;
    if(kind==='css'){win.webContents.insertCSS(fs.readFileSync(full,'utf8')).catch(()=>{});return;}
    const code=fs.readFileSync(full,'utf8');
    win.webContents.executeJavaScript(`(()=>{${code}\n})()`,true).catch(()=>{});
  }catch{}
}
function injectWindow(win){
  if(!win||win.isDestroyed())return;
  const run=()=>{
    if(!win||win.isDestroyed())return;
    const url=String(win.webContents.getURL()||'');if(!/control\.html(?:[?#]|$)/i.test(url))return;
    injectFile(win,'control-emission-design-repair-lab29.css','css');
    injectFile(win,'control-audio-repair-lab29.css','css');
    injectFile(win,'control-ux-cleanup-lab29.css','css');
    injectFile(win,'renderer-emission-design-repair-lab29.js','js');
    injectFile(win,'renderer-ux-cleanup-lab29.js','js');
  };
  win.webContents.on('did-finish-load',run);setTimeout(run,0);
}
function installReleaseV2UxRepairLab29(){
  if(installed)return;installed=true;
  app.on('browser-window-created',(_,win)=>injectWindow(win));
  for(const win of BrowserWindow.getAllWindows())injectWindow(win);
}
module.exports={installReleaseV2UxRepairLab29};
