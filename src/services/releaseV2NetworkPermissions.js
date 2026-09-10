'use strict';
const fs=require('fs');
const path=require('path');
const {app,ipcMain}=require('electron');
const {NetworkPermissions}=require('./networkPermissions');

let service=null;
function dataRoot(){const base=process.env.GEC_V2_TTS_LAB_ROOT||process.env.PORTABLE_EXECUTABLE_DIR||(!app.isPackaged?path.join(__dirname,'..','..'):path.dirname(process.execPath));return path.join(base,'EC Automatic News Data');}
function resourcesRoot(){return app.isPackaged?process.resourcesPath:path.join(__dirname,'..','..');}
function outputLanPort(){
  const file=path.join(dataRoot(),'global','output-lan.json');
  try{const raw=JSON.parse(fs.readFileSync(file,'utf8'));const n=Math.round(Number(raw?.port)||8787);return Math.max(1024,Math.min(65535,n));}catch{return 8787;}
}
function networkPermissions(){if(!service)service=new NetworkPermissions({dataDir:dataRoot(),resourcesDir:resourcesRoot(),log:(kind,msg)=>{try{console.log(`[${kind}] ${msg}`);}catch{}}});return service;}
function installReleaseV2NetworkPermissions(){
  if(global.__ecV2NetworkPermissionsInstalled)return;
  global.__ecV2NetworkPermissionsInstalled=true;
  ipcMain.handle('output:networkPermissionsStatus',()=>networkPermissions().status(outputLanPort()));
  ipcMain.handle('output:networkPermissionsConfigure',()=>networkPermissions().configure(outputLanPort()));
}
module.exports={installReleaseV2NetworkPermissions,outputLanPort,networkPermissions};
