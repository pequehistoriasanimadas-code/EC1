'use strict';

const fs=require('fs');
const path=require('path');
const {spawn}=require('child_process');
const {KokoroTTS,TTS_PROFILES}=require('./kokoro');
const {SettingsStore}=require('./settings');
const {median}=require('./ttsOptimizer');

const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number(n)||min));
const nowIso=()=>new Date().toISOString();
const safeBackoff=value=>[1,2,4,8,16,32].includes(Number(value))?Number(value):1;

function normalizeConfig(raw={},fallbackThreads=6,cap=12){
  const intraMode=String(raw.intraMode||'fixed')==='auto'?'auto':'fixed';
  const executionMode=String(raw.executionMode||'sequential')==='parallel'?'parallel':'sequential';
  const fixed=Math.max(1,Math.min(cap,Number(raw.intra)||Number(fallbackThreads)||Math.min(6,cap)));
  const inter=executionMode==='parallel'?Math.max(1,Math.min(4,Number(raw.inter)||2)):1;
  const spinRaw=Number(raw.spinDurationUs),spinDurationUs=Number.isFinite(spinRaw)?Math.max(-1,Math.min(5000,Math.round(spinRaw))):-1;
  const spinBackoffMax=safeBackoff(raw.spinBackoffMax);
  return{intraMode,intra:intraMode==='auto'?0:Math.round(fixed),inter,executionMode,spinDurationUs,spinBackoffMax};
}
function configKey(c){return`${c.intraMode}:${c.intra}:${c.inter}:${c.executionMode}:${c.spinDurationUs}:${c.spinBackoffMax}`;}
function configLabel(c,fallbackThreads=6,cap=12){
  const base=c.intraMode==='auto'?`AUTO CPU (~${cap} núcleos físicos)`:`${c.intra||fallbackThreads} hilos`;
  const mode=c.executionMode==='parallel'?`Paralelo · ${c.inter} inter`:'Secuencial';
  const spin=c.spinDurationUs>=0?` · spin ${c.spinDurationUs===0?'off':`${c.spinDurationUs/1000} ms / backoff ${c.spinBackoffMax}`}`:'';
  return`${base} · ${mode}${spin}`;
}
function buildAdvancedCandidates({savedThreads=6,maxSafeThreads=12,currentConfig=null}={}){
  const cap=Math.max(1,Number(maxSafeThreads)||1),saved=Math.max(1,Math.min(cap,Number(savedThreads)||Math.min(6,cap))),parallelIntra=Math.max(2,Math.min(saved,4,cap));
  const raw=[];
  if(currentConfig)raw.push({id:'current',config:normalizeConfig(currentConfig,saved,cap)});
  raw.push(
    {id:'fixed-current',config:normalizeConfig({intraMode:'fixed',intra:saved,executionMode:'sequential',inter:1,spinDurationUs:-1,spinBackoffMax:1},saved,cap)},
    {id:'auto-sequential',config:normalizeConfig({intraMode:'auto',executionMode:'sequential',inter:1,spinDurationUs:-1,spinBackoffMax:1},saved,cap)},
    {id:'auto-spin',config:normalizeConfig({intraMode:'auto',executionMode:'sequential',inter:1,spinDurationUs:1000,spinBackoffMax:8},saved,cap)},
    {id:'fixed-spin',config:normalizeConfig({intraMode:'fixed',intra:saved,executionMode:'sequential',inter:1,spinDurationUs:1000,spinBackoffMax:8},saved,cap)},
    {id:'parallel-safe',config:normalizeConfig({intraMode:'fixed',intra:parallelIntra,executionMode:'parallel',inter:2,spinDurationUs:1000,spinBackoffMax:8},saved,cap)}
  );
  const seen=new Set();return raw.filter(x=>{const key=configKey(x.config);if(seen.has(key))return false;seen.add(key);return true;}).map(x=>({...x,label:configLabel(x.config,saved,cap)}));
}
function selectAdvancedCandidate(results,{tolerance=.03}={}){
  const valid=(results||[]).filter(x=>x&&x.safe!==false&&!x.error&&Number.isFinite(Number(x.realtimeFactor))&&Number(x.realtimeFactor)>0&&Number(x.realtimeFactor)<20);
  if(!valid.length)return null;const fastest=Math.min(...valid.map(x=>Number(x.realtimeFactor))),limit=fastest*(1+Math.max(0,Number(tolerance)||0));
  return valid.filter(x=>Number(x.realtimeFactor)<=limit).sort((a,b)=>Number(a.cpuAverage||999)-Number(b.cpuAverage||999)||Number(a.realtimeFactor)-Number(b.realtimeFactor))[0]||null;
}
function atomicJson(file,value){const tmp=`${file}.tmp`;fs.writeFileSync(tmp,JSON.stringify(value,null,2),'utf8');try{fs.renameSync(tmp,file);}catch{fs.copyFileSync(tmp,file);try{fs.rmSync(tmp,{force:true});}catch{}}}

function installSettingsGuard(){
  const proto=SettingsStore.prototype;if(proto.__ec0317TtsSaveInstalled)return;Object.defineProperty(proto,'__ec0317TtsSaveInstalled',{value:true});
  const original=proto.save;proto.save=function(settings){
    const rec=global.__ec0317TtsRecommendation,match=rec&&path.resolve(String(rec.settingsFile||''))===path.resolve(String(this.file||''));
    if(match&&settings?.tts?.resourceMode==='performance'&&settings?.tts?.autoTuned===true){settings={...settings,tts:{...settings.tts,performanceThreads:rec.performanceThreads,performanceConfig:{...rec.config},lastAdvancedBenchmark:{...rec.summary}}};}
    return original.call(this,settings);
  };
}

function installKokoroAdvancedPolicy(){
  const proto=KokoroTTS.prototype;if(proto.__ec0317AdvancedInstalled)return;Object.defineProperty(proto,'__ec0317AdvancedInstalled',{value:true});
  const baseEnvFor=proto.envFor,baseGenerate=proto.generate,baseStatus=proto.status;

  proto.profile=function(){
    const s=this.settings(),name=this.profileName(s),base={name,...TTS_PROFILES[name]};if(name!=='performance')return{...base,onnxIntra:base.intra,intraMode:'fixed',executionMode:'sequential',spinDurationUs:-1,spinBackoffMax:1};
    const cap=this.performanceThreadCap(),saved=Math.max(1,Math.min(cap,Number(s?.tts?.performanceThreads)||Math.min(6,cap))),config=normalizeConfig(s?.tts?.performanceConfig||{},saved,cap),displayThreads=config.intraMode==='auto'?cap:config.intra;
    return{...base,intra:displayThreads,onnxIntra:config.intra,inter:config.inter,intraMode:config.intraMode,executionMode:config.executionMode,spinDurationUs:config.spinDurationUs,spinBackoffMax:config.spinBackoffMax,label:`Rápido · ${configLabel(config,saved,cap)}`};
  };
  proto.profileKey=function(profile){return`${profile.name}:${profile.intraMode||'fixed'}:${Number(profile.onnxIntra??profile.intra)}:${Math.max(1,Number(profile.inter)||1)}:${profile.executionMode||'sequential'}:${Number(profile.spinDurationUs??-1)}:${Number(profile.spinBackoffMax||1)}:${profile.priority||'below'}`;};
  proto.envFor=function(profile){
    const actual=Number(profile?.onnxIntra??profile?.intra);if(actual!==0)return baseEnvFor.call(this,{...profile,intra:actual});
    const env={...process.env,PYTHONNOUSERSITE:'1',PYTHONUTF8:'1'};for(const key of ['OMP_NUM_THREADS','OMP_THREAD_LIMIT','OMP_DYNAMIC','OMP_WAIT_POLICY','OPENBLAS_NUM_THREADS','MKL_NUM_THREADS','NUMEXPR_NUM_THREADS','PHONEMIZER_ESPEAK_LIBRARY','PHONEMIZER_ESPEAK_DATA_PATH','ESPEAK_DATA_PATH'])delete env[key];return env;
  };
  proto.ensureWorker=async function(profile=this.profile(),force=false){
    const key=this.profileKey(profile);if(!force&&!this.persistentEnabled())return null;if(this.worker&&this.workerReady&&this.workerProfileKey===key)return this.worker;if(this.workerStarting&&this.workerProfileKey===key)return this.workerStarting.promise;if(this.worker)await this.stopAndWait('profile-change');if(!this.ready())throw new Error('El motor de voz no está disponible en esta instalación');
    const intra=Number(profile.onnxIntra??profile.intra),args=[this.script,'--worker','--model',this.model,'--voices',this.voices,'--onnx-intra',String(Number.isFinite(intra)?intra:1),'--onnx-inter',String(Math.max(1,Number(profile.inter)||1)),'--onnx-mode',profile.executionMode==='parallel'?'parallel':'sequential','--spin-duration-us',String(Number.isFinite(Number(profile.spinDurationUs))?Number(profile.spinDurationUs):-1),'--spin-backoff-max',String(safeBackoff(profile.spinBackoffMax))];
    const p=spawn(this.python,args,this.spawnOptions(profile));this.worker=p;this.workerProfile=profile.name;this.workerProfileKey=key;this.workerReady=false;this.workerBuffer='';this.workerHealth=null;this.setProcessPriority(p,profile);this.attachWorker(p);
    let resolveStart,rejectStart;const promise=new Promise((resolve,reject)=>{resolveStart=resolve;rejectStart=reject;}),timer=setTimeout(()=>rejectStart(new Error('El motor de voz tardó demasiado en iniciar')),90000);this.workerStarting={promise,resolve:v=>{clearTimeout(timer);resolveStart(v);},reject:e=>{clearTimeout(timer);rejectStart(e);}};try{await promise;return this.worker;}finally{this.workerStarting=null;}
  };

  proto.generate=function(text,options={}){const p=baseGenerate.call(this,text,options);return p.then(result=>{if(!this.__ec0317Diagnostics)this.__ec0317Diagnostics=[];this.__ec0317Diagnostics.push({at:nowIso(),phonemeMs:Number(result.phonemeMs)||0,inferenceMs:Number(result.inferenceMs)||0,totalMs:Number(result.synthesisElapsedMs)||0,durationSec:Number(result.durationSec)||0,rtf:Number(result.steadyRealtimeFactor||result.realtimeFactor)||0,executionMode:result.executionMode||this.profile().executionMode,threads:result.onnxIntraThreads});if(this.__ec0317Diagnostics.length>10)this.__ec0317Diagnostics.splice(0,this.__ec0317Diagnostics.length-10);return result;});};

  proto.__ec0317BenchmarkCandidate=async function(candidate,{voice='ef_dora',speed=1}={}){
    const cap=this.performanceThreadCap(),saved=Math.max(1,Math.min(cap,Number(this.settings()?.tts?.performanceThreads)||Math.min(6,cap))),c=normalizeConfig(candidate.config,saved,cap),profile={name:`benchmark-${candidate.id}`,label:candidate.label,priority:'below',intra:c.intraMode==='auto'?cap:c.intra,onnxIntra:c.intra,inter:c.inter,intraMode:c.intraMode,executionMode:c.executionMode,spinDurationUs:c.spinDurationUs,spinBackoffMax:c.spinBackoffMax},id=`bench-0317-${candidate.id}-${Date.now()}`,warmTxt=path.join(this.audioDir,`${id}-warm.txt`),warmWav=path.join(this.audioDir,`${id}-warm.wav`),txt=path.join(this.audioDir,`${id}.txt`),runs=[];
    fs.writeFileSync(warmTxt,'EC Automatic News prepara Kokoro antes de medir una configuración de ONNX Runtime.','utf8');fs.writeFileSync(txt,'EC Automatic News realiza esta prueba para encontrar una configuración rápida y estable del motor de voz. La medición separa la preparación fonética de la inferencia de Kokoro, compara el modo secuencial y el modo paralelo, y conserva margen de procesador para la transmisión.','utf8');
    try{await this.stopAndWait('benchmark-0317-switch');await this.ensureWorker(profile,true);await this.workerCommand({cmd:'generate',text_file:warmTxt,output:warmWav,voice,speed:Number(speed)},180000);if(!fs.existsSync(warmWav)||fs.statSync(warmWav).size<1000)throw new Error('El warm-up de Kokoro no produjo audio válido');
      for(let n=0;n<2;n++){const run=await this.benchmarkPass(profile,txt,path.join(this.audioDir,`${id}-${n}.wav`),{voice,speed});runs.push(run);if(run.cpuOverloaded)break;}
      const realtimeFactor=Number(median(runs.map(x=>x.realtimeFactor)).toFixed(3)),cpuAverage=Number(median(runs.map(x=>x.cpuAverage)).toFixed(1)),cpuPeak=Number(Math.max(...runs.map(x=>x.cpuPeak),0).toFixed(1)),phonemeMs=Number(median(runs.map(x=>x.phonemeMs)).toFixed(1)),inferenceMs=Number(median(runs.map(x=>x.inferenceMs)).toFixed(1)),elapsedMs=Number(median(runs.map(x=>x.elapsedMs)).toFixed(1)),safe=runs.length===2&&!runs.some(x=>x.cpuOverloaded),inferencePct=elapsedMs>0?Number((inferenceMs/elapsedMs*100).toFixed(1)):0,error=safe?'':runs.some(x=>x.cpuOverloaded)?'La carga total de CPU superó 85% de forma sostenida':'La configuración no completó las dos mediciones de seguridad';
      return{id:candidate.id,label:candidate.label,threads:c.intraMode==='auto'?'AUTO CPU':c.executionMode==='parallel'?`${c.intra} intra + ${c.inter} inter`:String(c.intra),config:c,realtimeFactor,cpuAverage,cpuPeak,safe,audioDurationSec:Number(median(runs.map(x=>x.durationSec)).toFixed(2)),phonemeMs,inferenceMs,inferencePct,runs,error};
    }catch(e){return{id:candidate.id,label:candidate.label,threads:c.intraMode==='auto'?'AUTO CPU':c.executionMode==='parallel'?`${c.intra} intra + ${c.inter} inter`:String(c.intra),config:c,realtimeFactor:999,cpuAverage:0,cpuPeak:0,phonemeMs:0,inferenceMs:0,inferencePct:0,safe:false,runs,error:e.message||String(e)};}finally{this.cleanupAudio(warmWav);try{fs.rmSync(warmTxt,{force:true});fs.rmSync(txt,{force:true});}catch{}await this.stopAndWait('benchmark-0317-finished');}
  };

  proto.benchmark=function({voice='ef_dora',speed=1}={}){
    const task=async()=>{
      if(!this.ready())return{ok:false,error:'El motor de voz no está disponible en esta instalación',results:[]};const logicalCpus=this.logicalCpuCount(),maxSafeThreads=this.performanceThreadCap(),s=this.settings(),savedThreads=Math.max(1,Math.min(maxSafeThreads,Number(s?.tts?.performanceThreads)||Math.min(6,maxSafeThreads))),baselineCpu=await this.measureCpuBaseline(1200);if(baselineCpu>=75)return{ok:false,error:`La computadora ya tiene ${baselineCpu.toFixed(0)}% de uso de CPU. Cierra o pausa tareas pesadas y vuelve a ejecutar la optimización.`,logicalCpus,maxSafeThreads,baselineCpu,results:[]};
      const candidates=buildAdvancedCandidates({savedThreads,maxSafeThreads,currentConfig:s?.tts?.performanceConfig||null}),results=[];for(const candidate of candidates)results.push(await this.__ec0317BenchmarkCandidate(candidate,{voice,speed}));
      const recommended=selectAdvancedCandidate(results,{tolerance:.03});if(!recommended)return{ok:false,error:'No se encontró una configuración de Kokoro que completara la prueba dentro del margen de seguridad.',logicalCpus,maxSafeThreads,baselineCpu,results};
      const valid=results.filter(x=>x.safe!==false&&!x.error&&Number.isFinite(Number(x.realtimeFactor))),fastest=valid.length?Math.min(...valid.map(x=>Number(x.realtimeFactor))):Number(recommended.realtimeFactor),performanceThreads=recommended.config.intraMode==='fixed'?recommended.config.intra:savedThreads,summary={at:nowIso(),recommendedId:recommended.id,recommendedLabel:recommended.label,realtimeFactor:Number(recommended.realtimeFactor),fastestRealtimeFactor:Number(fastest.toFixed(3)),cpuAverage:Number(recommended.cpuAverage||0),phonemeMs:Number(recommended.phonemeMs||0),inferenceMs:Number(recommended.inferenceMs||0),inferencePct:Number(recommended.inferencePct||0)};
      global.__ec0317TtsRecommendation={settingsFile:this.settingsFile,performanceThreads,config:{...recommended.config},summary};global.__ec0316TtsRecommendation={settingsFile:this.settingsFile,threads:performanceThreads,at:Date.now()};
      try{const savedSettings=this.settings();savedSettings.tts={...(savedSettings.tts||{}),resourceMode:'performance',performanceThreads,performanceConfig:{...recommended.config},lastAdvancedBenchmark:summary,autoTuned:true};atomicJson(this.settingsFile,savedSettings);}catch{}
      return{ok:true,recommended:'performance',recommendedThreads:performanceThreads,recommendedConfig:{...recommended.config},recommendedId:recommended.id,recommendedLabel:recommended.label,bestRealtimeFactor:Number(recommended.realtimeFactor),fastestRealtimeFactor:Number(fastest.toFixed(3)),logicalCpus,maxSafeThreads,baselineCpu,efficiencyTolerancePct:3,results,bottleneck:{phonemeMs:Number(recommended.phonemeMs||0),inferenceMs:Number(recommended.inferenceMs||0),inferencePct:Number(recommended.inferencePct||0)}};
    };const queued=this.generationTail.then(task,task);this.generationTail=queued.catch(()=>{});return queued;
  };

  proto.status=function(){
    const base=baseStatus.call(this),p=this.profile(),d=this.__ec0317Diagnostics||[],phonemeMs=d.length?median(d.map(x=>x.phonemeMs)):0,inferenceMs=d.length?median(d.map(x=>x.inferenceMs)):0,totalMs=d.length?median(d.map(x=>x.totalMs)):0;return{...base,profileLabel:p.label,performanceConfig:{intraMode:p.intraMode,onnxIntra:p.onnxIntra,displayThreads:p.intra,inter:p.inter,executionMode:p.executionMode,spinDurationUs:p.spinDurationUs,spinBackoffMax:p.spinBackoffMax},recentPhonemeMs:phonemeMs?Number(phonemeMs.toFixed(1)):0,recentInferenceMs:inferenceMs?Number(inferenceMs.toFixed(1)):0,recentInferencePct:totalMs?Number((inferenceMs/totalMs*100).toFixed(1)):0};
  };
}

function installVersion0317Policy(){installSettingsGuard();installKokoroAdvancedPolicy();}
module.exports={installVersion0317Policy,normalizeConfig,buildAdvancedCandidates,selectAdvancedCandidate,configLabel};
