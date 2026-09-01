'use strict';
const path=require('path');
const {KokoroTTS}=require('./kokoro');
const {SettingsStore}=require('./settings');

function installKokoroGpuSafety(){
  const proto=KokoroTTS.prototype;if(proto.__ec0318GpuSafetyInstalled)return;Object.defineProperty(proto,'__ec0318GpuSafetyInstalled',{value:true});
  const baseBenchmarkGpu=proto.benchmarkGpu,baseGpuStatus=proto.gpuStatus;

  proto.benchmarkGpu=async function(options={}){
    const before=this.queryNvidia?.()||{};const result=await baseBenchmarkGpu.call(this,options);if(!result?.ok)return result;const gpu=result.gpu||{},baseline={utilization:Number(before.utilization)||0,encoder:Number(before.encoder)||0,usedMb:Number(before.usedMb)||0,temperature:Number(before.temperature)||0};
    const measured={gpuDeltaAverage:Math.max(0,Number((Number(gpu.gpuAverage||0)-baseline.utilization).toFixed(1))),gpuDeltaPeak:Math.max(0,Number((Number(gpu.gpuPeak||0)-baseline.utilization).toFixed(1))),memoryDeltaMb:Math.max(0,Number((Number(gpu.memoryUsedMaxMb||0)-baseline.usedMb).toFixed(0))),encoderDeltaPeak:Math.max(0,Number((Number(gpu.encoderPeak||0)-baseline.encoder).toFixed(1)))};
    result.gpuBaseline=baseline;result.gpuDelta=measured;if(result.gpu){result.gpu={...result.gpu,...measured};}
    try{
      const rec=global.__ec0318HardwareRecommendation,match=rec&&path.resolve(String(rec.settingsFile||''))===path.resolve(String(this.settingsFile||''));if(match)rec.summary={...(rec.summary||{}),gpuBaseline:baseline,gpuDelta:measured};
      const store=new SettingsStore(path.dirname(this.settingsFile)),s=store.load();s.tts=s.tts||{};s.tts.lastHardwareBenchmark={...(s.tts.lastHardwareBenchmark||{}),gpuBaseline:baseline,gpuDelta:measured};store.save(s);
    }catch{}
    return result;
  };

  proto.useCpuAcceleration=async function(){
    const rec=global.__ec0318HardwareRecommendation;if(rec&&path.resolve(String(rec.settingsFile||''))===path.resolve(String(this.settingsFile||'')))delete global.__ec0318HardwareRecommendation;
    try{await this.stopAndWait('manual-cpu-restore');}catch{}
    this.__ec0318GpuFallback=false;this.__ec0318GpuFallbackReason='';const store=new SettingsStore(path.dirname(this.settingsFile)),s=store.load();s.tts=s.tts||{};s.tts.acceleration='cpu';s.tts.hardwareManualOverrideAt=new Date().toISOString();store.save(s);return{ok:true,acceleration:'cpu',status:this.status()};
  };

  proto.gpuStatus=function(){const s=baseGpuStatus.call(this),selected=String(this.settings()?.tts?.acceleration||'cpu')==='cuda'?'cuda':'cpu',workerRunning=!!this.worker&&this.workerReady,actual=workerRunning?(this.workerHealth?.executionProvider||'cpu'):'none';return{...s,selected,workerRunning,active:actual};};
}

function installCpuRestoreIpc(){
  if(global.__ec0318CpuRestoreIpcInstalled)return;let electron=null;try{electron=require('electron');}catch{}if(!electron?.ipcMain?.handle)return;global.__ec0318CpuRestoreIpcInstalled=true;electron.ipcMain.handle('tts:gpuUseCpu',()=>{const k=global.__ecKokoro0318;if(!k)throw new Error('Kokoro todavía no terminó de inicializar');return k.useCpuAcceleration();});
}
function installVersion0318SafetyPolicy(){installKokoroGpuSafety();installCpuRestoreIpc();}
module.exports={installVersion0318SafetyPolicy};
