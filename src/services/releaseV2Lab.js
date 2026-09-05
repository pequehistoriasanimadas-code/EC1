'use strict';
const fs=require('fs');
const path=require('path');
const {app,ipcMain,dialog}=require('electron');
const {SettingsStore}=require('./settings');
const {KokoroTTS}=require('./kokoro');
const {ProfileManager0329,getProfileManager,readJson,atomicJson}=require('./profileManager0329');
const {TTSLabRuntime,ENGINES}=require('./ttsLabRuntime');

const PROFILE_TTS_KEYS=['engine','style','referenceVoiceId','engineParams','fallbackToKokoro'];
const VALID_ENGINES=new Set(['kokoro',...Object.keys(ENGINES)]);
const VALID_STYLES=new Set(['news','neutral','expressive']);
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));

function labDataRoot(){const base=process.env.PORTABLE_EXECUTABLE_DIR||(!app.isPackaged?path.join(__dirname,'..','..'):path.dirname(process.execPath));return path.join(base,'EC Automatic News Data');}
function resourcesRoot(){return app.isPackaged?process.resourcesPath:path.join(__dirname,'..','..');}
let runtime=null;
function labRuntime(){if(!runtime)runtime=new TTSLabRuntime({resourcesDir:resourcesRoot(),dataDir:labDataRoot()});return runtime;}
function profileSidecar(manager,id){return path.join(manager.profileDir(id),'tts-v2.json');}
function pickProfileTts(settings={}){const t=settings.tts||{},out={};for(const k of PROFILE_TTS_KEYS)if(t[k]!==undefined)out[k]=clone(t[k]);return normalizeProfileTts(out);}
function normalizeProfileTts(raw={}){const out={...raw};out.engine=VALID_ENGINES.has(String(out.engine||''))?String(out.engine):'kokoro';out.style=VALID_STYLES.has(String(out.style||''))?String(out.style):'news';out.referenceVoiceId=String(out.referenceVoiceId||'');out.fallbackToKokoro=out.fallbackToKokoro!==false;out.engineParams=out.engineParams&&typeof out.engineParams==='object'?out.engineParams:{};out.engineParams.chatterbox={exaggeration:Number(out.engineParams.chatterbox?.exaggeration??0.42),cfgWeight:Number(out.engineParams.chatterbox?.cfgWeight??0.35),temperature:Number(out.engineParams.chatterbox?.temperature??0.8)};out.engineParams.qwen3tts={temperature:Number(out.engineParams.qwen3tts?.temperature??0.78),voiceMode:String(out.engineParams.qwen3tts?.voiceMode||'reference')==='finetuned'?'finetuned':'reference',fineTunedModelId:String(out.engineParams.qwen3tts?.fineTunedModelId||'')};return out;}
function applyProfileTts(settings,extra){settings.tts=settings.tts||{};Object.assign(settings.tts,normalizeProfileTts(extra));return settings;}
function captureOptimization(s={}){return{optimization0321:clone(s.optimization0321||null),ai:{localResourceMode:s.ai?.localResourceMode||'safe_streaming',localAutoTuned:!!s.ai?.localAutoTuned,localTunedConfig:clone(s.ai?.localTunedConfig||null),lastLocalBenchmark:clone(s.ai?.lastLocalBenchmark||null)},tts:{resourceMode:s.tts?.resourceMode||'safe_streaming',performanceThreads:Number(s.tts?.performanceThreads)||6,autoTune:s.tts?.autoTune!==false,autoTuned:!!s.tts?.autoTuned,lastBenchmark:clone(s.tts?.lastBenchmark||null),lastAdvancedBenchmark:clone(s.tts?.lastAdvancedBenchmark||null),lastHardwareBenchmark:clone(s.tts?.lastHardwareBenchmark||null)}};}
function applyOptimization(s={},saved=null){s.ai=s.ai||{};s.tts=s.tts||{};if(!saved){delete s.optimization0321;s.ai.localResourceMode='safe_streaming';s.ai.localAutoTuned=false;delete s.ai.localTunedConfig;delete s.ai.lastLocalBenchmark;s.tts.resourceMode='safe_streaming';s.tts.autoTuned=false;return s;}s.optimization0321=clone(saved.optimization0321||null);if(s.optimization0321)s.optimization0321.ttsEngine=s.tts.engine||'kokoro';Object.assign(s.ai,clone(saved.ai||{}));Object.assign(s.tts,clone(saved.tts||{}));return s;}

function installProfileRouting(){const p=ProfileManager0329.prototype;if(p.__gecV2TtsProfileRouting)return;Object.defineProperty(p,'__gecV2TtsProfileRouting',{value:true});const baseRead=p.readProfileSettings,baseWrite=p.writeProfileSettings,baseSave=p.saveEffective;
  p.readProfileSettings=function(id){const out=baseRead.call(this,id);const extra=readJson(profileSidecar(this,id),null);return extra?applyProfileTts(out,extra):out;};
  p.writeProfileSettings=function(id,settings){if(id){const extra=pickProfileTts(settings);fs.mkdirSync(this.profileDir(id),{recursive:true});atomicJson(profileSidecar(this,id),extra);}return baseWrite.call(this,id,settings);};
  p.saveEffective=function(defaults,effectiveSettings){const active=this.activeId(),extra=pickProfileTts(effectiveSettings);const result=baseSave.call(this,defaults,effectiveSettings);if(active){fs.mkdirSync(this.profileDir(active),{recursive:true});atomicJson(profileSidecar(this,active),extra);applyProfileTts(result,extra);}return result;};
}

function installSettings(){const p=SettingsStore.prototype;if(p.__gecV2TtsSettings)return;Object.defineProperty(p,'__gecV2TtsSettings',{value:true});const baseDefaults=p.defaults,baseLoad=p.load,baseSave=p.save;
  p.defaults=function(){const s=baseDefaults.call(this);s.tts=s.tts||{};Object.assign(s.tts,normalizeProfileTts(s.tts));s.tts.engineOptimizations=s.tts.engineOptimizations&&typeof s.tts.engineOptimizations==='object'?s.tts.engineOptimizations:{};return s;};
  p.load=function(){const s=baseLoad.call(this);s.tts=s.tts||{};Object.assign(s.tts,normalizeProfileTts(s.tts));s.tts.engineOptimizations=s.tts.engineOptimizations&&typeof s.tts.engineOptimizations==='object'?s.tts.engineOptimizations:{};const engine=s.tts.engine||'kokoro',current=s.optimization0321;if(current&&!current.ttsEngine&&engine==='kokoro'){current.ttsEngine='kokoro';if(!s.tts.engineOptimizations.kokoro)s.tts.engineOptimizations.kokoro=captureOptimization(s);}if(current?.ttsEngine&&current.ttsEngine!==engine)applyOptimization(s,s.tts.engineOptimizations[engine]||null);return s;};
  p.save=function(settings){const s=settings&&typeof settings==='object'?settings:{};s.tts=s.tts||{};Object.assign(s.tts,normalizeProfileTts(s.tts));s.tts.engineOptimizations=s.tts.engineOptimizations&&typeof s.tts.engineOptimizations==='object'?s.tts.engineOptimizations:{};const engine=s.tts.engine||'kokoro';if(s.optimization0321){s.optimization0321={...s.optimization0321,ttsEngine:engine};s.tts.engineOptimizations[engine]=captureOptimization(s);}return baseSave.call(this,s);};
}

function currentSettings(){try{return new SettingsStore(labDataRoot()).load();}catch{return{tts:normalizeProfileTts({})};}}
function installTtsRouting(){const p=KokoroTTS.prototype;if(p.__gecV2EngineRouting)return;Object.defineProperty(p,'__gecV2EngineRouting',{value:true});const baseGenerate=p.generate,baseBenchmark=p.benchmark,baseStop=p.stop,baseStopWait=p.stopAndWait,baseStatus=p.status;
  p.generate=function(text,options={}){const s=currentSettings(),engine=s.tts?.engine||'kokoro';if(engine==='kokoro')return baseGenerate.call(this,text,options);const params=s.tts?.engineParams?.[engine]||{};return labRuntime().generate(engine,text,{referenceVoiceId:s.tts?.referenceVoiceId||'',style:s.tts?.style||'news',params});};
  p.benchmark=async function(options={}){const s=currentSettings(),engine=s.tts?.engine||'kokoro';if(engine==='kokoro')return baseBenchmark.call(this,options);const params=s.tts?.engineParams?.[engine]||{};let referencePath='',referenceText='',tempPath='';if(engine==='qwen3tts'&&String(params.voiceMode||'reference')!=='finetuned'){const selected=labRuntime().voice(s.tts?.referenceVoiceId||'');if(!selected?.transcript){referenceText='GEC Automatic News utiliza esta voz temporal únicamente para medir el rendimiento de Qwen tres TTS durante la optimización.';const temp=await baseGenerate.call(this,referenceText,{voice:s.tts?.voice||'ef_dora',speed:1});referencePath=temp?.path||'';tempPath=referencePath;}}try{return await labRuntime().benchmark(engine,{referenceVoiceId:s.tts?.referenceVoiceId||'',referencePath,referenceText,style:s.tts?.style||'news',params});}finally{if(tempPath)try{fs.rmSync(tempPath,{force:true});}catch{}}};
  p.status=function(){const out=baseStatus.call(this),s=currentSettings(),engine=s.tts?.engine||'kokoro',lab=engine==='kokoro'?null:labRuntime().status(engine),row=lab?.engines?.find(x=>x.id===engine);return{...out,selectedEngine:engine,selectedEngineLabel:engine==='kokoro'?'Kokoro':ENGINES[engine]?.label||engine,selectedEngineInstalled:engine==='kokoro'?out.ready:!!row?.installed,selectedEnginePrepared:engine==='kokoro'?out.ready:!!row?.prepared};};
  p.stop=function(reason='manual'){try{labRuntime().stop();}catch{}return baseStop.call(this,reason);};
  p.stopAndWait=async function(reason='manual',timeoutMs=2500){try{await labRuntime().stopAndWait();}catch{}return baseStopWait.call(this,reason,timeoutMs);};
}

function installIpc(){const bind=(name,fn)=>{try{ipcMain.removeHandler(name);}catch{}ipcMain.handle(name,fn);};
  bind('tts-lab:status',()=>{const s=currentSettings();return labRuntime().status(s.tts?.engine||'kokoro');});
  bind('tts-lab:install',async(_,p={})=>labRuntime().install(String(p.engine||'')));
  bind('tts-lab:prepare',async(_,p={})=>labRuntime().prepare(String(p.engine||'')));
  bind('tts-lab:prepareReference',async(_,p={})=>labRuntime().prepareReference(String(p.engine||''),String(p.id||'')));
  bind('tts-lab:importReference',async()=>{const r=await dialog.showOpenDialog({title:'Añadir voz de referencia',properties:['openFile'],filters:[{name:'Audio de referencia',extensions:['wav','flac']}]});if(r.canceled||!r.filePaths?.[0])return{ok:false,cancelled:true};const item=labRuntime().importReference(r.filePaths[0]);return{ok:true,item,voices:labRuntime().listVoices()};});
  bind('tts-lab:updateReference',(_,p={})=>({ok:true,item:labRuntime().updateReference(String(p.id||''),{name:p.name,transcript:p.transcript}),voices:labRuntime().listVoices()}));
  bind('tts-lab:deleteReference',(_,p={})=>{const id=String(p.id||''),m=getProfileManager(labDataRoot()),users=m.list().filter(x=>String(m.readProfileSettings(x.id).tts?.referenceVoiceId||'')===id).map(x=>x.name);if(users.length)throw new Error(`La voz de referencia está en uso por: ${users.join(', ')}. Cambia esos perfiles antes de eliminarla.`);return{ok:true,item:labRuntime().deleteReference(id),voices:labRuntime().listVoices()};});
  bind('tts-lab:importFineTunedModel',async()=>{const r=await dialog.showOpenDialog({title:'Importar modelo Qwen3-TTS entrenado',properties:['openFile'],filters:[{name:'Checkpoint Qwen3-TTS',extensions:['zip']}]});if(r.canceled||!r.filePaths?.[0])return{ok:false,cancelled:true};const item=labRuntime().importFineTunedZip(r.filePaths[0]);return{ok:true,item,models:labRuntime().listFineTunedModels()};});
  bind('tts-lab:deleteFineTunedModel',(_,p={})=>{const id=String(p.id||''),m=getProfileManager(labDataRoot()),users=m.list().filter(x=>String(m.readProfileSettings(x.id).tts?.engineParams?.qwen3tts?.fineTunedModelId||'')===id).map(x=>x.name);if(users.length)throw new Error(`El modelo entrenado está en uso por: ${users.join(', ')}. Cambia esos perfiles antes de eliminarlo.`);return{ok:true,item:labRuntime().deleteFineTunedModel(id),models:labRuntime().listFineTunedModels()};});
  bind('tts-lab:selectEngine',(_,p={})=>{const engine=String(p.engine||'kokoro');if(!VALID_ENGINES.has(engine))throw new Error('Motor TTS no válido');const store=new SettingsStore(labDataRoot()),s=store.load(),old=s.tts.engine||'kokoro';if(old===engine)return{ok:true,unchanged:true,settings:s,status:labRuntime().status(engine)};s.tts.engineOptimizations=s.tts.engineOptimizations||{};if(s.optimization0321)s.tts.engineOptimizations[old]=captureOptimization(s);s.tts.engine=engine;applyOptimization(s,s.tts.engineOptimizations[engine]||null);store.save(s);return{ok:true,settings:store.load(),status:labRuntime().status(engine)};});
}

function installReleaseV2Lab(){installProfileRouting();installSettings();installTtsRouting();installIpc();}
module.exports={installReleaseV2Lab,normalizeProfileTts,captureOptimization,applyOptimization,PROFILE_TTS_KEYS};
