'use strict';
const fs=require('fs');
const path=require('path');
const {app,BrowserWindow}=require('electron');
const base=process.env.PORTABLE_EXECUTABLE_DIR||(!app.isPackaged?path.join(__dirname,'..'):path.dirname(process.execPath));
const labBase=path.join(base,'GEC V2 TTS Lab');
try{fs.mkdirSync(labBase,{recursive:true});}catch{}
process.env.PORTABLE_EXECUTABLE_DIR=labBase;
process.env.GEC_V2_TTS_LAB='1';
const gotLock=app.requestSingleInstanceLock();
if(!gotLock){app.quit();}else{
  app.on('second-instance',()=>{try{const wins=BrowserWindow.getAllWindows().filter(w=>!w.isDestroyed());const target=wins.find(w=>String(w.getTitle?.()||'').includes('EC Automatic News'))||wins[0];if(target){if(target.isMinimized())target.restore();target.show();target.focus();}}catch{}});
}
require('./bootstrap-0332');
require('./services/releaseV2Lab').installReleaseV2Lab();
require('./services/releaseV2Optimization').installV2Optimization();
