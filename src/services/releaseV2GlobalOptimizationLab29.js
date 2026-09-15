'use strict';

const fs=require('fs');
const path=require('path');
const {app,ipcMain}=require('electron');
const {SettingsStore}=require('./settings');
const {getProfileManager}=require('./profileManager0329');
const fidelity=require('./releaseV2ProductionFidelity');
const stabilization=require('./releaseV2Stabilization');

const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
let installed=false;

function dataRoot(){
  const labRoot=process.env.GEC_V2_TTS_LAB_ROOT;
  if(process.env.GEC_V2_TTS_LAB==='1'&&labRoot)return path.join(labRoot,'EC Automatic News Data');
  const portable=process.env.PORTABLE_EXECUTABLE_DIR;
  if(portable)return path.join(portable,'EC Automatic News Data');
  if(app?.isPackaged)return path.join(path.dirname(process.execPath),'EC Automatic News Data');
  return app?.getPath?path.join(app.getPath('userData'),'EC Automatic News Data'):process.cwd();
}
function readJson(file,fallback=null){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return fallback;}}
function atomicJson(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const tmp=`${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp,JSON.stringify(value,null,2),'utf8');
  try{fs.renameSync(tmp,file);}catch{fs.copyFileSync(tmp,file);try{fs.rmSync(tmp,{force:true});}catch{}}
}
function fingerprintMatches(settings,profile){
  const saved=String(settings?.optimization0321?.fingerprint||''),profileFp=String(profile?.fingerprint||'');
  return !saved||!profileFp||saved===profileFp;
}
function compatibleWithMachine(settings,profile){
  const cmp=fidelity.compatibility(settings,profile);
  if(!cmp.ok)return{ok:false,reason:cmp.reason||'perfil incompatible'};
  if(!fingerprintMatches(settings,profile))return{ok:false,reason:'perfil de otra computadora'};
  return{ok:true,reason:''};
}
function sidePath(base,id){return stabilization.sideFile(base,id);}
function globalPath(base){return fidelity.profileFile(base);}

function promoteCompatibleSideProfile(base,settings){
  if(readJson(globalPath(base),null))return null;
  const m=getProfileManager(base),active=String(m.activeId?.()||''),ids=[active,...m.list().map(x=>String(x.id||''))].filter(Boolean),seen=new Set(),candidates=[];
  for(const id of ids){
    if(seen.has(id))continue;seen.add(id);
    const side=readJson(sidePath(base,id),null);
    if(!side||side.cleared===true||!side.productionProfile)continue;
    const profile=side.productionProfile,cmp=compatibleWithMachine(settings,profile);
    if(!cmp.ok)continue;
    candidates.push({profile,at:Date.parse(profile.at||side.updatedAt||0)||0,id});
  }
  if(!candidates.length)return null;
  candidates.sort((a,b)=>b.at-a.at);
  const chosen=clone(candidates[0].profile);
  atomicJson(globalPath(base),chosen);
  return chosen;
}

function globalProductionProfile(base,settings,{allowPromotion=true}={}){
  let profile=readJson(globalPath(base),null),source='global';
  if(!profile&&allowPromotion){profile=promoteCompatibleSideProfile(base,settings);if(profile)source='promoted-sidecar';}
  if(!profile)return{profile:null,compatible:false,reason:'sin perfil de producción global',source:'none'};
  const cmp=compatibleWithMachine(settings,profile);
  return{profile,compatible:cmp.ok,reason:cmp.reason||'',source};
}

function syncActiveProfileOptimization(base,settings,profile){
  if(!profile)return null;
  const cmp=compatibleWithMachine(settings,profile);if(!cmp.ok)return null;
  const m=getProfileManager(base),id=String(m.activeId?.()||'');if(!id)return null;
  const file=sidePath(base,id),old=readJson(file,{})||{},optimization0321=clone(settings?.optimization0321||old.optimization0321||null);
  const unchanged=old.cleared!==true&&String(old?.productionProfile?.id||'')===String(profile.id||'')&&String(old.source||'')==='global-machine-profile'&&JSON.stringify(old.optimization0321||null)===JSON.stringify(optimization0321||null);
  if(unchanged)return old;
  const next={...old,schemaVersion:1,updatedAt:new Date().toISOString(),cleared:false,optimization0321,productionProfile:clone(profile),source:'global-machine-profile'};
  atomicJson(file,next);return next;
}

function installSettingsBridge(){
  const p=SettingsStore.prototype;if(p.__ecLab29MachineGlobalOptimization)return;
  Object.defineProperty(p,'__ecLab29MachineGlobalOptimization',{value:true});
  const baseLoad=p.load;
  p.load=function(...args){
    const base=this.baseDir||dataRoot(),settings=baseLoad.apply(this,args),resolved=globalProductionProfile(base,settings,{allowPromotion:true});
    if(!resolved.profile)return settings;
    if(resolved.compatible){
      stabilization.applyProductionProfile(settings,resolved.profile);
      syncActiveProfileOptimization(base,settings,resolved.profile);
    }else{
      settings.activeOptimizationV2={...clone(resolved.profile),valid:false,invalidReason:resolved.reason||'perfil global incompatible'};
    }
    return settings;
  };
}

async function status(base=dataRoot()){
  const store=new SettingsStore(base),settings=store.load(),m=getProfileManager(base),profileId=String(m.activeId?.()||''),resolved=globalProductionProfile(base,settings,{allowPromotion:true}),profile=resolved.profile;
  if(profile&&resolved.compatible)syncActiveProfileOptimization(base,settings,profile);
  let runtime=null,match={ok:true,pending:!!profile?.localAi?.required,reason:profile?.localAi?.required?'LocalRuntime todavía no inicializado':'IA local no requerida'};
  const local=global.__ec0320LocalRuntime;
  if(profile?.localAi?.required&&local?.status){
    try{runtime=await local.status();if(runtime?.running||runtime?.profile){match=fidelity.expectedVsRuntime(profile,runtime);}}
    catch(e){match={ok:true,pending:true,reason:`LocalRuntime pendiente: ${String(e?.message||e)}`};}
  }
  return{ok:true,profileId,profile:profile?{...clone(profile),valid:resolved.compatible,invalidReason:resolved.reason||''}:null,compatible:resolved.compatible,reason:resolved.reason||'',runtime,profileMatch:match,profileScoped:false,machineGlobal:true,source:resolved.source};
}

async function commit(payload={}){
  const base=dataRoot(),store=new SettingsStore(base),settings=store.load(),m=getProfileManager(base),profileId=String(m.activeId?.()||'');
  if(!profileId)throw new Error('No hay un perfil activo');
  const profile=fidelity.buildProfile(settings,{...payload,source:'optimizer',validated:true});
  atomicJson(fidelity.profileFile(base),profile);
  syncActiveProfileOptimization(base,settings,profile);
  const local=global.__ec0320LocalRuntime;if(profile.localAi?.required&&local?.configure)local.configure('tuned',profile.localAi.config);
  return status(base);
}

async function clear(){
  const base=dataRoot(),m=getProfileManager(base);
  try{fs.rmSync(fidelity.profileFile(base),{force:true});}catch{}
  for(const item of m.list()){
    const id=String(item.id||'');if(!id)continue;
    const file=sidePath(base,id),old=readJson(file,{})||{};
    atomicJson(file,{...old,schemaVersion:1,updatedAt:new Date().toISOString(),cleared:true,optimization0321:null,productionProfile:null,source:'global-machine-clear'});
  }
  try{
    const raw=readJson(m.globalSettingsFile,{})||{};delete raw.optimization0321;delete raw.activeOptimizationV2;atomicJson(m.globalSettingsFile,raw);
  }catch{}
  return{ok:true,profileId:String(m.activeId?.()||''),profileScoped:false,machineGlobal:true};
}

function installIpc(){
  for(const name of ['optimization-v2:status','optimization-v2:commit','optimization-v2:clear'])try{ipcMain.removeHandler(name);}catch{}
  ipcMain.handle('optimization-v2:status',()=>status());
  ipcMain.handle('optimization-v2:commit',(_,payload={})=>commit(payload));
  ipcMain.handle('optimization-v2:clear',()=>clear());
}
function installMachineGlobalOptimizationLab29(){if(installed)return;installed=true;installSettingsBridge();installIpc();}

module.exports={dataRoot,globalProductionProfile,promoteCompatibleSideProfile,syncActiveProfileOptimization,status,commit,clear,installMachineGlobalOptimizationLab29};
