const { app, BrowserWindow, ipcMain, dialog, Notification, screen } = require('electron');
app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const rss = require('./services/rss');
const { fetchArticle } = require('./services/article');
const { SettingsStore } = require('./services/settings');
const { LocalRuntime } = require('./services/localRuntime');
const { PronunciationNormalizer } = require('./services/pronunciation');
const { KokoroTTS } = require('./services/kokoro');
const { Providers } = require('./services/providers');
const { HistoryStore } = require('./services/history');
const { CannedManager } = require('./services/canned');
const { AutomationEngine } = require('./services/automation');

let controlWindow;
let outputWindow;
let settingsStore;
let localRuntime;
let pronunciation;
let kokoro;
let providers;
let history;
let canned;
let automation;
let dataDir;
let resourcesDir;
let startupLogFile = '';
let outputState={open:false,source:'none',kind:'none',title:'',format:'16:9',resolution:'1920×1080'};

function portableDataDir() {
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
  if (portableDir) return path.join(portableDir, 'EC Automatic News Data');
  if (app.isPackaged) return path.join(path.dirname(process.execPath), 'EC Automatic News Data');
  return path.join(app.getPath('userData'), 'EC Automatic News Data');
}
function initStartupLog() {
  try {
    const base = portableDataDir();
    const dir = path.join(base, 'logs');
    fs.mkdirSync(dir, { recursive: true });
    startupLogFile = path.join(dir, 'startup.log');
  } catch { startupLogFile = path.join(app.getPath('temp'), 'EC-Automatic-News-startup.log'); }
  logEvent('START', `version=${app.getVersion()} packaged=${app.isPackaged} exec=${process.execPath}`);
}
function logEvent(kind, message) {
  const line = `[${new Date().toISOString()}] ${kind}: ${String(message || '')}\n`;
  try { if (startupLogFile) fs.appendFileSync(startupLogFile, line, 'utf8'); } catch {}
  try { console.log(line.trim()); } catch {}
}
function fatalError(label, err) {
  const msg = err?.stack || err?.message || String(err);
  logEvent(label, msg);
  try { dialog.showErrorBox('EC Automatic News', `${label}\n\n${err?.message || err}\n\nLog: ${startupLogFile || 'no disponible'}`); } catch {}
}
function sendControl(channel, payload) {
  if (controlWindow && !controlWindow.isDestroyed()) controlWindow.webContents.send(channel, payload);
}
function notify(title, body) { if (Notification.isSupported()) new Notification({title,body}).show(); }
function fileUrl(p){
  const value=String(p||'').trim();
  return value&&fs.existsSync(value)?pathToFileURL(value).href:'';
}
function fallbackUrl() {
  const s=settingsStore.load();
  return fileUrl(s.visual.fallbackImage);
}
function enrichDesign(raw={}){
  return {
    ...raw,
    verticalVideoBackgroundUrl:fileUrl(raw.verticalVideoBackground),
    musicUrl:fileUrl(raw.musicFile)
  };
}
function currentDesign(){return enrichDesign(settingsStore?.load()?.visual?.output||{});}
function broadcastOutputState(){sendControl('output:state',{...outputState});}
function setOutputState(patch){outputState={...outputState,...patch};broadcastOutputState();}
function nativeOutputSize(format,win=null){
  const px=format==='9:16'?{width:1080,height:1920,resolution:'1080×1920'}:{width:1920,height:1080,resolution:'1920×1080'};
  let scaleFactor=1;
  try{
    const d=win&&!win.isDestroyed()?screen.getDisplayMatching(win.getBounds()):screen.getPrimaryDisplay();
    scaleFactor=Number(d?.scaleFactor)||1;
  }catch{}
  return {...px,dipWidth:Math.max(1,Math.round(px.width/scaleFactor)),dipHeight:Math.max(1,Math.round(px.height/scaleFactor)),scaleFactor};
}
function sendDesignLive(){if(outputWindow&&!outputWindow.isDestroyed())outputWindow.webContents.send('output:design',currentDesign());}

async function syncLocalPolicy(settings=settingsStore?.load()){
  if(!settings||!localRuntime)return;
  const ai=settings.ai||{};
  const localAsBackup=ai.primary!=='local'&&[ai.backup1,ai.backup2].includes('local');
  if(localAsBackup&&(ai.localBackupMode||'on_demand')==='always'){
    try{
      const st=await localRuntime.status();
      if(st.model&&!st.running) await localRuntime.start();
    }catch(e){sendControl('local:event',{type:'local-ai-error',message:e.message||String(e)});}
  } else if(localAsBackup&&(ai.localBackupMode||'on_demand')==='on_demand'){
    const minutes=Math.max(1,Math.min(60,Number(ai.localIdleMinutes)||5));
    localRuntime.scheduleIdleStop(minutes*60000);
  }
}

function createControlWindow() {
  controlWindow = new BrowserWindow({
    width: 1500, height: 940, minWidth: 1100, minHeight: 720,
    title: 'EC Automatic News', backgroundColor:'#0f0f0f',
    webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false}
  });
  controlWindow.webContents.on('did-fail-load',(_,code,desc,url)=>logEvent('CONTROL_LOAD_FAIL',`${code} ${desc} ${url}`));
  controlWindow.webContents.on('render-process-gone',(_,details)=>logEvent('CONTROL_RENDER_GONE',JSON.stringify(details)));
  controlWindow.loadFile(path.join(__dirname,'control.html')).catch(e=>fatalError('No se pudo cargar la interfaz',e));
  controlWindow.webContents.once('did-finish-load',()=>{broadcastOutputState();if(automation)sendControl('automation:state',automation.getState());});
}
function applyOutputWindowFormat(format,resize=false){
  if(!outputWindow||outputWindow.isDestroyed()) return;
  const vertical=format==='9:16';
  const n=nativeOutputSize(format,outputWindow);
  try{outputWindow.setAspectRatio(vertical?9/16:16/9);}catch{}
  if(resize){try{outputWindow.setContentSize(n.dipWidth,n.dipHeight,false);}catch{}}
  setOutputState({format:vertical?'9:16':'16:9',resolution:n.resolution,scaleFactor:n.scaleFactor});
}
function createOutputWindow() {
  if (outputWindow && !outputWindow.isDestroyed()) { outputWindow.show(); return outputWindow; }
  const design=currentDesign();
  const n=nativeOutputSize(design.format);
  outputWindow = new BrowserWindow({
    width:n.dipWidth,height:n.dipHeight,
    useContentSize:true,
    frame:false,
    resizable:false,
    maximizable:false,
    fullscreenable:false,
    roundedCorners:false,
    hasShadow:false,
    title:'EC Automatic News — OUTPUT',
    backgroundColor:'#000000',autoHideMenuBar:true,
    webPreferences:{
      preload:path.join(__dirname,'preload.js'),
      contextIsolation:true,nodeIntegration:false,
      backgroundThrottling:false
    }
  });
  setOutputState({open:true,source:'none',kind:'none',title:'',format:design.format||'16:9',resolution:n.resolution,scaleFactor:n.scaleFactor});
  try{outputWindow.webContents.setBackgroundThrottling(false);}catch{}
  outputWindow.webContents.on('did-fail-load',(_,code,desc,url)=>logEvent('OUTPUT_LOAD_FAIL',`${code} ${desc} ${url}`));
  outputWindow.webContents.on('render-process-gone',(_,details)=>logEvent('OUTPUT_RENDER_GONE',JSON.stringify(details)));
  outputWindow.loadFile(path.join(__dirname,'output.html')).catch(e=>fatalError('No se pudo cargar Output',e));
  outputWindow.webContents.once('did-finish-load',()=>{
    try{outputWindow.webContents.setBackgroundThrottling(false);}catch{}
    outputWindow.webContents.send('output:design',currentDesign());
    const actual=nativeOutputSize(design.format,outputWindow);
    setOutputState({open:true,format:design.format||'16:9',resolution:actual.resolution,scaleFactor:actual.scaleFactor});
  });
  outputWindow.on('move',()=>{try{applyOutputWindowFormat(currentDesign().format||'16:9',true);}catch{}});
  outputWindow.on('closed',()=>{
    outputWindow=null;
    automation?.outputClosed();
    setOutputState({open:false,source:'none',kind:'none',title:''});
  });
  applyOutputWindowFormat(design.format||'16:9',false);
  return outputWindow;
}
function outputReady(){return !!(outputWindow&&!outputWindow.isDestroyed());}
function deliverToOutput(payload,source,autoOpen=false){
  let win=outputWindow;
  if((!win||win.isDestroyed())&&autoOpen) win=createOutputWindow();
  if(!win||win.isDestroyed()) return false;
  // El diseño (incluido el canal de música) es estado global persistente del Output.
  // No se reenvía con cada noticia para evitar reinicializar/pausar la música entre notas.
  const enriched={...payload,source};
  const deliver=()=>{if(win&&!win.isDestroyed())win.webContents.send('output:story',enriched);};
  if(win.webContents.isLoading()) win.webContents.once('did-finish-load',deliver); else deliver();
  setOutputState({open:true,source,kind:payload.kind||'news',title:payload.title||''});
  return true;
}
function sendAutomaticOutput(payload){return deliverToOutput(payload,'automatic',false);}
function controlOutput(action){if(outputReady())outputWindow.webContents.send('output:control',action);}

function initServices() {
  dataDir = portableDataDir();
  fs.mkdirSync(dataDir,{recursive:true});
  resourcesDir = app.isPackaged ? process.resourcesPath : path.join(__dirname,'..');
  logEvent('PATHS',`dataDir=${dataDir} resourcesDir=${resourcesDir}`);
  settingsStore = new SettingsStore(dataDir);
  history = new HistoryStore(dataDir);
  localRuntime = new LocalRuntime({resourcesDir,dataDir,onEvent:e=>sendControl('local:event',e)});
  pronunciation = new PronunciationNormalizer({resourcesDir,dataDir,onEvent:e=>sendControl('pronunciation:event',e)});
  kokoro = new KokoroTTS({resourcesDir,dataDir});
  providers = new Providers({settingsStore,localRuntime});
  canned = new CannedManager();
  automation = new AutomationEngine({
    rss,fetchArticle,providers,kokoro,pronunciation,canned,history,
    getSettings:()=>settingsStore.load(),
    getFallbackUrl:fallbackUrl,
    sendAutomaticOutput,
    isOutputReady:outputReady,
    controlOutput
  });
  automation.on('state',s=>{
    sendControl('automation:state',s);
    if(outputState.source==='automatic'&&!s.emission.running)setOutputState({source:'none',kind:'none',title:''});
  });
  automation.on('error-item',e=>sendControl('automation:itemError',e));
  automation.on('engine-error',e=>sendControl('automation:engineError',{message:e.message}));
  setTimeout(()=>syncLocalPolicy(settingsStore.load()),800);
  logEvent('SERVICES','initialized');
}

async function runSelfTest() {
  logEvent('SELF_TEST','begin');
  const local = await localRuntime.status();
  if (!local.runtime) throw new Error('llama.cpp runtime no encontrado');
  if (!kokoro.ready()) throw new Error('Kokoro runtime incompleto');
  const normalized=await pronunciation.normalize('Apple TV informó un avance de 25%.',{smart:false});
  if(!/ápol te uve/i.test(normalized.text)||!/25 por ciento/i.test(normalized.text))throw new Error('Normalizador básico falló');
  const testDir=path.join(dataDir,'self-test-canned');fs.mkdirSync(testDir,{recursive:true});
  const dummy=path.join(testDir,'test.mp4');fs.writeFileSync(dummy,'x');
  const scan=canned.list(testDir);if(scan.count!==1)throw new Error('Escaneo de enlatados falló');
  try{fs.unlinkSync(dummy);fs.rmdirSync(testDir);}catch{}
  const voices = await kokoro.listVoices();
  if (!voices.length) throw new Error('Kokoro no pudo listar voces');
  const sample = await kokoro.generate('Prueba de voz.', { voice: voices.includes('ef_dora') ? 'ef_dora' : voices[0], speed: 1.0 });
  if (!sample.path || !fs.existsSync(sample.path) || fs.statSync(sample.path).size < 1000) throw new Error('Kokoro no generó audio válido');
  try { fs.unlinkSync(sample.path); } catch {}
  const html=fs.readFileSync(path.join(__dirname,'output.html'),'utf8');
  if(!html.includes('cannedVideo')||!html.includes('music'))throw new Error('Output multimedia incompleto');
  logEvent('SELF_TEST',`OK voices=${voices.length}`);
}
process.on('uncaughtException',e=>fatalError('Error no controlado',e));
process.on('unhandledRejection',e=>fatalError('Promesa rechazada',e));

app.whenReady().then(async()=>{
  initStartupLog();
  try {
    initServices();
    if (process.argv.includes('--self-test')) { await runSelfTest(); app.exit(0); return; }
    createControlWindow();logEvent('WINDOW','control created');
  } catch (e) { fatalError('La aplicación no pudo iniciar',e);app.exit(1); }
});
app.on('window-all-closed',()=>{
  localRuntime?.stop('app-close');pronunciation?.stop('app-close');
  if(process.platform!=='darwin') app.quit();
});
app.on('before-quit',()=>{localRuntime?.stop('app-quit');pronunciation?.stop('app-quit');});

ipcMain.handle('settings:get',()=>{
  const s=settingsStore.load();
  const { claudeKeyEnc, geminiKeyEnc, ...publicAi } = s.ai;
  return {
    ...s,
    visual:{...s.visual,fallbackImageUrl:fallbackUrl(),output:enrichDesign(s.visual.output||{})},
    ai:{...publicAi,claudeKey:'',geminiKey:'',hasClaudeKey:!!claudeKeyEnc,hasGeminiKey:!!geminiKeyEnc}
  };
});
ipcMain.handle('settings:save',async(_,incoming)=>{
  const current=settingsStore.load();
  const incomingAi={...(incoming.ai||{})};
  const claudePlain=String(incomingAi.claudeKey||'').trim();
  const geminiPlain=String(incomingAi.geminiKey||'').trim();
  delete incomingAi.claudeKey;delete incomingAi.geminiKey;delete incomingAi.claudeKeyEnc;delete incomingAi.geminiKeyEnc;delete incomingAi.hasClaudeKey;delete incomingAi.hasGeminiKey;
  const incomingOutput={...(incoming.visual?.output||{})};
  delete incomingOutput.verticalVideoBackgroundUrl;delete incomingOutput.musicUrl;
  const next={
    ...current,...incoming,
    ai:{...current.ai,...incomingAi},
    tts:{...current.tts,...(incoming.tts||{})},
    visual:{...current.visual,...(incoming.visual||{}),output:{...current.visual.output,...incomingOutput}},
    canned:{...current.canned,...(incoming.canned||{})},
    automation:{...current.automation,...(incoming.automation||{})}
  };
  if(claudePlain) next.ai.claudeKeyEnc=settingsStore.encryptSecret(claudePlain); else next.ai.claudeKeyEnc=current.ai.claudeKeyEnc||'';
  if(geminiPlain) next.ai.geminiKeyEnc=settingsStore.encryptSecret(geminiPlain); else next.ai.geminiKeyEnc=current.ai.geminiKeyEnc||'';
  if(String(current.canned?.folder||'')!==String(next.canned?.folder||''))canned.reset();
  settingsStore.save(next);
  syncLocalPolicy(next);
  if(outputReady()){
    sendDesignLive();
    if(next.visual.output.format!==outputState.format)applyOutputWindowFormat(next.visual.output.format,true);
  }
  return {ok:true,hasClaudeKey:!!next.ai.claudeKeyEnc,hasGeminiKey:!!next.ai.geminiKeyEnc};
});

ipcMain.handle('rss:load',async()=>rss.loadAll(settingsStore.load().rssFeeds));
ipcMain.handle('rss:test',async(_,feed)=>rss.testFeed(feed));
ipcMain.handle('article:fetch',(_,url)=>fetchArticle(url));
ipcMain.handle('providers:test',async(_,provider)=>providers.test(provider,settingsStore.load()));
ipcMain.handle('providers:generate',async(_,story,article)=>providers.generate(story,article,settingsStore.load()));
ipcMain.handle('local:status',()=>localRuntime.status());
ipcMain.handle('local:downloadModel',()=>localRuntime.downloadModel());
ipcMain.handle('local:start',async()=>{await localRuntime.start();return localRuntime.status();});
ipcMain.handle('local:stop',async()=>{localRuntime.stop('manual');return localRuntime.status();});
ipcMain.handle('pronunciation:status',()=>pronunciation.status());
ipcMain.handle('pronunciation:downloadModel',()=>pronunciation.downloadModel());
ipcMain.handle('pronunciation:stop',()=>{pronunciation.stop('manual');return pronunciation.status();});
ipcMain.handle('pronunciation:test',async()=>{
  const s=settingsStore.load();
  const source='Apple TV informó novedades en YouTube y un avance de 25%.';
  const loc=await pronunciation.normalize(source,{smart:s.tts?.pronunciationSmart!==false});
  const audio=await kokoro.generate(loc.text,{voice:s.tts.voice,speed:s.tts.speed});
  return{source,text:loc.text,audioUrl:audio.url,durationSec:audio.durationSec,smartUsed:loc.smartUsed,smartFailed:loc.smartFailed,smartError:loc.smartError,modelReady:loc.modelReady};
});
ipcMain.handle('tts:status',async()=>({ready:kokoro.ready(),voices:kokoro.ready()?await kokoro.listVoices():[],threads:4}));
ipcMain.handle('tts:generate',async(_,text)=>{
  const s=settingsStore.load();
  const loc=await pronunciation.normalize(text,{smart:s.tts?.pronunciationSmart!==false});
  const audio=await kokoro.generate(loc.text,{voice:s.tts.voice,speed:s.tts.speed});
  return {...audio,ttsScript:loc.text,pronunciation:loc};
});

ipcMain.handle('fallback:pick',async()=>{
  const r=await dialog.showOpenDialog({properties:['openFile'],filters:[{name:'Imágenes',extensions:['png','jpg','jpeg','webp']}]});
  if(r.canceled||!r.filePaths[0])return{ok:false};
  const src=r.filePaths[0],ext=path.extname(src)||'.png',dest=path.join(dataDir,`fallback${ext}`);
  fs.copyFileSync(src,dest);const s=settingsStore.load();s.visual.fallbackImage=dest;settingsStore.save(s);
  return{ok:true,path:dest,url:pathToFileURL(dest).href};
});

async function pickOutputAsset(kind){
  const isMusic=kind==='music';
  const r=await dialog.showOpenDialog({properties:['openFile'],filters:isMusic?[{name:'Música MP3',extensions:['mp3']}]:[{name:'Imagen vertical',extensions:['png','jpg','jpeg','webp']}]});
  if(r.canceled||!r.filePaths[0])return{ok:false};
  const src=r.filePaths[0],ext=path.extname(src)||(isMusic?'.mp3':'.png');
  const dir=path.join(dataDir,'assets');fs.mkdirSync(dir,{recursive:true});
  const dest=path.join(dir,isMusic?`background-music${ext}`:`vertical-video-background${ext}`);
  fs.copyFileSync(src,dest);
  const s=settingsStore.load();
  if(isMusic)s.visual.output.musicFile=dest;else s.visual.output.verticalVideoBackground=dest;
  settingsStore.save(s);sendDesignLive();
  return{ok:true,path:dest,url:pathToFileURL(dest).href,design:currentDesign()};
}
function clearOutputAsset(kind){
  const s=settingsStore.load();const isMusic=kind==='music';
  const old=isMusic?s.visual.output.musicFile:s.visual.output.verticalVideoBackground;
  if(isMusic)s.visual.output.musicFile='';else s.visual.output.verticalVideoBackground='';
  settingsStore.save(s);
  try{if(old&&old.startsWith(path.join(dataDir,'assets'))&&fs.existsSync(old))fs.unlinkSync(old);}catch{}
  sendDesignLive();return{ok:true,design:currentDesign()};
}
ipcMain.handle('output:pickVerticalBackground',()=>pickOutputAsset('background'));
ipcMain.handle('output:clearVerticalBackground',()=>clearOutputAsset('background'));
ipcMain.handle('output:pickMusic',()=>pickOutputAsset('music'));
ipcMain.handle('output:clearMusic',()=>clearOutputAsset('music'));

ipcMain.handle('canned:pickFolder',async()=>{
  const r=await dialog.showOpenDialog({properties:['openDirectory']});
  if(r.canceled||!r.filePaths[0])return{ok:false};
  const s=settingsStore.load();s.canned.folder=r.filePaths[0];settingsStore.save(s);canned.reset();
  return{ok:true,...canned.list(s.canned.folder)};
});
ipcMain.handle('canned:list',()=>canned.list(settingsStore.load().canned?.folder||''));
ipcMain.handle('canned:launchNow',()=>automation.requestCannedNow());

ipcMain.handle('output:open',()=>{createOutputWindow();return{ok:true,state:{...outputState}};});
ipcMain.handle('output:close',async()=>{
  if(!outputReady())return{ok:true,alreadyClosed:true,state:{...outputState}};
  const a=automation.getState();
  if(a.emission.running){
    const r=await dialog.showMessageBox(controlWindow,{type:'warning',buttons:['Cancelar','Cerrar Output'],defaultId:0,cancelId:0,title:'Cerrar Output',message:'La emisión automática está activa.',detail:'Cerrar Output pausará la emisión, pero el procesamiento y el buffer seguirán funcionando.'});
    if(r.response!==1)return{ok:false,cancelled:true,state:{...outputState}};
  }
  outputWindow.close();
  return{ok:true,state:{...outputState}};
});
ipcMain.handle('output:status',()=>({...outputState}));
ipcMain.handle('output:manualSend',async(_,p)=>{
  const a=automation.getState();
  if(a.emission.running){
    const r=await dialog.showMessageBox(controlWindow,{type:'warning',buttons:['Cancelar','Emitir noticia manual'],defaultId:0,cancelId:0,title:'Emisión automática activa',message:'La emisión automática está activa.',detail:'Si continúas, la emisión automática se pausará y esta noticia manual tomará el Output. Luego podrás reanudarla.'});
    if(r.response!==1)return{ok:false,cancelled:true};
    automation.interruptForManual();
  }
  const ok=deliverToOutput({...p,kind:'news'},'editor',true);
  return{ok,source:'editor'};
});
ipcMain.on('output:control',(_,action)=>controlOutput(action));
ipcMain.on('output:playback',(_,event)=>{automation.outputPlayback(event);if(event?.source==='editor'&&event?.type==='ended')setOutputState({source:'editor'});});
ipcMain.on('output:designPreview',(_,design)=>{
  if(!outputReady())return;
  const merged=enrichDesign({...settingsStore.load().visual.output,...design});
  outputWindow.webContents.send('output:design',merged);
  if(design?.format&&design.format!==outputState.format)applyOutputWindowFormat(design.format,true);
});

ipcMain.handle('automation:status',()=>automation.getState());
ipcMain.handle('automation:processingStart',()=>automation.startProcessing());
ipcMain.handle('automation:processingPause',()=>automation.pauseProcessing());
ipcMain.handle('automation:processingResume',()=>automation.resumeProcessing());
ipcMain.handle('automation:processingStop',()=>automation.stopProcessing());
ipcMain.handle('automation:emissionStart',()=>automation.startEmission());
ipcMain.handle('automation:emissionPause',()=>automation.pauseEmission());
ipcMain.handle('automation:emissionResume',()=>automation.resumeEmission());
ipcMain.handle('automation:emissionStop',()=>automation.stopEmission());
ipcMain.handle('automation:clearQueue',()=>automation.clearQueue());
ipcMain.handle('automation:resetCounters',()=>automation.resetSessionCounters());
ipcMain.handle('history:reset',()=>{history.reset();return{ok:true};});
ipcMain.on('notify',(_,p)=>notify(p.title||'EC Automatic News',p.body||''));
