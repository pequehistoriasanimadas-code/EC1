const { app, BrowserWindow, ipcMain, dialog, Notification } = require('electron');
app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const rss = require('./services/rss');
const { fetchArticle } = require('./services/article');
const { SettingsStore } = require('./services/settings');
const { LocalRuntime } = require('./services/localRuntime');
const { KokoroTTS } = require('./services/kokoro');
const { Providers } = require('./services/providers');
const { HistoryStore } = require('./services/history');
const { AutomationEngine } = require('./services/automation');

let controlWindow;
let outputWindow;
let settingsStore;
let localRuntime;
let kokoro;
let providers;
let history;
let automation;
let dataDir;
let resourcesDir;

function portableDataDir() {
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
  if (portableDir) return path.join(portableDir, 'EC Automatic News Data');
  return path.join(app.getPath('userData'), 'EC Automatic News Data');
}

function sendControl(channel, payload) {
  if (controlWindow && !controlWindow.isDestroyed()) controlWindow.webContents.send(channel, payload);
}
function sendOutput(payload) {
  createOutputWindow();
  if (outputWindow && !outputWindow.isDestroyed()) outputWindow.webContents.send('output:story', payload);
}
function notify(title, body) {
  if (Notification.isSupported()) new Notification({title,body}).show();
}
function fallbackUrl() {
  const s=settingsStore.load();
  return s.visual.fallbackImage && fs.existsSync(s.visual.fallbackImage) ? pathToFileURL(s.visual.fallbackImage).href : '';
}

function createControlWindow() {
  controlWindow = new BrowserWindow({
    width: 1500, height: 940, minWidth: 1100, minHeight: 720,
    title: 'EC Automatic News', backgroundColor:'#0f0f0f',
    webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false}
  });
  controlWindow.loadFile(path.join(__dirname,'control.html'));
}
function createOutputWindow() {
  if (outputWindow && !outputWindow.isDestroyed()) return outputWindow;
  outputWindow = new BrowserWindow({
    width:1280,height:720,minWidth:960,minHeight:540,title:'EC Automatic News — OUTPUT',
    backgroundColor:'#000000',autoHideMenuBar:true,
    webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false}
  });
  outputWindow.loadFile(path.join(__dirname,'output.html'));
  outputWindow.on('closed',()=>outputWindow=null);
  return outputWindow;
}

function initServices() {
  dataDir = portableDataDir();
  fs.mkdirSync(dataDir,{recursive:true});
  resourcesDir = app.isPackaged ? process.resourcesPath : path.join(__dirname,'..');
  settingsStore = new SettingsStore(dataDir);
  history = new HistoryStore(dataDir);
  localRuntime = new LocalRuntime({resourcesDir,dataDir,onEvent:e=>sendControl('local:event',e)});
  kokoro = new KokoroTTS({resourcesDir,dataDir});
  providers = new Providers({settingsStore,localRuntime});
  automation = new AutomationEngine({
    rss,fetchArticle,providers,kokoro,history,
    getSettings:()=>settingsStore.load(),
    getFallbackUrl:fallbackUrl,
    sendOutput
  });
  automation.on('state',s=>sendControl('automation:state',s));
  automation.on('error-item',e=>sendControl('automation:itemError',e));
  automation.on('engine-error',e=>sendControl('automation:engineError',{message:e.message}));
}

app.whenReady().then(()=>{
  initServices();
  createControlWindow();
});
app.on('window-all-closed',()=>{ localRuntime?.stop(); if(process.platform!=='darwin') app.quit(); });
app.on('before-quit',()=>localRuntime?.stop());

ipcMain.handle('settings:get',()=>{
  const s=settingsStore.load();
  return {...s,visual:{...s.visual,fallbackImageUrl:fallbackUrl()},ai:{...s.ai,claudeKey:'',geminiKey:'',hasClaudeKey:!!s.ai.claudeKeyEnc,hasGeminiKey:!!s.ai.geminiKeyEnc}};
});
ipcMain.handle('settings:save',(_,incoming)=>{
  const current=settingsStore.load();
  const next={...current,...incoming,ai:{...current.ai,...incoming.ai},tts:{...current.tts,...incoming.tts},visual:{...current.visual,...incoming.visual},automation:{...current.automation,...incoming.automation}};
  if(incoming.ai?.claudeKey) next.ai.claudeKeyEnc=settingsStore.encryptSecret(incoming.ai.claudeKey);
  if(incoming.ai?.geminiKey) next.ai.geminiKeyEnc=settingsStore.encryptSecret(incoming.ai.geminiKey);
  delete next.ai.claudeKey; delete next.ai.geminiKey;
  settingsStore.save(next); return {ok:true};
});

ipcMain.handle('rss:load',async()=>rss.loadAll(settingsStore.load().rssFeeds));
ipcMain.handle('rss:test',async(_,feed)=>{const items=await rss.fetchFeed(feed);return{ok:true,count:items.length};});
ipcMain.handle('article:fetch',(_,url)=>fetchArticle(url));

ipcMain.handle('providers:test',async(_,provider)=>providers.test(provider,settingsStore.load()));
ipcMain.handle('providers:generate',async(_,story,article)=>providers.generate(story,article,settingsStore.load()));
ipcMain.handle('local:status',()=>localRuntime.status());
ipcMain.handle('local:downloadModel',()=>localRuntime.downloadModel());
ipcMain.handle('local:start',async()=>{await localRuntime.start();return localRuntime.status();});
ipcMain.handle('local:stop',()=>{localRuntime.stop();return{ok:true};});

ipcMain.handle('tts:status',async()=>({ready:kokoro.ready(),voices:kokoro.ready()?await kokoro.listVoices():[]}));
ipcMain.handle('tts:generate',(_,text)=>kokoro.generate(text,{voice:settingsStore.load().tts.voice,speed:settingsStore.load().tts.speed}));

ipcMain.handle('fallback:pick',async()=>{
  const r=await dialog.showOpenDialog({properties:['openFile'],filters:[{name:'Imágenes',extensions:['png','jpg','jpeg','webp']}]});
  if(r.canceled||!r.filePaths[0])return{ok:false};
  const src=r.filePaths[0], ext=path.extname(src)||'.png';
  const dest=path.join(dataDir,`fallback${ext}`); fs.copyFileSync(src,dest);
  const s=settingsStore.load(); s.visual.fallbackImage=dest; settingsStore.save(s);
  return{ok:true,path:dest,url:pathToFileURL(dest).href};
});

ipcMain.handle('output:open',()=>{createOutputWindow();return{ok:true};});
ipcMain.on('output:story',(_,p)=>sendOutput(p));
ipcMain.on('output:control',(_,action)=>{if(outputWindow&&!outputWindow.isDestroyed())outputWindow.webContents.send('output:control',action);});
ipcMain.on('output:ended',()=>automation.outputEnded());

ipcMain.handle('automation:start',()=>{automation.start();return{ok:true};});
ipcMain.handle('automation:pause',()=>{automation.pause();return{ok:true};});
ipcMain.handle('automation:resume',()=>{automation.resume();return{ok:true};});
ipcMain.handle('automation:stop',()=>{automation.stop();return{ok:true};});
ipcMain.handle('history:reset',()=>{history.reset();return{ok:true};});

ipcMain.on('notify',(_,p)=>notify(p.title||'EC Automatic News',p.body||''));
