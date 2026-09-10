'use strict';
const fs=require('fs');
const path=require('path');
const {app,BrowserWindow}=require('electron');
const {canonicalLabBase,recoverNestedLabData}=require('./services/v2LabDataPath');
const rawBase=process.env.GEC_V2_TTS_LAB_ROOT||process.env.PORTABLE_EXECUTABLE_DIR||(!app.isPackaged?path.join(__dirname,'..'):path.dirname(process.execPath));
const labBase=canonicalLabBase(rawBase);
try{fs.mkdirSync(labBase,{recursive:true});}catch{}
let pathRecovery=null;
try{
  pathRecovery=recoverNestedLabData(labBase);
  if(pathRecovery?.recovered){
    const logDir=path.join(pathRecovery.canonicalData,'logs');
    fs.mkdirSync(logDir,{recursive:true});
    fs.appendFileSync(path.join(logDir,'v2-path-recovery.log'),`[${new Date().toISOString()}] Recuperados ${pathRecovery.canonicalProfiles} perfil(es) desde ${pathRecovery.sourceData}\n`,'utf8');
  }
}catch{}
process.env.GEC_V2_TTS_LAB_ROOT=labBase;
process.env.PORTABLE_EXECUTABLE_DIR=labBase;
process.env.GEC_V2_TTS_LAB='1';
const gotLock=app.requestSingleInstanceLock();
if(!gotLock){app.quit();}else{
  global.__ecSingleInstanceLockOwned=true;
  global.__ecSecondInstanceHandlerOwned=true;
  app.on('second-instance',()=>{try{const wins=BrowserWindow.getAllWindows().filter(w=>!w.isDestroyed());const target=wins.find(w=>String(w.getTitle?.()||'').includes('EC Automatic News'))||wins[0];if(target){if(target.isMinimized())target.restore();target.show();target.focus();}}catch{}});
  require('./bootstrap-0332');
  require('./services/releaseV2Lab').installReleaseV2Lab();
  require('./services/releaseV2Optimization').installV2Optimization();
  require('./services/releaseV2ProductionFidelity').installV2ProductionFidelity();
  require('./services/releaseV2NetworkPermissions').installReleaseV2NetworkPermissions();
  require('./services/releaseV2YoutubePromo').installReleaseV2YoutubePromo();
}
