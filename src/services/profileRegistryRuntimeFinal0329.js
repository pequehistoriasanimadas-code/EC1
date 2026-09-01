'use strict';
const fs=require('fs');
const path=require('path');
const {app}=require('electron');
const {getProfileManager,safeName}=require('./profileManager0329');
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function dataRoot(){const portable=process.env.PORTABLE_EXECUTABLE_DIR;if(portable)return path.join(portable,'EC Automatic News Data');if(app.isPackaged)return path.join(path.dirname(process.execPath),'EC Automatic News Data');return path.join(app.getPath('userData'),'EC Automatic News Data');}
function installProfileRegistryRuntimeFinal0329(){const m=getProfileManager(dataRoot()),ids=new Set(),names=new Set(),valid=[];let changed=false;for(const row of Array.isArray(m.registry?.profiles)?m.registry.profiles:[]){const id=String(row?.id||''),name=safeName(row?.name),nk=name.toLocaleLowerCase('es');if(!UUID_RE.test(id)||!name||ids.has(id)||names.has(nk)){changed=true;continue;}ids.add(id);names.add(nk);valid.push({...row,id,name});}let active=String(m.registry?.activeProfileId||'');if(active&&!ids.has(active)){active='';changed=true;}if(!changed)return;try{const dir=path.join(m.baseDir,'backups','registry-recovery');fs.mkdirSync(dir,{recursive:true});if(fs.existsSync(m.registryFile))fs.copyFileSync(m.registryFile,path.join(dir,`profiles-runtime-${Date.now()}.json`));}catch{}m.registry={...m.registry,profiles:valid,activeProfileId:active};m.saveRegistry();}
module.exports={installProfileRegistryRuntimeFinal0329};
