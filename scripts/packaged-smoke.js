'use strict';
const fs=require('fs');
const path=require('path');
const os=require('os');
const {app,BrowserWindow,ipcMain}=require('electron');

const resourcesDir=path.resolve(process.argv[2]||path.join('dist','win-unpacked','resources'));
const appRoot=path.join(resourcesDir,'app.asar');
const preload=path.join(appRoot,'src','preload.js');
const controlHtml=path.join(appRoot,'src','control.html');
const outputHtml=path.join(appRoot,'src','output.html');
const tempDir=path.join(os.tmpdir(),`ec-0311-smoke-${process.pid}`);

function assert(ok,message){if(!ok)throw new Error(message);}
function handle(channel,fn){ipcMain.handle(channel,async(...args)=>fn(...args));}
function securePrefs(extra={}){return{preload,contextIsolation:true,nodeIntegration:false,sandbox:true,...extra};}
async function waitForJs(win,expression,timeoutMs=20000){
  const started=Date.now();let lastError='';
  while(Date.now()-started<timeoutMs){
    try{if(await win.webContents.executeJavaScript(`Boolean(${expression})`))return;}catch(e){lastError=e.message||String(e);}
    await new Promise(r=>setTimeout(r,200));
  }
  throw new Error(`Timeout esperando ${expression}${lastError?` · ${lastError}`:''}`);
}

function automationState(){return{
  processing:{running:false,paused:false,message:'Smoke test: procesamiento detenido.'},
  emission:{running:false,paused:false,currentKind:'',currentTitle:''},
  counts:{ready:0,processing:0,error:0,total:0},
  buffer:{target:15,autonomyMin:0},
  canned:{enabled:true,available:0,nextIn:10,due:false},
  ads:{enabled:true,available:0},
  session:{newsEmitted:0,cannedEmitted:0,adsEmitted:0},
  queue:[]
};}

app.whenReady().then(async()=>{
  fs.mkdirSync(tempDir,{recursive:true});
  try{
    for(const p of [appRoot,preload,controlHtml,outputHtml])assert(fs.existsSync(p),`Recurso empaquetado ausente: ${p}`);
    const {SettingsStore,DEFAULT_CLAUDE_MODEL}=require(path.join(appRoot,'src','services','settings.js'));
    const {KokoroTTS}=require(path.join(appRoot,'src','services','kokoro.js'));
    const {PronunciationNormalizer}=require(path.join(appRoot,'src','services','pronunciation.js'));
    const settingsStore=new SettingsStore(tempDir);
    const publicSettings=()=>{
      const s=settingsStore.load();
      const {claudeKeyEnc,geminiKeyEnc,...ai}=s.ai||{};
      return{...s,ai:{...ai,claudeModel:DEFAULT_CLAUDE_MODEL,claudeKey:'',geminiKey:'',hasClaudeKey:!!claudeKeyEnc,hasGeminiKey:!!geminiKeyEnc},visual:{...s.visual,fallbackImageUrl:'',output:{...(s.visual?.output||{}),verticalVideoBackgroundUrl:'',musicUrl:''}}};
    };

    handle('settings:get',()=>publicSettings());
    handle('settings:save',()=>({ok:true,claudeModel:DEFAULT_CLAUDE_MODEL,hasClaudeKey:false,hasGeminiKey:false}));
    handle('local:status',()=>({runtime:true,model:false,running:false,downloading:false,profile:{label:'Smoke',ctx:0,gpuLayers:0,threads:2}}));
    handle('pronunciation:status',()=>({runtime:true,model:false,running:false,learningEntries:0,cacheEntries:0,claudeVerifyEnabled:true,maxSeconds:15,modelName:'Qwen3-0.6B-Q4_0.gguf'}));
    handle('tts:status',()=>({ready:true,voices:['ef_dora','em_alex'],threads:2,profile:'safe_streaming',profileLabel:'Seguro para streaming',onnxInterThreads:1,executionMode:'sequential'}));
    handle('canned:list',()=>({ok:true,folder:'',count:0,files:[],message:'Sin carpeta seleccionada'}));
    handle('canned:listAds',()=>({ok:true,folder:'',count:0,files:[],message:'Sin carpeta seleccionada'}));
    handle('automation:status',()=>automationState());
    handle('output:status',()=>({open:false,source:'none',kind:'none',title:'',format:'16:9',resolution:'1920×1080'}));
    handle('rss:load',()=>({items:[],errors:[],feedStatus:[]}));
    handle('rss:test',()=>({ok:true,count:1,mode:'SMOKE',detail:'OK'}));
    handle('article:fetch',()=>({title:'Smoke',description:'',body:'',image:''}));
    for(const ch of ['providers:test','providers:generate','local:downloadModel','local:start','local:stop','pronunciation:downloadModel','pronunciation:stop','pronunciation:test','pronunciation:exportLearning','pronunciation:importLearning','pronunciation:clearLearning','tts:generate','fallback:pick','output:pickVerticalBackground','output:clearVerticalBackground','output:pickMusic','output:clearMusic','canned:pickFolder','canned:pickAdsFolder','canned:launchNow','output:open','output:close','output:manualSend','automation:processingStart','automation:processingPause','automation:processingResume','automation:processingStop','automation:emissionStart','automation:emissionPause','automation:emissionResume','automation:emissionStop','automation:clearQueue','automation:resetCounters','history:reset']){
      handle(ch,()=>({ok:true}));
    }

    const control=new BrowserWindow({show:false,width:1200,height:800,webPreferences:securePrefs()});
    await control.loadFile(controlHtml,{query:{selftest:'1'}});
    await waitForJs(control,"window.ECAPI && typeof window.ECAPI.getSettings==='function'",10000);
    await waitForJs(control,"document.querySelector('#voice') && document.querySelector('#voice').options.length>=2",15000);
    await waitForJs(control,"document.querySelector('#dateFontFamily') && document.querySelector('#adsList') && document.querySelector('#processingDetail')",10000);
    const bridge=await control.webContents.executeJavaScript("window.ECAPI.getSettings().then(s=>({model:s.ai.claudeModel,voice:s.tts.voice}))");
    assert(bridge?.model===DEFAULT_CLAUDE_MODEL,'Control bridge no devolvió Claude Haiku 4.5');

    const output=new BrowserWindow({show:false,width:960,height:540,webPreferences:securePrefs({backgroundThrottling:false})});
    await output.loadFile(outputHtml);
    await waitForJs(output,"window.ECAPI && typeof window.ECAPI.outputPlayback==='function' && document.querySelector('#stage')",10000);
    output.webContents.send('output:design',{format:'9:16',animation:'horizontal',motionSpeed:'fast'});
    await waitForJs(output,"document.querySelector('#stage').dataset.format==='9:16'",5000);
    output.webContents.send('output:story',{kind:'news',title:'Smoke Output',summary:'Prueba',category:'TEST',image:'',audioUrl:'',design:{format:'16:9'}});
    await waitForJs(output,"document.querySelector('#title').textContent==='Smoke Output'",5000);

    const pron=new PronunciationNormalizer({resourcesDir,dataDir:tempDir,getSettings:()=>({tts:{pronunciationMaxSeconds:15,pronunciationClaudeVerify:false}})});
    const normalized=pron.basic('Apple TV informó un avance de 25% y S/900 millones.');
    assert(/ápol te uve/i.test(normalized)&&/25 por ciento/i.test(normalized)&&/900 millones de soles/i.test(normalized),'Normalizador empaquetado falló');
    assert(pron.candidates('Élysée recibió a Donald Trump.').some(x=>x.term==='Élysée'),'Detector Unicode empaquetado falló');

    const kokoro=new KokoroTTS({resourcesDir,dataDir:tempDir});
    assert(kokoro.ready(),'Kokoro empaquetado incompleto');
    const voices=await kokoro.listVoices();assert(voices.length>0,'Kokoro no listó voces reales');
    const sample=await kokoro.generate('Prueba breve de voz.',{voice:voices.includes('ef_dora')?'ef_dora':voices[0],speed:1});
    assert(sample.path&&fs.existsSync(sample.path)&&fs.statSync(sample.path).size>1000,'Kokoro no generó WAV real');
    kokoro.cleanupAudio(sample.path);

    control.destroy();output.destroy();
    console.log(`PACKAGED SMOKE OK · bridge · selector voces · Output · Preview IPC · normalizador · Kokoro real · voces=${voices.length}`);
    fs.rmSync(tempDir,{recursive:true,force:true});
    app.exit(0);
  }catch(e){
    console.error(e.stack||e);
    try{fs.rmSync(tempDir,{recursive:true,force:true});}catch{}
    app.exit(1);
  }
});
