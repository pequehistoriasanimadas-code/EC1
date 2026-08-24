'use strict';
const path=require('path');
const {SettingsStore}=require('./settings');
const {KokoroTTS}=require('./kokoro');

function installSettingsFinalGuard(){
  const proto=SettingsStore.prototype;if(proto.__ec0319FinalSettingsInstalled)return;Object.defineProperty(proto,'__ec0319FinalSettingsInstalled',{value:true});const baseSave=proto.save;
  proto.save=function(settings){
    const local=String(settings?.ai?.primary||'local')==='local';if(local){const rec=global.__ec0318HardwareRecommendation,match=rec&&path.resolve(String(rec.settingsFile||''))===path.resolve(String(this.file||''));if(match)delete global.__ec0318HardwareRecommendation;if(settings?.tts)settings={...settings,tts:{...settings.tts,acceleration:'cpu'}};}
    return baseSave.call(this,settings);
  };
}
function installGpuStatusGuard(){
  const proto=KokoroTTS.prototype;if(proto.__ec0319GpuStatusInstalled)return;Object.defineProperty(proto,'__ec0319GpuStatusInstalled',{value:true});const base=proto.gpuStatus;if(typeof base!=='function')return;
  proto.gpuStatus=function(){const out=base.call(this),local=String(this.settings()?.ai?.primary||'local')==='local';return local?{...out,selected:'cpu',requested:'cpu',productionGuard:true,productionGuardReason:'IA local principal: GPU reservada para Qwen/Vulkan'}:out;};
}
function installVersion0319SafetyPolicy(){installSettingsFinalGuard();installGpuStatusGuard();}
module.exports={installVersion0319SafetyPolicy};
