'use strict';

const fs=require('fs');
const path=require('path');
const {app,BrowserWindow}=require('electron');
const {SettingsStore}=require('./settings');
const core=require('./youtubePromoLab27');

let installed=false;
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));

function preserveYoutubePromoState(persistedPromo,incomingConfig=null){
  const protectedYoutubePromo=core.normalizePromo(persistedPromo||{});
  if(incomingConfig&&typeof incomingConfig==='object'){
    protectedYoutubePromo.enabled=incomingConfig.enabled===true;
    protectedYoutubePromo.leadSeconds=core.normalizeLeadSeconds(incomingConfig.leadSeconds);
  }
  return protectedYoutubePromo;
}

function installYoutubePromoPersistenceGuard(){
  const p=SettingsStore.prototype;
  if(p.__ecLab29YoutubePersistence)return;
  Object.defineProperty(p,'__ecLab29YoutubePersistence',{value:true});
  const baseLoad=p.load,baseSave=p.save;
  p.save=function(settings,...args){
    const incoming=clone(settings)||{},config=clone(incoming.__youtubePromoConfigLab29||null);
    delete incoming.__youtubePromoConfigLab29;
    let persisted={};
    try{persisted=baseLoad.call(this)||{};}catch{}
    const protectedYoutubePromo=preserveYoutubePromoState(persisted?.canned?.youtubePromo,config);
    incoming.canned={...(incoming.canned||{}),youtubePromo:protectedYoutubePromo};
    return baseSave.call(this,incoming,...args);
  };
}

function injectFile(win,file){
  try{
    const full=path.join(__dirname,'..',file);
    if(!fs.existsSync(full))return;
    const code=fs.readFileSync(full,'utf8');
    win.webContents.executeJavaScript(`(()=>{${code}\n})()`,true).catch(()=>{});
  }catch{}
}
function injectWindow(win){
  if(!win||win.isDestroyed())return;
  const run=()=>{
    if(!win||win.isDestroyed())return;
    const url=String(win.webContents.getURL()||'');
    if(/control\.html(?:[?#]|$)/i.test(url)){
      injectFile(win,'renderer-lab29.js');
      injectFile(win,'renderer-auto-ux-lab29.js');
    }
  };
  win.webContents.on('did-finish-load',run);
  setTimeout(run,0);
}
function installWindowInjection(){
  app.on('browser-window-created',(_,win)=>injectWindow(win));
  for(const win of BrowserWindow.getAllWindows())injectWindow(win);
}

function installReleaseV2Lab29(){
  if(installed)return;
  installed=true;
  installYoutubePromoPersistenceGuard();
  installWindowInjection();
}

module.exports={preserveYoutubePromoState,installReleaseV2Lab29};
