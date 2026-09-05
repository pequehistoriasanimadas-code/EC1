'use strict';

const fs=require('fs');
const article=require('./services/article');
const {correctAccess}=require('./services/accessPolicy0324');
const {fetchArticleMetadata}=require('./services/articleMetadata0324');
const {SettingsStore}=require('./services/settings');
const {LocalRuntime}=require('./services/localRuntime');

const baseDefaults=SettingsStore.prototype.defaults;
SettingsStore.prototype.defaults=function defaults0324(){
  const data=baseDefaults.call(this);
  data.visual=data.visual||{};data.visual.queueColors=data.visual.queueColors||{};
  if(!data.visual.queueColors.exclusive)data.visual.queueColors.exclusive='#C89B16';
  data.automation=data.automation||{};
  if(data.automation.exclusiveEveryNews==null)data.automation.exclusiveEveryNews=4;
  return data;
};
const baseLoad=SettingsStore.prototype.load;
SettingsStore.prototype.load=function load0324(){
  const data=baseLoad.call(this);data.visual=data.visual||{};data.visual.queueColors=data.visual.queueColors||{};
  data.visual.queueColors.exclusive=String(data.visual.queueColors.exclusive||'#C89B16');
  data.automation=data.automation||{};
  const raw=Number(data.automation.exclusiveEveryNews);data.automation.exclusiveEveryNews=Number.isFinite(raw)?Math.max(0,Math.min(20,Math.round(raw))):4;
  return data;
};

const baseLocalStatus=LocalRuntime.prototype.status;
LocalRuntime.prototype.status=async function status0324(){
  const out=await baseLocalStatus.call(this);let modelBytes=0,partBytes=0;
  try{if(fs.existsSync(this.modelPath))modelBytes=fs.statSync(this.modelPath).size;}catch{}
  try{const part=`${this.modelPath}.part`;if(fs.existsSync(part))partBytes=fs.statSync(part).size;}catch{}
  return{...out,modelPath:this.modelPath||'',modelBytes,partBytes,minModelBytes:4_000_000_000,modelState:out.model?'VERIFICADO':out.downloading?'DESCARGANDO':modelBytes?'NO VÁLIDO':'NO ENCONTRADO'};
};

// Patch the shared article fetcher before main.js destructures it. Metadata is
// cached separately, so this resolves real publication dates and page-level
// subscriber notices without repeated network work during the cache window.
const baseFetchArticle=article.fetchArticle;
article.fetchArticle=async function fetchArticle0324(url){
  const raw=await baseFetchArticle(url);let result=correctAccess(raw,url),meta=null;
  if(!result.pubDate||String(raw?.access?.status||'')==='SUBSCRIBER_ONLY'||String(result?.access?.status||'')==='SUBSCRIBER_ONLY'||String(result?.access?.status||'')==='UNKNOWN')meta=await fetchArticleMetadata(result.finalUrl||url);
  if(meta){
    result={...result,pubDate:result.pubDate||meta.pubDate||'',publicPreview:result.publicPreview||meta.publicPreview||''};
    if(meta.strongLock)result={...result,isExclusive:true,access:{...(result.access||{}),status:'SUBSCRIBER_ONLY',confidence:'high',signals:{...(result.access?.signals||{}),strongLock:true}}};
  }
  return result;
};

require('./main');
