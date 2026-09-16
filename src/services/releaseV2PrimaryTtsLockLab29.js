'use strict';
const {SettingsStore}=require('./settings');

function enforcePrimaryTtsPolicy(settings={}){
  const s=settings&&typeof settings==='object'?settings:{};
  s.tts=s.tts&&typeof s.tts==='object'?s.tts:{};
  s.tts.fallbackToKokoro=false;
  return s;
}

function installReleaseV2PrimaryTtsLockLab29(){
  const p=SettingsStore.prototype;
  if(p.__gecV2PrimaryTtsLockLab29)return;
  Object.defineProperty(p,'__gecV2PrimaryTtsLockLab29',{value:true});
  const baseDefaults=p.defaults,baseLoad=p.load,baseSave=p.save;
  p.defaults=function(...args){return enforcePrimaryTtsPolicy(baseDefaults.apply(this,args));};
  p.load=function(...args){return enforcePrimaryTtsPolicy(baseLoad.apply(this,args));};
  p.save=function(settings,...args){return baseSave.call(this,enforcePrimaryTtsPolicy(settings),...args);};
}

module.exports={installReleaseV2PrimaryTtsLockLab29,enforcePrimaryTtsPolicy};
