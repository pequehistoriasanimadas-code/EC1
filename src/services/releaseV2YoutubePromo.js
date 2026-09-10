'use strict';
const fs=require('fs');
const path=require('path');
const {app,BrowserWindow}=require('electron');
const {SettingsStore}=require('./settings');
const {CannedManager}=require('./canned');
const {getProfileManager}=require('./profileManager0329');
const core=require('./youtubePromoLab27');

let installed=false;
const runtime={profileId:'',requestId:'',busy:false,action:'',message:'',error:'',updatedAt:0,lastRefreshAt:'',hasApiKey:false};
const dataUrlCache=new Map();
let autoTimer=null;

function clone(v){return v==null?v:JSON.parse(JSON.stringify(v));}
function dataRoot(){const labRoot=process.env.GEC_V2_TTS_LAB_ROOT;if(process.env.GEC_V2_TTS_LAB==='1'&&labRoot)return path.join(labRoot,'EC Automatic News Data');const portable=process.env.PORTABLE_EXECUTABLE_DIR;if(portable)return path.join(portable,'EC Automatic News Data');if(app.isPackaged)return path.join(path.dirname(process.execPath),'EC Automatic News Data');return path.join(app.getPath('userData'),'EC Automatic News Data');}
function manager(base=dataRoot()){return getProfileManager(base);}
function machineFile(base=dataRoot()){return path.join(base,'youtube-promo-machine.json');}
function readJson(file,fallback={}){try{const x=JSON.parse(fs.readFileSync(file,'utf8'));return x&&typeof x==='object'?x:fallback;}catch{return fallback;}}
function atomicJson(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=`${file}.tmp-${process.pid}-${Date.now()}`;fs.writeFileSync(tmp,JSON.stringify(value,null,2),'utf8');try{fs.renameSync(tmp,file);}catch{fs.copyFileSync(tmp,file);try{fs.rmSync(tmp,{force:true});}catch{}}}
function sanitizePromoForProfile(raw){const p=core.normalizePromo(raw);for(const v of Object.values(p.videos)){if(!v||typeof v!=='object')continue;delete v.thumbnailDataUrl;delete v.apiKey;delete v.apiKeyEnc;delete v.keyEnc;}return p;}
function normalizeSettings(settings={}){settings.canned=settings.canned&&typeof settings.canned==='object'?settings.canned:{};settings.canned.youtubePromo=sanitizePromoForProfile(settings.canned.youtubePromo||{});return settings;}
function activeContext(base=dataRoot()){const m=manager(base),profileId=String(m.activeId?.()||'');return{m,profileId,assetsDir:profileId?m.assetsDir(profileId):path.join(base,'youtube-promo-cache')};}
function activeStill(base,profileId){try{return String(manager(base).activeId?.()||'')===String(profileId||'');}catch{return false;}}
function storeFor(base){return new SettingsStore(base);}
function encryptedKey(base,store){const raw=readJson(machineFile(base),{}),enc=String(raw.keyEnc||'');if(!enc)return'';try{return store.decryptSecret(enc)||'';}catch{return'';}}
function keyStatus(base,store){const has=!!encryptedKey(base,store);runtime.hasApiKey=has;return has;}
function setMachineKey(base,store,value){const key=String(value||'').trim();if(!key){atomicJson(machineFile(base),{schemaVersion:1,keyEnc:'',updatedAt:new Date().toISOString()});runtime.hasApiKey=false;return;}const enc=store.encryptSecret(key);atomicJson(machineFile(base),{schemaVersion:1,keyEnc:enc,updatedAt:new Date().toISOString()});runtime.hasApiKey=true;}
function runtimeSnapshot(base){const ctx=activeContext(base),same=runtime.profileId===ctx.profileId;let has=false;try{has=keyStatus(base,storeFor(base));}catch{}return{profileId:ctx.profileId,requestId:same?runtime.requestId:'',busy:same&&runtime.busy,action:same?runtime.action:'',message:same?runtime.message:'',error:same?runtime.error:'',updatedAt:same?runtime.updatedAt:0,lastRefreshAt:same?runtime.lastRefreshAt:'',hasApiKey:has};}
function mark(base,profileId,patch={}){runtime.profileId=String(profileId||'');Object.assign(runtime,patch,{updatedAt:Date.now()});}
function cleanRuntimeFields(s){const out=clone(s)||{};delete out.youtubePromoRuntime;delete out.__youtubePromoCommand;if(out.canned?.youtubePromo){delete out.canned.youtubePromo.apiKey;delete out.canned.youtubePromo.apiKeyEnc;delete out.canned.youtubePromo.keyEnc;delete out.canned.youtubePromo.pendingCommand;}return out;}
function thumbnailPath(ctx,row){const name=path.basename(String(row?.thumbnailFile||''));return name?path.join(ctx.assetsDir,name):'';}
function thumbnailData(ctx,row){const file=thumbnailPath(ctx,row);if(!file)return'';let st;try{st=fs.statSync(file);}catch{return'';}const key=`${file}|${st.size}|${Math.round(st.mtimeMs)}`;if(dataUrlCache.has(key))return dataUrlCache.get(key);const value=core.thumbnailDataUrl(file);if(value){if(dataUrlCache.size>80)dataUrlCache.clear();dataUrlCache.set(key,value);}return value;}
async function refreshIds(base,profileId,ids,{force=false,baseLoad,baseSave,store}={}){
  if(!activeStill(base,profileId))throw new Error('El perfil cambió durante la actualización');
  let settings=normalizeSettings(baseLoad.call(store)),promo=settings.canned.youtubePromo,unique=[...new Set((ids||[]).map(String).filter(Boolean))];const now=Date.now();if(!force)unique=unique.filter(id=>core.needsRefresh(promo.videos[id],now));if(!unique.length)return{updated:0,skipped:true};
  const apiKey=encryptedKey(base,store);if(!apiKey)throw new Error('Configura la API Key de YouTube');const snippets=await core.fetchVideoSnippets(unique,apiKey),ctx=activeContext(base);let changed=0;
  for(const id of unique){const old=promo.videos[id]&&typeof promo.videos[id]==='object'?promo.videos[id]:{},meta=snippets.get(id),checkedAt=new Date().toISOString();if(!meta){promo.videos[id]={...old,videoId:id,available:false,lastError:'Video no disponible en YouTube',lastCheckedAt:checkedAt};continue;}let thumbnailFile=String(old.thumbnailFile||'');if(meta.thumbnailUrl){try{const file=await core.downloadThumbnail(meta.thumbnailUrl,path.join(ctx.assetsDir,`youtube-${id}`));thumbnailFile=path.basename(file);for(const ext of ['.jpg','.jpeg','.png','.webp','.gif']){const stale=path.join(ctx.assetsDir,`youtube-${id}${ext}`);if(path.basename(stale)!==thumbnailFile)try{fs.rmSync(stale,{force:true});}catch{}}}catch(e){if(!thumbnailFile)throw e;}}
    promo.videos[id]={videoId:id,canonicalUrl:meta.canonicalUrl,title:meta.title,channel:meta.channel,thumbnailFile,updatedAt:checkedAt,lastCheckedAt:checkedAt,available:true,lastError:''};changed++;
  }
  if(!activeStill(base,profileId))throw new Error('El perfil cambió antes de guardar la actualización');settings.canned.youtubePromo=promo;baseSave.call(store,cleanRuntimeFields(settings));runtime.lastRefreshAt=new Date().toISOString();return{updated:changed,total:unique.length};
}
async function handleCommand(base,cmd,{baseLoad,baseSave}){
  const ctx=activeContext(base),profileId=ctx.profileId,requestId=String(cmd?.requestId||`${Date.now()}`),action=String(cmd?.type||'');const store=storeFor(base);mark(base,profileId,{requestId,busy:true,action,message:'Procesando…',error:''});
  try{
    if(!profileId)throw new Error('No hay un perfil activo');
    if(action==='set-key'){setMachineKey(base,store,cmd.value);mark(base,profileId,{message:cmd.value?'API Key de YouTube guardada.':'API Key de YouTube eliminada.'});return;}
    let settings=normalizeSettings(baseLoad.call(store)),promo=settings.canned.youtubePromo;
    if(action==='unlink'){const key=String(cmd.contentKey||'');if(key&&promo.links[key]){delete promo.links[key];settings.canned.youtubePromo=promo;baseSave.call(store,cleanRuntimeFields(settings));}mark(base,profileId,{message:'Vínculo de YouTube eliminado.'});return;}
    if(action==='link'){
      const contentKey=String(cmd.contentKey||''),videoId=core.parseYouTubeVideoId(cmd.url);if(!contentKey)throw new Error('No se pudo identificar el archivo de contenido');if(!videoId)throw new Error('Enlace de YouTube no válido');
      await refreshIds(base,profileId,[videoId],{force:true,baseLoad,baseSave,store});settings=normalizeSettings(baseLoad.call(store));promo=settings.canned.youtubePromo;promo.links[contentKey]={videoId,fileName:String(cmd.fileName||''),sizeBytes:Math.max(0,Number(cmd.sizeBytes)||0),linkedAt:new Date().toISOString()};settings.canned.youtubePromo=promo;baseSave.call(store,cleanRuntimeFields(settings));mark(base,profileId,{message:'Video de YouTube vinculado correctamente.'});return;
    }
    if(action==='refresh-one'){const id=String(cmd.videoId||'');if(!id)throw new Error('No hay un video de YouTube vinculado');const r=await refreshIds(base,profileId,[id],{force:true,baseLoad,baseSave,store});mark(base,profileId,{message:r.updated?'Datos de YouTube actualizados.':'No había cambios que comprobar.'});return;}
    if(action==='refresh-all'||action==='auto-refresh'){const ids=[...new Set(Object.values(promo.links||{}).map(x=>String(x?.videoId||'')).filter(Boolean))],r=await refreshIds(base,profileId,ids,{force:action==='refresh-all',baseLoad,baseSave,store});mark(base,profileId,{message:r.updated?`${r.updated} video(s) de YouTube actualizados.`:r.skipped?'YouTube ya está actualizado.':'No hay videos vinculados.'});return;}
    throw new Error('Acción de YouTube no reconocida');
  }catch(e){mark(base,profileId,{error:String(e?.message||e),message:''});}
  finally{mark(base,profileId,{busy:false,action:''});}
}
function contentFolder(folder,s){const f=path.resolve(String(folder||'')),c=String(s?.canned?.folder||''),a=String(s?.canned?.adsFolder||'');try{if(a&&f===path.resolve(a)&&(!c||path.resolve(c)!==f))return false;return!!c&&f===path.resolve(c);}catch{return false;}}
function decorateItem(item,folder,base=dataRoot()){
  if(!item)return item;const store=storeFor(base),s=normalizeSettings(store.load());if(!contentFolder(folder,s))return{...item,youtubePromo:null};const promo=s.canned.youtubePromo,key=core.contentIdentity(item),link=promo.links[key],video=link?.videoId?promo.videos[link.videoId]:null,ctx=activeContext(base),thumb=video?thumbnailData(ctx,video):'';const linkSummary=link?{contentKey:key,videoId:String(link.videoId||''),title:String(video?.title||''),channel:String(video?.channel||''),thumbnailDataUrl:thumb,updatedAt:String(video?.updatedAt||''),lastCheckedAt:String(video?.lastCheckedAt||''),available:video?.available!==false,lastError:String(video?.lastError||'')}:null;const snapshot=promo.enabled&&linkSummary?.videoId&&linkSummary.title&&thumb?{enabled:true,videoId:linkSummary.videoId,title:linkSummary.title,channel:linkSummary.channel,thumbnailDataUrl:thumb,leadSeconds:core.normalizeLeadSeconds(promo.leadSeconds)}:null;return{...item,youtubeContentKey:key,youtubeLink:linkSummary,youtubePromo:snapshot};
}
function installSettingsBridge(){const p=SettingsStore.prototype;if(p.__ecLab27YoutubePromo)return;Object.defineProperty(p,'__ecLab27YoutubePromo',{value:true});const baseLoad=p.load,baseSave=p.save;
  p.load=function(...args){const s=normalizeSettings(baseLoad.apply(this,args));s.youtubePromoRuntime=runtimeSnapshot(this.baseDir||dataRoot());return s;};
  p.save=function(settings,...args){const base=this.baseDir||dataRoot(),cmd=clone(settings?.__youtubePromoCommand),clean=cleanRuntimeFields(normalizeSettings(clone(settings)||{})),r=baseSave.call(this,clean,...args);if(cmd&&cmd.type)setTimeout(()=>handleCommand(base,cmd,{baseLoad,baseSave}),0);return r;};
  global.__ecLab27YoutubeBaseLoad=baseLoad;global.__ecLab27YoutubeBaseSave=baseSave;
}
function installCannedDecoration(){const p=CannedManager.prototype;if(p.__ecLab27YoutubePromo)return;Object.defineProperty(p,'__ecLab27YoutubePromo',{value:true});
  const wrapSingle=name=>{const base=p[name];if(typeof base!=='function')return;p[name]=function(folder,...args){const item=base.call(this,folder,...args);return item&&typeof item.then==='function'?item.then(x=>decorateItem(x,folder)):decorateItem(item,folder);};};
  const list=p.list;p.list=function(folder,...args){const r=list.call(this,folder,...args);if(!r?.files)return r;return{...r,files:r.files.map(x=>decorateItem(x,folder))};};
  for(const name of ['peek','pick','peekForDuration','pickForDuration','pickPath'])wrapSingle(name);
}
function injectFile(win,file,kind){try{const full=path.join(__dirname,'..',file);if(kind==='css'){if(fs.existsSync(full))win.webContents.insertCSS(fs.readFileSync(full,'utf8')).catch(()=>{});return;}if(fs.existsSync(full)){const code=fs.readFileSync(full,'utf8');win.webContents.executeJavaScript(`(()=>{${code}\n})()`,true).catch(()=>{});}}catch{}}
function injectWindow(win){if(!win||win.isDestroyed())return;const run=()=>{if(!win||win.isDestroyed())return;const url=String(win.webContents.getURL()||'');if(/control\.html(?:[?#]|$)/i.test(url)){injectFile(win,'control-youtube-promo.css','css');injectFile(win,'renderer-youtube-promo.js','js');injectFile(win,'renderer-monitor-live-lab27.js','js');}else if(/output\.html(?:[?#]|$)/i.test(url)){injectFile(win,'output-youtube-promo.css','css');injectFile(win,'output-youtube-promo.js','js');}};win.webContents.on('did-finish-load',run);setTimeout(run,0);}
function installWindowInjection(){app.on('browser-window-created',(_,win)=>injectWindow(win));for(const win of BrowserWindow.getAllWindows())injectWindow(win);}
function autoRefresh(){const base=dataRoot(),profileId=activeContext(base).profileId;if(!profileId||runtime.busy)return;const baseLoad=global.__ecLab27YoutubeBaseLoad,baseSave=global.__ecLab27YoutubeBaseSave;if(typeof baseLoad!=='function'||typeof baseSave!=='function')return;const store=storeFor(base);if(!keyStatus(base,store))return;handleCommand(base,{type:'auto-refresh',requestId:`auto-${Date.now()}`},{baseLoad,baseSave}).catch(()=>{});}
function installReleaseV2YoutubePromo(){if(installed)return;installed=true;installSettingsBridge();installCannedDecoration();installWindowInjection();app.whenReady().then(()=>{setTimeout(autoRefresh,9000);autoTimer=setInterval(autoRefresh,60*60*1000);}).catch(()=>{});app.on('before-quit',()=>{if(autoTimer)clearInterval(autoTimer);});}

module.exports={installReleaseV2YoutubePromo,decorateItem,normalizeSettings,handleCommand};
