'use strict';

const Module=require('module');
const {SettingsStore}=require('./services/settings');
const {FontManager}=require('./services/fonts');
const rss=require('./services/rss');
const {mergeSourceItems}=require('./services/sourceMerge0325');

const BASE_FONTS=['Arial','Segoe UI','Verdana','Georgia','Impact'];
const VARIANT_DEFAULTS={
  titleFontVariant:'black',summaryFontVariant:'regular',categoryFontVariant:'black',dateFontVariant:'medium',exclusiveFontVariant:'extrabold',
  titleUppercase:false,summaryUppercase:false,categoryUppercase:true,dateUppercase:true,exclusiveUppercase:true,
  categoryBgOpacity:1,exclusiveBgOpacity:1,categoryRadius:0
};

function migrateOutput(out={}){
  const o={...out};
  o.titleFontFamily=o.titleFontFamily||o.fontFamily||'Arial';
  o.summaryFontFamily=o.summaryFontFamily||o.fontFamily||'Arial';
  o.categoryFontFamily=o.categoryFontFamily||o.fontFamily||'Arial';
  o.dateFontFamily=o.dateFontFamily||o.fontFamily||'Arial';
  o.exclusiveFontFamily=o.exclusiveFontFamily||o.fontFamily||'Arial';
  o.titleFontSize=Number(o.titleFontSize)||70;
  o.summaryFontSize=Number(o.summaryFontSize)||34;
  o.categoryFontSize=Number(o.categoryFontSize)||28;
  o.dateFontSize=Number(o.dateFontSize)||27;
  o.exclusiveFontSize=Number(o.exclusiveFontSize)||24;
  o.titleFontWeight=Number(o.titleFontWeight)||900;
  o.summaryFontWeight=Number(o.summaryFontWeight)||400;
  o.categoryFontWeight=Number(o.categoryFontWeight)||900;
  o.dateFontWeight=Number(o.dateFontWeight)||500;
  o.exclusiveFontWeight=Number(o.exclusiveFontWeight)||800;
  o.titleColor=o.titleColor||'#FFFFFF';
  o.summaryColor=o.summaryColor||'#F3F3F3';
  o.dateColor=o.dateColor||o.summaryColor||'#F3F3F3';
  o.categoryTextColor=o.categoryTextColor||'#000000';
  o.exclusiveTextColor=o.exclusiveTextColor||'#000000';
  o.categoryBgColor=o.categoryBgColor||'#F7C600';
  o.exclusiveBgColor=o.exclusiveBgColor||'#F7C600';
  o.lowerBgColor=o.lowerBgColor||'#000000';
  o.lowerOpacity=Number.isFinite(Number(o.lowerOpacity))?Math.max(0,Math.min(1,Number(o.lowerOpacity))):.88;
  o.exclusiveRadius=Number.isFinite(Number(o.exclusiveRadius))?Math.max(0,Math.min(40,Number(o.exclusiveRadius))):5;
  o.exclusiveEnabled=true;
  o.exclusiveText='EXCLUSIVO';
  Object.entries(VARIANT_DEFAULTS).forEach(([k,v])=>{if(o[k]==null)o[k]=v;});
  return o;
}
function migrateSettings(data={}){
  data.visual=data.visual||{};
  data.visual.output=migrateOutput(data.visual.output||{});
  data.automation=data.automation||{};
  if(data.automation.exclusiveEveryNews==null)data.automation.exclusiveEveryNews=4;
  return data;
}

if(!SettingsStore.prototype.__ec0325SettingsPatched){
  Object.defineProperty(SettingsStore.prototype,'__ec0325SettingsPatched',{value:true});
  const baseDefaults=SettingsStore.prototype.defaults;
  const baseLoad=SettingsStore.prototype.load;
  SettingsStore.prototype.defaults=function(){return migrateSettings(baseDefaults.call(this));};
  SettingsStore.prototype.load=function(){return migrateSettings(baseLoad.call(this));};
}

if(!FontManager.prototype.__ec0325FontPolicy){
  Object.defineProperty(FontManager.prototype,'__ec0325FontPolicy',{value:true});
  FontManager.prototype.windowsFonts=async function(){return [...BASE_FONTS];};
  FontManager.prototype.list=async function(){return{installed:[...BASE_FONTS],custom:this.custom()};};
}

if(!rss.__ec0325LoadAllPatched){
  rss.__ec0325LoadAllPatched=true;
  let generation=0;
  rss.loadAll=async function loadAll0325(feeds){
    const current=++generation,list=Array.isArray(feeds)?feeds:[],active=list.filter(f=>f&&f.enabled&&String(f.url||'').trim());
    const settled=await Promise.allSettled(active.map(f=>rss.fetchFeedDetailed(f))),groups=[],errors=[],feedStatus=[];
    settled.forEach((r,i)=>{const feed=active[i];if(r.status==='fulfilled'){groups.push(r.value.items||[]);feedStatus.push({id:feed.id,name:feed.name,ok:(r.value.items||[]).length>0,count:(r.value.items||[]).length,rawCount:r.value.rawCount,parsedCount:r.value.parsedCount,sourceType:r.value.sourceType,partial:r.value.partial,mode:r.value.mode,detail:r.value.detail});}else{const error=r.reason?.message||String(r.reason);errors.push({feed:feed.name,error});feedStatus.push({id:feed.id,name:feed.name,ok:false,count:0,rawCount:0,parsedCount:0,sourceType:'',partial:false,mode:'ERROR',detail:error});}});
    return{items:mergeSourceItems(groups,rss.canonicalLink),errors,feedStatus,stale:current!==generation};
  };
}

const originalLoad=Module._load;
Module._load=function(request,parent,isMain){
  if(request==='./services/automation0324'&&/[\\/]src[\\/]main\.js$/i.test(String(parent?.filename||''))){
    return require('./services/automation0325');
  }
  return originalLoad.apply(this,arguments);
};
try{require('./bootstrap-0324');}finally{Module._load=originalLoad;}
