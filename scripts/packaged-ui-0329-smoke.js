'use strict';
const path=require('path');
const {app,BrowserWindow,ipcMain}=require('electron');

app.commandLine.appendSwitch('disable-gpu');
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS='true';

const resourcesDir=path.resolve(process.argv[2]||path.join('dist','win-unpacked','resources'));
const appRoot=path.join(resourcesDir,'app.asar');
const preload=path.join(appRoot,'src','preload.js');
const control=path.join(appRoot,'src','control.html');
const assert=(value,message)=>{if(!value)throw new Error(message);};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const stage=name=>console.log(`UI-SMOKE · ${name}`);
let profileMode='empty';

const settings={
  rssFeeds:[],rssPartialClose:{enabled:true,template:'Para más información, visita {web}.'},exclusiveClose:{enabled:true,template:'Este contenido es exclusivo de {medio}. Para leer la nota, visita {web}.'},
  ai:{primary:'local',backup1:'none',backup2:'none',claudeModel:'claude-haiku-4-5-20251001',geminiModel:'',localBackupMode:'on_demand',localIdleMinutes:5,hasClaudeKey:false,hasGeminiKey:false,editorialPrompt:'',editorialInstructions:''},
  tts:{voice:'ef_dora',speed:1,resourceMode:'safe_streaming',pronunciationClaudeVerify:true,pronunciationMaxSeconds:15},
  visual:{pauseSeconds:2.5,fallbackImage:'',fallbackImageUrl:'',queueColors:{rss:'#2E7D32',generated:'#2563EB',content:'#D97706',ad:'#7C3AED',exclusive:'#D4A514',error:'#B91C1C'},output:{format:'16:9',fontFamily:'Arial',dateFontFamily:'Arial',titleColor:'#FFFFFF',summaryColor:'#F3F3F3',dateColor:'#F3F3F3',categoryBgColor:'#F7C600',categoryTextColor:'#000000',lowerBgColor:'#000000',lowerOpacity:.88,animation:'auto',motionSpeed:'normal',tiktokSafe:true,showSafeGuides:true,musicEnabled:false,musicLoop:true,musicVolume:20,voiceVolume:100,cannedVolume:100,transitionEnabled:true,transitionType:'fade',transitionDuration:.7}},
  canned:{enabled:false,folder:'',adsFolder:'',insertAdAfterContent:true,emergency:true,interval:10},
  documents:{folder:'',watch:false,targetSeconds:60,categoryMode:'auto',batchDate:'',priority:'normal',processed:{}},
  automation:{bufferReady:15,queueMax:30,maxAgeHours:6,avoidRepeats:true,generatedEveryRss:5,targetAutonomyMin:15,exclusiveEveryNews:4}
};

function bind(channel,fn){try{ipcMain.removeHandler(channel);}catch{}ipcMain.handle(channel,fn);}
function noop(){return{ok:true};}
function registerIpc(){
  stage('registrando IPC');
  bind('settings:get',()=>JSON.parse(JSON.stringify(settings)));
  bind('settings:save',()=>({ok:true,hasClaudeKey:false,hasGeminiKey:false,claudeModel:'claude-haiku-4-5-20251001'}));
  bind('rss:load',()=>({items:[],feedStatus:[],errors:[]}));bind('rss:test',()=>({ok:true,count:1,sourceType:'RSS'}));bind('article:fetch',()=>({title:'Smoke',description:'',body:'',image:''}));
  bind('local:status',()=>({runtime:true,model:false,running:false,downloading:false,profile:{label:'Smoke',ctx:0,gpuLayers:0,threads:2}}));
  bind('tts:status',()=>({ready:true,persistent:true,workerRunning:false,voices:['ef_dora'],threads:4,profile:'safe_streaming',profileLabel:'Seguro para transmisión'}));
  bind('pronunciation:status',()=>({runtime:true,model:false,running:false,learningEntries:0,cacheEntries:0,claudeVerifyEnabled:true,maxSeconds:15,migrationInfo:{found:0,manualProtected:0,removed:0,backup:false}}));
  bind('canned:list',()=>({ok:false,count:0,files:[],folder:'',message:'Sin carpeta seleccionada.'}));bind('canned:listAds',()=>({ok:false,count:0,files:[],folder:'',message:'Sin carpeta seleccionada.'}));
  bind('documents:list',()=>({ok:false,count:0,files:[],folder:'',message:'Sin carpeta seleccionada.'}));
  bind('automation:status',()=>({processing:{running:false,paused:false,message:'Smoke test: preparación detenida.'},emission:{running:false,paused:false,currentTitle:'',currentKind:'none'},counts:{processing:0,ready:0,pending:0,onAir:0,emitted:0,error:0,total:0},buffer:{target:15,autonomyMin:0,health:'critical'},canned:{enabled:false,available:0,nextIn:0,due:false},ads:{enabled:false,available:0},documents:{pending:0,processing:false},queue:[],session:{newsEmitted:0,cannedEmitted:0,adsEmitted:0}}));
  bind('output:status',()=>({open:false,source:'none',kind:'none',title:'',format:'16:9',resolution:'1920×1080'}));
  bind('fonts:list',()=>({installed:['Arial','Segoe UI'],custom:[]}));bind('fonts:refresh',()=>({installed:['Arial','Segoe UI'],custom:[]}));
  bind('normalizer:status',()=>({ok:true,installed:true}));bind('tts:gpuStatus',()=>({available:false,installed:false}));bind('voices:list',()=>({items:[],builtIn:['ef_dora']}));
  bind('ui:focusControl',()=>({ok:true}));
  bind('profiles:status',()=>profileMode==='empty'?{schemaVersion:1,activeProfileId:'',active:null,profiles:[],hasProfiles:false,colors:['#F7C600','#22C55E','#EF4444'],maxProfiles:30,profileCount:0,canCreate:true}:{schemaVersion:1,activeProfileId:'11111111-1111-4111-8111-111111111111',active:{id:'11111111-1111-4111-8111-111111111111',name:'El Comercio',color:'#F7C600'},profiles:[{id:'11111111-1111-4111-8111-111111111111',name:'El Comercio',color:'#F7C600',active:true},{id:'22222222-2222-4222-8222-222222222222',name:'Depor',color:'#22C55E',active:false},{id:'33333333-3333-4333-8333-333333333333',name:'Correo',color:'#EF4444',active:false}],hasProfiles:true,colors:['#F7C600','#22C55E','#EF4444'],maxProfiles:30,profileCount:3,canCreate:true});
  bind('profiles:health',()=>({ok:true,checks:[]}));
  const generic=[
    'providers:test','providers:generate','local:downloadModel','local:start','local:stop','local:benchmark',
    'pronunciation:downloadModel','pronunciation:stop','pronunciation:test','pronunciation:exportLearning','pronunciation:importLearning','pronunciation:clearLearning',
    'normalizer:import','normalizer:restore','normalizer:checkUpdate','normalizer:update',
    'tts:generate','tts:benchmark','tts:gpuInstall','tts:gpuBenchmark','tts:gpuUseCpu',
    'voices:import','voices:rename','voices:delete','voices:export','fonts:import','fonts:delete',
    'documents:pickFolder','documents:enqueue','documents:resetProcessed','fallback:pick','output:pickVerticalBackground','output:clearVerticalBackground','output:pickMusic','output:clearMusic',
    'canned:pickFolder','canned:pickAdsFolder','canned:launchNow','output:open','output:close','output:manualSend',
    'automation:processingStart','automation:processingPause','automation:processingResume','automation:processingStop','automation:emissionStart','automation:emissionPause','automation:emissionResume','automation:emissionStop','automation:emissionNext','automation:clearQueue','automation:resetCounters','history:reset',
    'profiles:create','profiles:update','profiles:duplicate','profiles:delete','profiles:switch','profiles:restartInto','profiles:exportOne','profiles:exportAll','profiles:import'
  ];
  for(const ch of generic)bind(ch,noop);
  ipcMain.removeAllListeners('notify');ipcMain.on('notify',()=>{});
  ipcMain.removeAllListeners('output:control');ipcMain.on('output:control',()=>{});
  ipcMain.removeAllListeners('output:designPreview');ipcMain.on('output:designPreview',()=>{});
  ipcMain.removeAllListeners('output:playback');ipcMain.on('output:playback',()=>{});
  stage(`IPC listos · ${generic.length+14} canales`);
}

async function js(win,expression,timeout=1800){
  return Promise.race([
    win.webContents.executeJavaScript(expression,true),
    wait(timeout).then(()=>{throw new Error(`executeJavaScript timeout (${timeout} ms): ${String(expression).slice(0,120)}`);})
  ]);
}
async function until(win,expression,timeout=9000){const end=Date.now()+timeout;let last,lastErr='';while(Date.now()<end){try{last=await js(win,expression,1500);if(last)return last;}catch(e){lastErr=e.message||String(e);}await wait(100);}throw new Error(`UI timeout: ${expression} · last=${String(last)}${lastErr?` · ${lastErr}`:''}`);}

async function makeWindow(label){
  stage(`${label} · creando BrowserWindow`);
  const win=new BrowserWindow({show:false,width:1280,height:820,webPreferences:{preload,contextIsolation:true,nodeIntegration:false,sandbox:true}});
  stage(`${label} · BrowserWindow creado`);
  const dialogs=[];
  win.webContents.on('console-message',(_,level,message)=>{if(level>=2)console.log(`UI-CONSOLE[${level}] ${message}`);});
  win.webContents.on('did-fail-load',(_,code,desc,url)=>console.error(`UI-FAIL-LOAD ${code} ${desc} ${url}`));
  win.webContents.on('render-process-gone',(_,details)=>console.error(`UI-RENDER-GONE ${JSON.stringify(details)}`));
  try{
    win.webContents.debugger.attach('1.3');
    await win.webContents.debugger.sendCommand('Page.enable');
    win.webContents.debugger.on('message',async(_,method,params)=>{
      if(method!=='Page.javascriptDialogOpening')return;
      const msg=String(params?.message||'');dialogs.push(msg);console.error(`UI-UNEXPECTED-DIALOG · ${msg}`);
      try{await win.webContents.debugger.sendCommand('Page.handleJavaScriptDialog',{accept:true});}catch{}
    });
  }catch(e){console.warn(`UI-CDP warning · ${e.message||e}`);}
  stage(`${label} · loadFile inicio`);
  await Promise.race([win.loadFile(control,{query:{selftest:'1'}}),wait(15000).then(()=>{throw new Error(`loadFile timeout · ${label} · url=${win.webContents.getURL()||'sin-url'}`);})]);
  stage(`${label} · loadFile completado`);
  win.__unexpectedDialogs=dialogs;
  return win;
}
function assertNoDialogs(win,where){const list=win?.__unexpectedDialogs||[];assert(!list.length,`Diálogo JavaScript inesperado en ${where}: ${list.join(' | ')}`);}

app.whenReady().then(async()=>{
  stage('app ready');registerIpc();let win=null;
  const heartbeat=setInterval(()=>stage('heartbeat'),5000);heartbeat.unref?.();
  try{
    profileMode='empty';win=await makeWindow('primer inicio');
    await until(win,"document.body.innerText.includes('Bienvenido a GEC Automatic News')");stage('onboarding visible');
    await until(win,"typeof window.__ec0329PronunciationMigrationInfo==='string'");stage('pronunciación no bloqueante visible');
    const first=await js(win,`({bridgeError:document.body.classList.contains('bridge-error'),brand:document.body.innerText.includes('EC Automatic News'),create:document.body.innerText.includes('Crear perfil nuevo'),load:document.body.innerText.includes('Cargar perfiles'),profileInstalled:!!window.__ec0329Installed,pronunciationInfo:window.__ec0329PronunciationMigrationInfo||''})`);
    assert(!first.bridgeError,'La UI arrancó en estado bridge-error');assert(first.brand,'La UI principal no se renderizó');assert(first.create&&first.load,'No apareció el onboarding de primer inicio');assert(first.profileInstalled,'renderer-0329 no terminó de instalarse');assert(/Aprendizaje de pronunciación actualizado/i.test(first.pronunciationInfo),'La migración de pronunciación no se publicó como información no bloqueante');assertNoDialogs(win,'primer inicio');
    await js(win,`document.querySelector('#ec29CreateFirst')?.click(); true;`);await until(win,"!!document.querySelector('#ec29ProfileInput')");await until(win,"!!document.querySelector('.ec29-color-warning')");stage('modal crear perfil visible');
    const input=await js(win,`(()=>{const x=document.querySelector('#ec29ProfileInput');x.focus();x.value='Prueba';x.dispatchEvent(new Event('input',{bubbles:true}));return {disabled:x.disabled,focused:document.activeElement===x,value:x.value,preview:document.querySelector('#ec29ProfilePreview')?.textContent||''};})()`);assert(!input.disabled&&input.focused&&input.value==='Prueba','El campo Nombre del perfil no queda enfocable/editable');assert(/PRUEBA/i.test(input.preview),'La vista previa del nombre no responde al input');
    const dark=await js(win,`(()=>{const c=document.querySelector('#ec29CustomColor');c.value='#000000';c.dispatchEvent(new Event('input',{bubbles:true}));return {disabled:document.querySelector('#ec29Save')?.disabled===true,warning:document.querySelector('.ec29-color-warning')?.classList.contains('visible')===true};})()`);assert(dark.disabled&&dark.warning,'Un color demasiado oscuro no bloquea Guardar o no muestra advertencia');
    const bright=await js(win,`(()=>{const c=document.querySelector('#ec29CustomColor');c.value='#F7C600';c.dispatchEvent(new Event('input',{bubbles:true}));return {disabled:document.querySelector('#ec29Save')?.disabled===true,warning:document.querySelector('.ec29-color-warning')?.classList.contains('visible')===true};})()`);assert(!bright.disabled&&!bright.warning,'Un color con buen contraste permanece bloqueado');assertNoDialogs(win,'crear perfil');
    try{win.webContents.debugger.detach();}catch{}win.destroy();win=null;stage('primer inicio OK');

    profileMode='profiles';win=await makeWindow('perfiles existentes');await until(win,"!!document.querySelector('#ec29ProfileButton')");stage('selector montado');
    await js(win,`document.querySelector('#ec29ProfileButton').click(); true;`);await until(win,"!!document.querySelector('.ec29-popover .ec29-active-pill')");
    const selector=await js(win,`({active:document.querySelector('.ec29-popover .ec29-active-pill')?.textContent||'',dots:document.querySelectorAll('.ec29-popover .ec29-option-dot').length,options:document.querySelectorAll('.ec29-popover [data-profile]').length,available:[...document.querySelectorAll('.ec29-popover .ec29-option-copy small')].some(x=>/Perfil disponible/i.test(x.textContent)),hasActivate:[...document.querySelectorAll('.ec29-popover button')].some(x=>/^Activar$/i.test(x.textContent.trim()))})`);
    assert(selector.active==='ACTIVO','El selector no identifica el perfil activo');assert(selector.dots===3&&selector.options===3,'El selector rediseñado no muestra indicadores para los perfiles');assert(selector.available,'El selector no distingue perfiles disponibles');assert(!selector.hasActivate,'El selector conserva una acción Activar redundante');assertNoDialogs(win,'selector de perfiles');
    try{win.webContents.debugger.detach();}catch{}win.destroy();win=null;clearInterval(heartbeat);
    console.log('PACKAGED REAL UI 0.3.29 OK · IPC completo · sin diálogos bloqueantes · onboarding · input enfocable · contraste perfil · selector ACTIVO');app.exit(0);
  }catch(e){clearInterval(heartbeat);console.error(e.stack||e);try{if(win){try{win.webContents.debugger.detach();}catch{}win.destroy();}}catch{}app.exit(1);}
});
