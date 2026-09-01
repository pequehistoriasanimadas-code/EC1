'use strict';
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');

const PROFILE_SCHEMA_VERSION=1;
const REGISTRY_SCHEMA_VERSION=1;
const DEFAULT_PROFILE_COLORS=['#F7C600','#22C55E','#3B82F6','#A855F7','#F97316','#EC4899','#06B6D4','#EF4444'];
const DEFAULT_QUEUE_COLORS={rss:'#2E7D32',generated:'#2563EB',content:'#D97706',ad:'#7C3AED',exclusive:'#D4A514',error:'#B91C1C'};
const PROFILE_TTS_KEYS=new Set(['voice','speed']);
const GLOBAL_AI_KEYS=new Set(['claudeKeyEnc','geminiKeyEnc','claudeModel','localResourceMode']);

function clone(v){return v==null?v:JSON.parse(JSON.stringify(v));}
function isObject(v){return!!v&&typeof v==='object'&&!Array.isArray(v);}
function merge(base,extra){if(!isObject(base))return clone(extra);const out={...base};for(const[k,v]of Object.entries(extra||{})){if(isObject(v)&&isObject(base[k]))out[k]=merge(base[k],v);else out[k]=clone(v);}return out;}
function readJson(file,fallback=null){try{const x=JSON.parse(fs.readFileSync(file,'utf8'));return x&&typeof x==='object'?x:fallback;}catch{return fallback;}}
function atomicJson(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=`${file}.tmp`,bak=`${file}.bak`;fs.writeFileSync(tmp,JSON.stringify(value,null,2),'utf8');if(fs.existsSync(file)){try{fs.copyFileSync(file,bak);}catch{}}try{fs.renameSync(tmp,file);}catch{fs.copyFileSync(tmp,file);try{fs.rmSync(tmp,{force:true});}catch{}}}
function safeName(value){return String(value||'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,80);}
function safeColor(value){const c=String(value||'').trim().toUpperCase();return/^#[0-9A-F]{6}$/.test(c)?c:'';}
function sameName(a,b){return safeName(a).toLocaleLowerCase('es')===safeName(b).toLocaleLowerCase('es');}
function ensureSourceIds(settings){settings.canned=settings.canned||{};settings.documents=settings.documents||{};if(!settings.canned.contentSourceId)settings.canned.contentSourceId=crypto.randomUUID();if(!settings.canned.adSourceId)settings.canned.adSourceId=crypto.randomUUID();if(!settings.documents.sourceId)settings.documents.sourceId=crypto.randomUUID();return settings;}

function splitSettings(settings={}){
  const src=clone(settings)||{},globalPart={},profilePart={};
  for(const[k,v]of Object.entries(src)){
    if(k==='ai'){
      globalPart.ai={};profilePart.ai={};
      for(const[ak,av]of Object.entries(v||{}))(GLOBAL_AI_KEYS.has(ak)?globalPart.ai:profilePart.ai)[ak]=clone(av);
    }else if(k==='tts'){
      globalPart.tts={};profilePart.tts={};
      for(const[tk,tv]of Object.entries(v||{}))(PROFILE_TTS_KEYS.has(tk)?profilePart.tts:globalPart.tts)[tk]=clone(tv);
    }else if(k==='visual'){
      globalPart.visual={};profilePart.visual={};
      for(const[vk,vv]of Object.entries(v||{})){
        if(vk==='queueColors'||vk==='theme')globalPart.visual[vk]=clone(vv);else profilePart.visual[vk]=clone(vv);
      }
    }else if(['rssFeeds','rssPartialClose','exclusiveClose','canned','documents','automation'].includes(k))profilePart[k]=clone(v);
    else profilePart[k]=clone(v);
  }
  globalPart.visual=globalPart.visual||{};globalPart.visual.queueColors={...DEFAULT_QUEUE_COLORS,...(globalPart.visual.queueColors||{})};
  return{globalPart,profilePart:ensureSourceIds(profilePart)};
}
function composeSettings(defaults,globalPart,profilePart){const d=clone(defaults)||{},parts=splitSettings(d),g=merge(parts.globalPart,globalPart||{}),p=merge(parts.profilePart,profilePart||{});g.visual=g.visual||{};g.visual.queueColors={...DEFAULT_QUEUE_COLORS,...(g.visual.queueColors||{})};const out=merge(d,p);out.ai={...(d.ai||{}),...(g.ai||{}),...(p.ai||{})};out.tts={...(d.tts||{}),...(g.tts||{}),...(p.tts||{})};out.visual={...(d.visual||{}),...(p.visual||{}),theme:{...(d.visual?.theme||{}),...(g.visual?.theme||{})},queueColors:{...DEFAULT_QUEUE_COLORS,...(g.visual?.queueColors||{})},output:{...(d.visual?.output||{}),...(p.visual?.output||{})}};return ensureSourceIds(out);}

class ProfileManager0329{
  constructor(baseDir){
    this.baseDir=path.resolve(baseDir);this.profilesDir=path.join(this.baseDir,'profiles');this.globalDir=path.join(this.baseDir,'global');this.registryFile=path.join(this.baseDir,'profiles.json');this.globalSettingsFile=path.join(this.globalDir,'settings.json');this.pendingFile=path.join(this.baseDir,'.profile-switch-pending.json');
    fs.mkdirSync(this.profilesDir,{recursive:true});fs.mkdirSync(this.globalDir,{recursive:true});this.registry=this.loadRegistry();this.consumePending();
  }
  loadRegistry(){const fallback={schemaVersion:REGISTRY_SCHEMA_VERSION,activeProfileId:'',profiles:[],updatedAt:new Date().toISOString()},raw=readJson(this.registryFile)||readJson(`${this.registryFile}.bak`);if(!raw)return fallback;const profiles=(Array.isArray(raw.profiles)?raw.profiles:[]).filter(x=>x&&x.id&&safeName(x.name)).map(x=>({...x,name:safeName(x.name),color:safeColor(x.color)||DEFAULT_PROFILE_COLORS[0]}));const active=profiles.some(x=>x.id===raw.activeProfileId)?String(raw.activeProfileId):'';return{schemaVersion:REGISTRY_SCHEMA_VERSION,activeProfileId:active,profiles,updatedAt:String(raw.updatedAt||new Date().toISOString())};}
  saveRegistry(){this.registry.updatedAt=new Date().toISOString();atomicJson(this.registryFile,this.registry);}
  consumePending(){const p=readJson(this.pendingFile);if(p?.profileId&&this.registry.profiles.some(x=>x.id===p.profileId)){this.registry.activeProfileId=p.profileId;this.saveRegistry();}try{fs.rmSync(this.pendingFile,{force:true});}catch{}}
  setPending(profileId){if(!this.registry.profiles.some(x=>x.id===profileId))throw new Error('Perfil no encontrado');atomicJson(this.pendingFile,{profileId,at:new Date().toISOString()});}
  list(){return this.registry.profiles.map(x=>({...x,active:x.id===this.registry.activeProfileId}));}
  activeId(){return this.registry.activeProfileId||'';}
  active(){return this.registry.profiles.find(x=>x.id===this.registry.activeProfileId)||null;}
  profileDir(id){return path.join(this.profilesDir,String(id||''));}
  profileSettingsFile(id){return path.join(this.profileDir(id),'settings.json');}
  historyFile(id){return path.join(this.profileDir(id),'history.json');}
  cycleFile(id){return path.join(this.profileDir(id),'canned-cycle-state.json');}
  assetsDir(id){return path.join(this.profileDir(id),'assets');}
  readProfileSettings(id){return ensureSourceIds(readJson(this.profileSettingsFile(id),{})||{});}
  writeProfileSettings(id,settings){fs.mkdirSync(this.profileDir(id),{recursive:true});atomicJson(this.profileSettingsFile(id),ensureSourceIds(clone(settings)||{}));}
  seedGlobalFromLegacy(defaults){if(fs.existsSync(this.globalSettingsFile))return;const legacy=readJson(path.join(this.baseDir,'settings.json'),{})||{},effective=merge(defaults||{},legacy),{globalPart}=splitSettings(effective);atomicJson(this.globalSettingsFile,globalPart);}
  globalSettings(defaults){this.seedGlobalFromLegacy(defaults);const base=splitSettings(defaults||{}).globalPart,stored=readJson(this.globalSettingsFile,{})||{},out=merge(base,stored);out.visual=out.visual||{};out.visual.queueColors={...DEFAULT_QUEUE_COLORS,...(out.visual.queueColors||{})};return out;}
  effectiveSettings(defaults){const globalPart=this.globalSettings(defaults),active=this.activeId(),profile=active?this.readProfileSettings(active):(()=>{const p=splitSettings(defaults||{}).profilePart;p.rssFeeds=[];p.documents={...(p.documents||{}),processed:{}};return ensureSourceIds(p);})();return composeSettings(defaults,globalPart,profile);}
  copyManagedAsset(src,id,slot){const value=String(src||'').trim();if(!value||!fs.existsSync(value))return value;const destDir=this.assetsDir(id),resolved=path.resolve(value),root=path.resolve(destDir)+path.sep;if(resolved.startsWith(root))return value;fs.mkdirSync(destDir,{recursive:true});const ext=path.extname(value).toLowerCase()||'.bin',dest=path.join(destDir,`${slot}${ext}`);fs.copyFileSync(value,dest);return dest;}
  materializeAssets(settings,id){if(!id)return settings;const p=settings.visual=settings.visual||{},o=p.output=oOr(p.output);if(p.fallbackImage)p.fallbackImage=this.copyManagedAsset(p.fallbackImage,id,'fallback');if(o.musicFile)o.musicFile=this.copyManagedAsset(o.musicFile,id,'background-music');if(o.verticalVideoBackground)o.verticalVideoBackground=this.copyManagedAsset(o.verticalVideoBackground,id,'vertical-video-background');return settings;}
  saveEffective(defaults,effective){const active=this.activeId(),settings=clone(effective)||{};if(active)this.materializeAssets(settings,active);const{globalPart,profilePart}=splitSettings(settings);atomicJson(this.globalSettingsFile,globalPart);if(active)this.writeProfileSettings(active,profilePart);if(effective&&active){effective.visual=effective.visual||{};effective.visual.fallbackImage=settings.visual?.fallbackImage||'';effective.visual.output={...(effective.visual.output||{}),...(settings.visual?.output||{})};}return composeSettings(defaults,globalPart,active?profilePart:{});}
  create({name,color,defaults}){const clean=safeName(name),c=safeColor(color);if(!clean)throw new Error('Escribe un nombre para el perfil');if(!c)throw new Error('Selecciona un color válido');if(this.registry.profiles.some(x=>sameName(x.name,clean)))throw new Error('Ya existe un perfil con ese nombre');const id=crypto.randomUUID(),meta={id,name:clean,color:c,schemaVersion:PROFILE_SCHEMA_VERSION,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};const base=splitSettings(defaults||{}).profilePart;base.rssFeeds=[];base.documents={...(base.documents||{}),processed:{}};ensureSourceIds(base);fs.mkdirSync(this.assetsDir(id),{recursive:true});atomicJson(path.join(this.profileDir(id),'profile.json'),meta);this.writeProfileSettings(id,base);atomicJson(this.historyFile(id),{emitted:[],automation:{}});atomicJson(this.cycleFile(id),{version:2,sources:{}});this.registry.profiles.push(meta);this.registry.activeProfileId=id;this.saveRegistry();return{...meta,active:true};}
  update(id,{name,color}){const p=this.registry.profiles.find(x=>x.id===id);if(!p)throw new Error('Perfil no encontrado');const clean=name==null?p.name:safeName(name),c=color==null?p.color:safeColor(color);if(!clean)throw new Error('Escribe un nombre para el perfil');if(!c)throw new Error('Selecciona un color válido');if(this.registry.profiles.some(x=>x.id!==id&&sameName(x.name,clean)))throw new Error('Ya existe un perfil con ese nombre');p.name=clean;p.color=c;p.updatedAt=new Date().toISOString();atomicJson(path.join(this.profileDir(id),'profile.json'),p);this.saveRegistry();return{...p,active:p.id===this.activeId()};}
  activate(id){if(!this.registry.profiles.some(x=>x.id===id))throw new Error('Perfil no encontrado');this.registry.activeProfileId=id;this.saveRegistry();return this.active();}
  duplicate(id,{name,color}){const src=this.registry.profiles.find(x=>x.id===id);if(!src)throw new Error('Perfil no encontrado');const clean=safeName(name)||`${src.name} - copia`,c=safeColor(color)||src.color;if(this.registry.profiles.some(x=>sameName(x.name,clean)))throw new Error('Ya existe un perfil con ese nombre');const nextId=crypto.randomUUID(),meta={id:nextId,name:clean,color:c,schemaVersion:PROFILE_SCHEMA_VERSION,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),duplicatedFrom:id};const settings=this.readProfileSettings(id);settings.canned={...(settings.canned||{}),contentSourceId:crypto.randomUUID(),adSourceId:crypto.randomUUID()};settings.documents={...(settings.documents||{}),sourceId:crypto.randomUUID(),processed:{}};fs.mkdirSync(this.profileDir(nextId),{recursive:true});this.copyDir(this.assetsDir(id),this.assetsDir(nextId));for(const slot of ['fallbackImage']){const v=settings.visual?.[slot];if(v&&path.resolve(v).startsWith(path.resolve(this.assetsDir(id))+path.sep))settings.visual[slot]=path.join(this.assetsDir(nextId),path.basename(v));}for(const slot of ['musicFile','verticalVideoBackground']){const v=settings.visual?.output?.[slot];if(v&&path.resolve(v).startsWith(path.resolve(this.assetsDir(id))+path.sep))settings.visual.output[slot]=path.join(this.assetsDir(nextId),path.basename(v));}atomicJson(path.join(this.profileDir(nextId),'profile.json'),meta);this.writeProfileSettings(nextId,settings);atomicJson(this.historyFile(nextId),{emitted:[],automation:{}});atomicJson(this.cycleFile(nextId),{version:2,sources:{}});this.registry.profiles.push(meta);this.saveRegistry();return{...meta,active:false};}
  delete(id){if(id===this.activeId()){const e=new Error('No puedes eliminar el perfil activo. Cambia primero a otro perfil y vuelve a intentarlo.');e.code='PROFILE_ACTIVE_DELETE';throw e;}const i=this.registry.profiles.findIndex(x=>x.id===id);if(i<0)throw new Error('Perfil no encontrado');const backup=path.join(this.baseDir,'backups','deleted-profiles',`${new Date().toISOString().replace(/[:.]/g,'-')}-${id}`);try{this.copyDir(this.profileDir(id),backup);}catch{}try{fs.rmSync(this.profileDir(id),{recursive:true,force:true});}catch{}const[p]=this.registry.profiles.splice(i,1);this.saveRegistry();return p;}
  copyDir(src,dst){if(!src||!fs.existsSync(src))return;fs.mkdirSync(path.dirname(dst),{recursive:true});fs.cpSync(src,dst,{recursive:true,force:true});}
  status(){return{schemaVersion:REGISTRY_SCHEMA_VERSION,activeProfileId:this.activeId(),active:this.active(),profiles:this.list(),hasProfiles:this.registry.profiles.length>0,colors:[...DEFAULT_PROFILE_COLORS]};}
}
function oOr(v){return isObject(v)?v:{};}
const managers=new Map();
function getProfileManager(baseDir){const k=path.resolve(baseDir);if(!managers.has(k))managers.set(k,new ProfileManager0329(k));return managers.get(k);}
module.exports={ProfileManager0329,getProfileManager,splitSettings,composeSettings,DEFAULT_PROFILE_COLORS,DEFAULT_QUEUE_COLORS,PROFILE_SCHEMA_VERSION,REGISTRY_SCHEMA_VERSION,safeName,safeColor,atomicJson,readJson,merge};
