'use strict';
const fs=require('fs');
const path=require('path');
const {app,BrowserWindow}=require('electron');
let installed=false;

const isStartupSmoke=()=>process.argv.includes('--startup-smoke');
function logFile(){
  const root=process.env.GEC_V2_TTS_LAB_ROOT||process.env.PORTABLE_EXECUTABLE_DIR||(!app.isPackaged?path.join(__dirname,'..','..'):path.dirname(process.execPath));
  return path.join(root,'EC Automatic News Data','logs','startup.log');
}
function append(kind,message){
  try{const file=logFile();fs.mkdirSync(path.dirname(file),{recursive:true});fs.appendFileSync(file,`[${new Date().toISOString()}] ${kind}: ${String(message||'')}\n`,'utf8');}catch{}
}

const gateScript=`(()=>{
  if(window.__ecStartupUiGateInstalled)return true;
  window.__ecStartupUiGateInstalled=true;
  let baseReady=window.__gecV2TtsLabUi===true;
  try{
    Object.defineProperty(window,'__gecV2TtsLabUi',{
      configurable:true,
      get(){return baseReady&&window.__EC_FINAL_UI_READY__===true;},
      set(v){baseReady=!!v;}
    });
  }catch{}
  window.__EC_FINAL_UI_READY__=false;
  return true;
})()`;

const auditScript=`(()=>{
  const q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)],missing=[];
  const one=id=>{const rows=qa('#'+id);if(rows.length!==1)missing.push(id+':'+rows.length);return rows[0]||null;};
  const strip=one('ecAutoOperatorStrip'),controls=one('ecAutoMonitorControls'),onAir=one('ec28EmissionPanel'),nowHost=one('ecAutoNowHost');
  const monitor=one('ecLanMonitorCard'),monitorImage=one('ecMonitorImage');
  one('ecEmissionV2PreviewCard');one('ecV2NoteShade');one('v2TtsEngine');one('ecYoutubePromoEnabled');one('cannedEnabled');one('ecYoutubePromoControls');one('ec29CannedLeft');one('ec29CannedRight');
  for(const id of ['emissionStart','emissionPause','emissionResume','emissionStop','processStart'])one(id);
  if(qa('#ecMonitor29Image').length)missing.push('legacy-monitor29-present');
  if(controls){for(const id of ['emissionStart','emissionPause','emissionResume','emissionStop']){const el=q('#'+id);if(el&&!controls.contains(el))missing.push(id+'-outside-monitor-controls');}}
  if(nowHost&&onAir&&!nowHost.contains(onAir))missing.push('on-air-outside-now-host');
  if(strip){for(const id of ['cannedEnabled','ecYoutubePromoEnabled']){const el=q('#'+id);if(el&&!strip.contains(el))missing.push(id+'-outside-operator-strip');}}
  if(!monitor||!monitorImage)missing.push('monitor-surface-missing');
  if(window.__ecAudioProfileSyncLab29!==true)missing.push('audio-profile-sync-not-installed');
  if(window.__ecEmissionDesignRepairLab29!==true)missing.push('design-repair-not-installed');
  if(window.__ecAutoUxLab29Installed!==true)missing.push('auto-ux-not-installed');
  return{ok:missing.length===0,missing};
})()`;

function attach(win){
  if(!isStartupSmoke()||!win||win.isDestroyed()||win.__ecStartupAuditAttached)return;
  win.__ecStartupAuditAttached=true;
  win.webContents.on('dom-ready',()=>{
    const url=String(win.webContents.getURL()||'');if(!/control\.html(?:[?#]|$)/i.test(url))return;
    win.webContents.executeJavaScript(gateScript,true).catch(e=>append('CONTROL_UI_REGRESSION_FAIL',`gate: ${e?.message||e}`));
  });
  win.webContents.on('did-finish-load',()=>{
    const url=String(win.webContents.getURL()||'');if(!/control\.html(?:[?#]|$)/i.test(url))return;
    let tries=0,done=false;
    const poll=async()=>{
      if(done||win.isDestroyed())return;
      tries++;
      try{
        const result=await win.webContents.executeJavaScript(auditScript,true);
        if(result?.ok){
          done=true;await win.webContents.executeJavaScript('window.__EC_FINAL_UI_READY__=true; true',true).catch(()=>{});
          append('CONTROL_UI_REGRESSION_OK','Automático + monitor + YouTube + Diseño + Audio verificados en DOM final');
          return;
        }
        if(tries>=80){done=true;append('CONTROL_UI_REGRESSION_FAIL',(result?.missing||['unknown']).join(','));return;}
      }catch(e){if(tries>=80){done=true;append('CONTROL_UI_REGRESSION_FAIL',e?.message||e);return;}}
      setTimeout(poll,200);
    };
    setTimeout(poll,80);
  });
}
function installReleaseV2StartupUiAudit(){
  if(installed)return;installed=true;
  if(!isStartupSmoke())return;
  app.on('browser-window-created',(_,win)=>attach(win));
  for(const win of BrowserWindow.getAllWindows())attach(win);
}
module.exports={installReleaseV2StartupUiAudit};
