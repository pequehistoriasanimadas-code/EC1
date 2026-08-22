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
const tempDir=path.join(os.tmpdir(),`ec-0314-smoke-${process.pid}`);

function assert(ok,message){if(!ok)throw new Error(message);}
function handle(channel,fn){ipcMain.handle(channel,async(...args)=>fn(...args));}
function securePrefs(extra={}){return{preload,contextIsolation:true,nodeIntegration:false,sandbox:true,...extra};}
function delay(ms){return new Promise(r=>setTimeout(r,ms));}
async function cleanupTempBestEffort(dir){
  if(!dir||!fs.existsSync(dir))return true;
  let lastError=null;
  for(let attempt=0;attempt<6;attempt++){
    try{fs.rmSync(dir,{recursive:true,force:true,maxRetries:2,retryDelay:120});return true;}
    catch(e){lastError=e;await delay(150*(attempt+1));}
  }
  console.warn(`SMOKE CLEANUP WARNING · no se pudo borrar ${dir}: ${lastError?.message||lastError}`);
  return false;
}
async function waitForJs(win,expression,timeoutMs=20000){const started=Date.now();let lastError='';while(Date.now()-started<timeoutMs){try{if(await win.webContents.executeJavaScript(`Boolean(${expression})`))return;}catch(e){lastError=e.message||String(e);}await new Promise(r=>setTimeout(r,200));}throw new Error(`Timeout esperando ${expression}${lastError?` · ${lastError}`:''}`);}
function automationState(){return{processing:{running:false,paused:false,message:'Smoke test: preparación detenida.'},emission:{running:false,paused:false,currentKind:'',currentTitle:''},counts:{ready:0,processing:0,pending:0,error:0,total:0},buffer:{target:15,autonomyMin:0,health:'critical'},canned:{enabled:true,available:0,nextIn:10,due:false},ads:{enabled:true,available:0},documents:{pending:0,processing:false},session:{newsEmitted:0,cannedEmitted:0,adsEmitted:0},queue:[]};}

app.whenReady().then(async()=>{
  fs.mkdirSync(tempDir,{recursive:true});
  let kokoro=null,control=null,output=null,oldPythonPath=process.env.PYTHONPATH;
  try{
    for(const p of [appRoot,preload,controlHtml,outputHtml])assert(fs.existsSync(p),`Recurso empaquetado ausente: ${p}`);
    const {SettingsStore,DEFAULT_CLAUDE_MODEL}=require(path.join(appRoot,'src','services','settings.js'));
    const {KokoroTTS}=require(path.join(appRoot,'src','services','kokoro.js'));
    const {PronunciationNormalizer}=require(path.join(appRoot,'src','services','pronunciation.js'));
    const {DocumentLibrary}=require(path.join(appRoot,'src','services','documents.js'));
    const settingsStore=new SettingsStore(tempDir);
    const publicSettings=()=>{const s=settingsStore.load();const {claudeKeyEnc,geminiKeyEnc,...ai}=s.ai||{};return{...s,ai:{...ai,claudeModel:DEFAULT_CLAUDE_MODEL,claudeKey:'',geminiKey:'',hasClaudeKey:!!claudeKeyEnc,hasGeminiKey:!!geminiKeyEnc},visual:{...s.visual,fallbackImageUrl:'',output:{...(s.visual?.output||{}),verticalVideoBackgroundUrl:'',musicUrl:''}}};};

    handle('settings:get',()=>publicSettings());handle('settings:save',()=>({ok:true,claudeModel:DEFAULT_CLAUDE_MODEL,hasClaudeKey:false,hasGeminiKey:false}));
    handle('local:status',()=>({runtime:true,model:false,running:false,downloading:false,profile:{label:'Smoke',ctx:0,gpuLayers:0,threads:2}}));
    handle('pronunciation:status',()=>({runtime:true,model:false,running:false,learningEntries:0,cacheEntries:0,claudeVerifyEnabled:true,maxSeconds:15,modelName:'Qwen3-0.6B-Q4_0.gguf'}));
    handle('tts:status',()=>({ready:true,persistent:true,workerRunning:false,voices:['ef_dora','em_alex'],threads:2,profile:'safe_streaming',profileLabel:'Seguro para transmisión',onnxInterThreads:1,executionMode:'sequential'}));
    handle('documents:list',()=>({ok:true,folder:'',count:0,files:[],message:'Sin carpeta seleccionada'}));
    handle('canned:list',()=>({ok:true,folder:'',count:0,files:[],message:'Sin carpeta seleccionada'}));handle('canned:listAds',()=>({ok:true,folder:'',count:0,files:[],message:'Sin carpeta seleccionada'}));
    handle('automation:status',()=>automationState());handle('output:status',()=>({open:false,source:'none',kind:'none',title:'',format:'16:9',resolution:'1920×1080'}));handle('rss:load',()=>({items:[],errors:[],feedStatus:[]}));handle('rss:test',()=>({ok:true,count:1,mode:'SMOKE',detail:'OK'}));handle('article:fetch',()=>({title:'Smoke',description:'',body:'',image:''}));
    for(const ch of ['providers:test','providers:generate','local:downloadModel','local:start','local:stop','pronunciation:downloadModel','pronunciation:stop','pronunciation:test','pronunciation:exportLearning','pronunciation:importLearning','pronunciation:clearLearning','tts:generate','tts:benchmark','documents:pickFolder','documents:enqueue','documents:resetProcessed','fallback:pick','output:pickVerticalBackground','output:clearVerticalBackground','output:pickMusic','output:clearMusic','canned:pickFolder','canned:pickAdsFolder','canned:launchNow','output:open','output:close','output:manualSend','automation:processingStart','automation:processingPause','automation:processingResume','automation:processingStop','automation:emissionStart','automation:emissionPause','automation:emissionResume','automation:emissionStop','automation:clearQueue','automation:resetCounters','history:reset'])handle(ch,()=>({ok:true}));

    control=new BrowserWindow({show:false,width:1200,height:800,webPreferences:securePrefs()});await control.loadFile(controlHtml,{query:{selftest:'1'}});await waitForJs(control,"window.ECAPI && typeof window.ECAPI.getSettings==='function'",10000);await waitForJs(control,"document.querySelector('#voice') && document.querySelector('#voice').options.length>=2",15000);await waitForJs(control,"document.querySelector('#dateColor') && document.querySelector('#documentList') && document.querySelector('#queueColorGenerated') && document.querySelector('#processingDetail')",10000);
    const bridge=await control.webContents.executeJavaScript("Promise.all([window.ECAPI.getSettings(),window.ECAPI.documentList()]).then(([s,d])=>({model:s.ai.claudeModel,voice:s.tts.voice,docs:d.count,dateColor:s.visual.output.dateColor}))");assert(bridge?.model===DEFAULT_CLAUDE_MODEL,'Control bridge no devolvió Claude Haiku 4.5');assert(/^#/.test(bridge.dateColor||''),'Color de fecha independiente no llegó al renderer');

    output=new BrowserWindow({show:false,width:960,height:540,webPreferences:securePrefs({backgroundThrottling:false})});await output.loadFile(outputHtml);await waitForJs(output,"window.ECAPI && typeof window.ECAPI.outputPlayback==='function' && document.querySelector('#stage')",10000);output.webContents.send('output:design',{format:'9:16',animation:'horizontal',motionSpeed:'fast',summaryColor:'#00ff00',dateColor:'#ff0000'});await waitForJs(output,"document.querySelector('#stage').dataset.format==='9:16' && getComputedStyle(document.documentElement).getPropertyValue('--date-color').trim()==='#ff0000'",5000);output.webContents.send('output:story',{kind:'news',title:'Smoke Output',summary:'Prueba',category:'TEST',image:'',audioUrl:'',design:{format:'16:9'}});await waitForJs(output,"document.querySelector('#title').textContent==='Smoke Output'",5000);

    const docDir=path.join(tempDir,'docs','POLITICA');fs.mkdirSync(docDir,{recursive:true});fs.writeFileSync(path.join(docDir,'POLITICA.jpg'),'x');fs.writeFileSync(path.join(docDir,'smoke.txt'),'TÍTULO: Nota smoke\nFECHA: 21/08/2026\nTexto de prueba para el generador.','utf8');const docs=new DocumentLibrary();const docScan=docs.scan(path.join(tempDir,'docs'));assert(docScan.count===1&&docScan.files[0].categoryFromFolder==='POLÍTICA'&&docScan.files[0].imageSource==='category','Generador empaquetado no detectó TXT/categoría/imagen');const docRead=await docs.read(docScan.files[0].path);assert(docRead.explicitTitle==='Nota smoke'&&docRead.explicitDate,'Lectura de documento empaquetado falló');

    const pron=new PronunciationNormalizer({resourcesDir,dataDir:tempDir,getSettings:()=>({tts:{pronunciationMaxSeconds:15,pronunciationClaudeVerify:false}})});const normalized=pron.basic('Apple TV informó un avance de 25% y S/900 millones.');assert(/ápol te uve/i.test(normalized)&&/25 por ciento/i.test(normalized)&&/900 millones de soles/i.test(normalized),'Normalizador empaquetado falló');assert(pron.candidates('Élysée recibió a Donald Trump.').some(x=>x.term==='Élysée'),'Detector Unicode empaquetado falló');

    kokoro=new KokoroTTS({resourcesDir,dataDir:tempDir});assert(kokoro.ready(),'Kokoro empaquetado incompleto');const voices=await kokoro.listVoices();assert(voices.length>0,'Kokoro no listó voces reales');const selectedVoice=voices.includes('ef_dora')?'ef_dora':voices[0];const sample1=await kokoro.generate('Prueba breve de voz número uno.',{voice:selectedVoice,speed:1});assert(sample1.path&&fs.existsSync(sample1.path)&&fs.statSync(sample1.path).size>1000,'Kokoro no generó el primer WAV real');assert(sample1.persistent===true,'Kokoro empaquetado no usó el trabajador persistente');const workerPid=kokoro.worker?.pid||0;const sample2=await kokoro.generate('Prueba breve de voz número dos.',{voice:selectedVoice,speed:1});assert(sample2.path&&fs.existsSync(sample2.path)&&fs.statSync(sample2.path).size>1000,'Kokoro no generó el segundo WAV real');assert(workerPid&&kokoro.worker?.pid===workerPid,'Kokoro recargó el trabajador entre notas');kokoro.cleanupAudio(sample1.path);kokoro.cleanupAudio(sample2.path);kokoro.stop('smoke-relocation');kokoro=null;

    // Simula renombrar/mover la carpeta: eSpeak se importa desde otra ruta con espacios,
    // mientras el resto del runtime sigue empaquetado. Si hubiera quedado una ruta D:/a/...
    // de compilación, esta síntesis real falla al leer phontab.
    const loaderSrc=path.join(resourcesDir,'runtime','python','Lib','site-packages','espeakng_loader');assert(fs.existsSync(loaderSrc),'espeakng_loader no está incluido en Python portable');const relocatedSite=path.join(tempDir,'EC Automatic News Movido','Lib','site-packages'),loaderDst=path.join(relocatedSite,'espeakng_loader');fs.mkdirSync(relocatedSite,{recursive:true});fs.cpSync(loaderSrc,loaderDst,{recursive:true});process.env.PYTHONPATH=relocatedSite+(oldPythonPath?`${path.delimiter}${oldPythonPath}`:'');kokoro=new KokoroTTS({resourcesDir,dataDir:tempDir});const movedSample=await kokoro.generate('Prueba de voz después de mover la carpeta portable.',{voice:selectedVoice,speed:1});assert(movedSample.path&&fs.existsSync(movedSample.path)&&fs.statSync(movedSample.path).size>1000,'eSpeak/Kokoro falló al resolver datos desde una carpeta movida');kokoro.cleanupAudio(movedSample.path);kokoro.stop('smoke');kokoro=null;process.env.PYTHONPATH=oldPythonPath;

    control.destroy();control=null;output.destroy();output=null;
    // En Windows el worker de Python puede tardar unos milisegundos en liberar DLL/WAV.
    // La limpieza del directorio temporal no forma parte de la validación funcional.
    await delay(350);await cleanupTempBestEffort(tempDir);
    console.log(`PACKAGED SMOKE 0.3.14 OK · bridge · Generador TXT · Output · normalizador · Kokoro persistente · eSpeak relocatable · voces=${voices.length}`);app.exit(0);
  }catch(e){console.error(e.stack||e);try{kokoro?.stop('smoke-error');}catch{}try{control?.destroy();output?.destroy();}catch{}if(oldPythonPath===undefined)delete process.env.PYTHONPATH;else process.env.PYTHONPATH=oldPythonPath;await delay(250);await cleanupTempBestEffort(tempDir);app.exit(1);}
});
