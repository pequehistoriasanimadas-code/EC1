'use strict';

const {SettingsStore}=require('./settings');
const {AutomationEngine}=require('./automation0325');

let installed=false;
const clamp=(value,min,max,fallback)=>{const n=Number(value);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;};
const keyPath=v=>{try{return require('path').resolve(String(v||'')).normalize('NFKC').toLocaleLowerCase('es');}catch{return String(v||'').normalize('NFKC').toLocaleLowerCase('es');}};

function normalizeRecovery(settings={}){
  settings.canned=settings.canned||{};
  settings.canned.recoveryEnabled=settings.canned.recoveryEnabled!==false;
  return settings;
}

function installSettingsRecovery(){
  const p=SettingsStore.prototype;
  if(p.__ecLab29CannedRecoverySettings)return;
  Object.defineProperty(p,'__ecLab29CannedRecoverySettings',{value:true});
  const baseDefaults=p.defaults,baseLoad=p.load,baseSave=p.save;
  p.defaults=function(){return normalizeRecovery(baseDefaults.call(this));};
  p.load=function(){return normalizeRecovery(baseLoad.call(this));};
  p.save=function(settings,...args){return baseSave.call(this,normalizeRecovery(settings&&typeof settings==='object'?settings:{}),...args);};
}

function readyCount(engine){
  try{if(typeof engine.readyItems==='function')return engine.readyItems().length;}catch{}
  return (engine.queue||[]).filter(x=>String(x?.status||'').toUpperCase()==='LISTA'&&['rss','generated'].includes(String(x?.sourceType||'rss'))).length;
}
function productionEstimate(engine){
  try{
    if(typeof engine.__ecProductionProfile==='function'){
      const p=engine.__ecProductionProfile();
      if(p&&Number(p.avgAudio)>0&&Number(p.rate)>0)return{avgAudio:clamp(p.avgAudio,20,120,50),rate:clamp(p.rate,.2,1.5,.6)};
    }
  }catch{}
  const rows=(engine.queue||[]).filter(x=>['rss','generated'].includes(String(x?.sourceType||'rss'))),samples=[];
  for(const row of rows){
    const m=row?.metrics||{},audio=Number(row?.audio?.durationSec)||Number(m.audioDurationSec)||0;
    const work=Math.max(Number(m.textElapsedMs||0),Number(m.pronunciationElapsedMs||0)+Number(m.ttsElapsedMs||0))/1000;
    if(audio>0&&work>0)samples.push({audio,work});
  }
  if(!samples.length)return{avgAudio:50,rate:.6};
  const audio=samples.reduce((a,x)=>a+x.audio,0),work=samples.reduce((a,x)=>a+x.work,0);
  return{avgAudio:clamp(audio/samples.length,20,120,50),rate:clamp(audio/Math.max(1,work),.2,1.5,.6)};
}
function adSeconds(engine,s){
  if(s?.canned?.insertAdAfterContent===false||!String(s?.canned?.adsFolder||'').trim())return 0;
  try{return Number(engine.ads?.peek?.(s.canned.adsFolder)?.durationSec)||0;}catch{return 0;}
}
function reserveRecoveryState(engine,s,reason){
  const c=s?.canned||{},a=s?.automation||{},folder=String(c.folder||'').trim();
  const targetReady=Math.round(clamp(a.bufferReady,1,30,15)),currentReady=readyCount(engine),deficitNotes=Math.max(0,targetReady-currentReady),estimate=productionEstimate(engine);
  const adaptive=c.adaptiveDuration!==false&&(reason==='recovery'||reason==='emergency');
  const adDurationSec=adaptive?adSeconds(engine,s):0;
  let requestedContentSec=0;
  if(adaptive&&reason==='emergency')requestedContentSec=Number.POSITIVE_INFINITY;
  else if(adaptive&&reason==='recovery')requestedContentSec=clamp(deficitNotes*estimate.avgAudio/Math.max(.2,estimate.rate)-adDurationSec,30,15*60,30);
  let selected=null,error='';
  try{selected=adaptive&&engine.canned?.peekForDuration?engine.canned.peekForDuration(folder,requestedContentSec):engine.canned?.peek?.(folder);}catch(e){error=e?.message||String(e);}
  let ad=null;
  if(adaptive&&c.insertAdAfterContent!==false&&String(c.adsFolder||'').trim())try{ad=engine.ads?.peek?.(c.adsFolder)||null;}catch{}
  return{
    reason,adaptive,targetReady,currentReady,deficitNotes,requestedContentSec,adDurationSec:Number(ad?.durationSec)||adDurationSec,
    adName:ad?.name||'',adPath:ad?.path||'',selected:selected?{name:selected.name,path:selected.path,durationSec:Number(selected.durationSec)||0,remainingInCycle:Number(selected.remainingInCycle)||0,total:Number(selected.total)||0}:null,
    error,folder,at:Date.now()
  };
}

function installEngineRecovery(){
  const p=AutomationEngine.prototype;
  if(p.__ecLab29CountRecovery)return;
  Object.defineProperty(p,'__ecLab29CountRecovery',{value:true});
  const baseReason=p.cannedReason,basePrepare=p.__ec0327PrepareCanned;

  p.cannedReason=function(s,hasReady){
    const c=s?.canned||{};
    if(!c.enabled)return'';
    const legacy=typeof baseReason==='function'?baseReason.call(this,s,hasReady):'';
    if(legacy==='manual'||legacy==='scheduled')return legacy;
    if(Date.now()<Number(this.cannedUnavailableUntil||0))return'';
    const targetReady=Math.round(clamp(s?.automation?.bufferReady,1,30,15)),currentReady=readyCount(this);
    const mayRecover=c.recoveryEnabled!==false&&this.processingRunning===true&&!!hasReady&&currentReady<targetReady;
    const alreadyBoughtTime=this.__ec0328LastContentNewsMarker===Number(this.scheduledNewsTotal||0);
    if(mayRecover&&!alreadyBoughtTime)return'recovery';
    if(!hasReady&&c.emergency!==false)return'emergency';
    return'';
  };

  p.__ec0327PrepareCanned=function(s,reason){
    if(!['recovery','emergency'].includes(String(reason||'')))return typeof basePrepare==='function'?basePrepare.call(this,s,reason):null;
    const folder=String(s?.canned?.folder||'').trim(),old=this.__ec0328Reservation;
    if(old?.selected?.path&&old.reason===reason&&keyPath(old.folder)===keyPath(folder)&&Number(old.targetReady)===Math.round(clamp(s?.automation?.bufferReady,1,30,15))){
      try{const scan=this.canned?.list?.(folder);if(scan?.files?.some(x=>keyPath(x.path)===keyPath(old.selected.path))){this.__ec0327AdaptiveSelection=old;return old;}}catch{}
    }
    const state=reserveRecoveryState(this,s,reason);
    this.__ec0328Reservation=state;
    this.__ec0327AdaptiveSelection=state;
    return state;
  };
}

function installReleaseV2CannedRecoveryLab29(){
  if(installed)return;
  installed=true;
  installSettingsRecovery();
  installEngineRecovery();
}

module.exports={installReleaseV2CannedRecoveryLab29,normalizeRecovery,reserveRecoveryState,readyCount};
