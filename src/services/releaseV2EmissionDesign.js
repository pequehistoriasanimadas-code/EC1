'use strict';

const fs=require('fs');
const path=require('path');
const {app,BrowserWindow}=require('electron');
const {SettingsStore}=require('./settings');
const {
  normalizeNoteDesignRoot,
  normalizePromoDesignRoot,
  materializeEffectiveOutput
}=require('./emissionDesignLab29');

let installed=false;
const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));

function normalizeSettingsDesigns(settings={}){
  const s=settings&&typeof settings==='object'?clone(settings):{};
  s.visual=s.visual||{};
  const out=s.visual.output=s.visual.output||{};
  out.noteDesign=normalizeNoteDesignRoot(out.noteDesign,out);
  out.youtubePromoDesign=normalizePromoDesignRoot(out.youtubePromoDesign,{
    legacyCta:out.youtubePromoCtaText,
    tiktokSafe:out.tiktokSafe!==false
  });
  out.youtubePromoCtaText=out.youtubePromoDesign.ctaText;
  s.visual.output=materializeEffectiveOutput(out);
  return s;
}

function installSettingsNormalization(){
  const p=SettingsStore.prototype;
  if(p.__ecEmissionDesignV2)return;
  Object.defineProperty(p,'__ecEmissionDesignV2',{value:true});
  const baseDefaults=p.defaults,baseLoad=p.load,baseSave=p.save;
  p.defaults=function(...args){return normalizeSettingsDesigns(baseDefaults.apply(this,args));};
  p.load=function(...args){return normalizeSettingsDesigns(baseLoad.apply(this,args));};
  p.save=function(settings,...args){return baseSave.call(this,normalizeSettingsDesigns(settings),...args);};
}

function injectFile(win,file,kind='js'){
  try{
    const full=path.join(__dirname,'..',file);
    if(!fs.existsSync(full)||!win||win.isDestroyed())return;
    if(kind==='css'){
      win.webContents.insertCSS(fs.readFileSync(full,'utf8')).catch(()=>{});
      return;
    }
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
      injectFile(win,'control-emission-design-v2.css','css');
      injectFile(win,'renderer-emission-design-v2.js','js');
      return;
    }
    if(/(?:output|output-web)\.html(?:[?#]|$)/i.test(url)){
      injectFile(win,'output-emission-design-v2.css','css');
      injectFile(win,'output-emission-design-v2.js','js');
    }
  };
  win.webContents.on('did-finish-load',run);
  setTimeout(run,0);
}

function installWindowInjection(){
  app.on('browser-window-created',(_,win)=>injectWindow(win));
  for(const win of BrowserWindow.getAllWindows())injectWindow(win);
}

function installReleaseV2EmissionDesign(){
  if(installed)return;
  installed=true;
  installSettingsNormalization();
  installWindowInjection();
}

module.exports={normalizeSettingsDesigns,installReleaseV2EmissionDesign};
