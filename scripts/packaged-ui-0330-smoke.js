'use strict';
const fs=require('fs');
const path=require('path');
const {app,BrowserWindow,ipcMain}=require('electron');

app.commandLine.appendSwitch('disable-gpu');
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS='true';

const resourcesDir=path.resolve(process.argv[2]||path.join('dist','win-unpacked','resources'));
const appRoot=path.join(resourcesDir,'app.asar');
const preload=path.join(appRoot,'src','preload.js');
const control=path.join(appRoot,'src','control.html');
const assert=(v,m)=>{if(!v)throw new Error(m);};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let profileMode='empty',automationMode='normal';

const fingerprint=JSON.stringify({logical:24,gpu:'Smoke GPU',vram:8192,driver:'1.0'});
const settings={
  rssFeeds:[],
  ai:{primary:'local',backup1:'none',backup2:'none',localResourceMode:'tuned',localAutoTuned:true,localTunedConfig:{gpuLayers:48,threads:6},lastLocalBenchmark:{tokensPerSec:100}},
  tts:{voice:'ef_dora',speed:1,resourceMode:'performance',performanceThreads:8,pronunciationClaudeVerify:true,pronunciationMaxSeconds:15},
  optimization0321:{version:'0.3.21',at:'2026-09-01T10:00:00Z',fingerprint,hardwareLabel:'24 hilos CPU · Smoke GPU · 8.0 GB VRAM',summary:'Smoke tuning global'},
  visual:{pauseSeconds:2.5,fallbackImage:'',queueColors:{rss:'#2E7D32',generated:'#2563EB',content:'#D97706',ad:'#7C3AED',exclusive:'#D4A514',error:'#B91C1C'},output:{format:'16:9',fontFamily:'Arial',dateFontFamily:'Arial',titleColor:'#FFFFFF',summaryColor:'#F3F3F3',dateColor:'#F3F3F3',categoryBgColor:'#F7C600',categoryTextColor:'#000000',lowerBgColor:'#000000',lowerOpacity:.88,animation:'auto',motionSpeed:'normal',transitionEnabled:true,transitionType:'fade',transitionDuration:.7}},
  canned:{enabled:true,folder:'C:\\Smoke\\Contenidos',adsFolder:'C:\\Smoke\\Anuncios',insertAdAfterContent:true,emergency:true,interval:10},
  documents:{folder:'',watch:false,targetSeconds:60,categoryMode:'auto',batchDate:'',priority:'normal',processed:{}},
  automation:{bufferReady:15,queueMax:30,maxAgeHours:6,avoidRepeats:true,exclusiveEveryNews:4}
};

function bind(channel,fn){try{ipcMain.removeHandler(channel);}catch{}ipcMain.handle(channel,fn);}
function noop(){return{ok:true};}
function normalAutomation(){return{processing:{running:false,paused:false,message:'Smoke 0.3.30'},emission:{running:false,paused:false,currentTitle:'',currentKind:'none'},counts:{processing:0,ready:1,pending:0,onAir:0,emitted:0,error:0},buffer:{target:15,autonomyMin:.8,health:'critical'},queue:[{id:'r1',title:'Noticia exclusiva lista',status:'LISTA',sourceType:'rss',queueGroup:'effective',displayPosition:1,isExclusive:true,accessStatus:'SUBSCRIBER_ONLY'},{id:'p1',title:'Noticia preparando',status:'PROCESANDO',sourceType:'rss',stage:'ai',queueGroup:'preparing',displayPosition:0}],session:{newsEmitted:0,cannedEmitted:0,adsEmitted:0},canned:{enabled:true},ads:{enabled:true},documents:{pending:0,processing:false}};}
function contentAutomation(){return{processing:{running:false,paused:false,message:'Smoke 0.3.30'},emission:{running:true,paused:false,currentTitle:'Contenido smoke',currentKind:'canned'},counts:{processing:0,ready:1,pending:0,onAir:0,emitted:0,error:0},buffer:{target:15,autonomyMin:.8,health:'critical'},queue:[{title:'Contenido smoke.mp4',status:'AL AIRE',sourceType:'content',queueGroup:'effective',displayPosition:1},{title:'Publicidad smoke.mp4',status:'PROGRAMADO',sourceType:'ad',planned:true,planText:'Después del contenido',queueGroup:'effective',displayPosition:2},{id:'r2',title:'Noticia después del anuncio',status:'LISTA',sourceType:'rss',queueGroup:'effective',displayPosition:3}],session:{newsEmitted:10,cannedEmitted:0,adsEmitted:0},canned:{enabled:true},ads:{enabled:true},documents:{pending:0,processing:false}};}
function registerIpc(){
  bind('settings:get',()=>JSON.parse(JSON.stringify(settings)));
  bind('settings:save',()=>({ok:true}));
  bind('optimization:migrateGlobal',()=>({ok:true,matched:true,changed:false,source:'global',optimization:settings.optimization0321}));
  bind('ui:focusControl',()=>({ok:true}));
  bind('rss:load',()=>({items:[],feedStatus:[],errors:[]}));bind('rss:test',()=>({ok:true,count:1,sourceType:'RSS'}));bind('article:fetch',()=>({title:'Smoke',description:'',body:'',image:''}));
  bind('local:status',()=>({runtime:true,model:true,running:false,downloading:false,profile:{label:'Tuned',logicalCpus:24,ctx:4096,gpuLayers:48,threads:6}}));
  bind('tts:status',()=>({ready:true,persistent:true,workerRunning:false,voices:['ef_dora'],threads:8,profile:'performance',profileLabel:'Optimizada'}));
  bind('tts:gpuStatus',()=>({available:true,installed:true,device:{name:'Smoke GPU',vramMb:8192,driver:'1.0'}}));
  bind('pronunciation:status',()=>({runtime:true,model:false,running:false,learningEntries:0,cacheEntries:0,claudeVerifyEnabled:true,maxSeconds:15,migrationInfo:{found:0,manualProtected:0,removed:0,backup:false}}));
  bind('canned:list',()=>({ok:true,count:1,files:[{name:'Contenido smoke.mp4',sizeMB:1}],folder:settings.canned.folder}));bind('canned:listAds',()=>({ok:true,count:1,files:[{name:'Publicidad smoke.mp4',sizeMB:1}],folder:settings.canned.adsFolder}));
  bind('documents:list',()=>({ok:false,count:0,files:[],folder:'',message:'Sin carpeta seleccionada.'}));
  bind('automation:status',()=>automationMode==='content'?contentAutomation():normalAutomation());
  bind('output:status',()=>({open:false,source:'none',kind:'none',title:'',format:'16:9',resolution:'1920×1080'}));
  bind('fonts:list',()=>({installed:['Arial','Segoe UI'],custom:[]}));bind('fonts:refresh',()=>({installed:['Arial','Segoe UI'],custom:[]}));bind('normalizer:status',()=>({ok:true,installed:true}));bind('voices:list',()=>({items:[],builtIn:['ef_dora']}));
  bind('profiles:status',()=>profileMode==='empty'?{schemaVersion:1,activeProfileId:'',active:null,profiles:[],hasProfiles:false,colors:['#F7C600','#22C55E','#EF4444'],maxProfiles:30,profileCount:0,canCreate:true}:{schemaVersion:1,activeProfileId:'11111111-1111-4111-8111-111111111111',active:{id:'11111111-1111-4111-8111-111111111111',name:'El Comercio',color:'#F7C600'},profiles:[{id:'11111111-1111-4111-8111-111111111111',name:'El Comercio',color:'#F7C600',active:true},{id:'22222222-2222-4222-8222-222222222222',name:'Depor',color:'#22C55E',active:false}],hasProfiles:true,colors:['#F7C600','#22C55E','#EF4444'],maxProfiles:30,profileCount:2,canCreate:true});
  bind('profiles:health',()=>({ok:true,checks:[]}));
  const generic=['providers:test','providers:generate','local:downloadModel','local:start','local:stop','local:benchmark','pronunciation:downloadModel','pronunciation:stop','pronunciation:test','pronunciation:exportLearning','pronunciation:importLearning','pronunciation:clearLearning','normalizer:import','normalizer:restore','normalizer:checkUpdate','normalizer:update','tts:generate','tts:benchmark','tts:gpuInstall','tts:gpuBenchmark','tts:gpuUseCpu','voices:import','voices:rename','voices:delete','voices:export','fonts:import','fonts:delete','documents:pickFolder','documents:enqueue','documents:resetProcessed','fallback:pick','output:pickVerticalBackground','output:clearVerticalBackground','output:pickMusic','output:clearMusic','canned:pickFolder','canned:pickAdsFolder','canned:launchNow','output:open','output:close','output:manualSend','automation:processingStart','automation:processingPause','automation:processingResume','automation:processingStop','automation:emissionStart','automation:emissionPause','automation:emissionResume','automation:emissionStop','automation:emissionNext','automation:clearQueue','automation:resetCounters','history:reset','profiles:create','profiles:update','profiles:duplicate','profiles:delete','profiles:switch','profiles:restartInto','profiles:exportOne','profiles:exportAll','profiles:import'];
  for(const ch of generic)bind(ch,noop);
  ipcMain.removeAllListeners('notify');ipcMain.on('notify',()=>{});ipcMain.removeAllListeners('output:control');ipcMain.on('output:control',()=>{});ipcMain.removeAllListeners('output:designPreview');ipcMain.on('output:designPreview',()=>{});ipcMain.removeAllListeners('output:playback');ipcMain.on('output:playback',()=>{});
}
async function js(win,expression,timeout=1800){return Promise.race([win.webContents.executeJavaScript(expression,true),wait(timeout).then(()=>{throw new Error(`executeJavaScript timeout: ${String(expression).slice(0,100)}`);})]);}
async function until(win,expression,timeout=9000){const end=Date.now()+timeout;let last;while(Date.now()<end){try{last=await js(win,expression);if(last)return last;}catch{}await wait(100);}throw new Error(`UI timeout: ${expression} · last=${String(last)}`);}
async function makeWindow(width=1280){const win=new BrowserWindow({show:false,width,height:820,webPreferences:{preload,contextIsolation:true,nodeIntegration:false,sandbox:true}});await win.loadFile(control,{query:{selftest:'0330'}});return win;}

app.whenReady().then(async()=>{let win=null;try{
  for(const rel of ['src/bootstrap-0330.js','src/renderer-0330.js','src/control-0330.css','src/services/editorial0330.js','src/services/release0330.js','src/services/release0330Final.js','src/services/release0330SwitchFinal.js','scripts/check-0330.js','scripts/packaged-ui-0330-smoke.js'])assert(fs.existsSync(path.join(appRoot,rel)),`Falta en app.asar: ${rel}`);
  const pkg=JSON.parse(fs.readFileSync(path.join(appRoot,'package.json'),'utf8'));assert(pkg.version==='0.3.30','Versión empaquetada no es 0.3.30');assert(pkg.main==='src/bootstrap-0330.js','Bootstrap 0.3.30 no es entry point');
  const css=fs.readFileSync(path.join(appRoot,'src','control-0330.css'),'utf8');assert(css.includes('container-type:inline-size')&&css.includes('@container (max-width: 720px)'),'Responsive tipográfico 0.3.30 no quedó empaquetado');assert(css.includes('@container (max-width: 900px)')&&css.includes('.ec25-opacity-control input[type=range]'),'Responsive de Fondos y casillas 0.3.30 no quedó empaquetado');assert(css.includes('.ec0330-custom-interval'),'UX de intervalo personalizado no quedó empaquetada');
  registerIpc();

  profileMode='empty';win=await makeWindow();await until(win,"document.body.innerText.includes('Bienvenido a GEC Automatic News')");
  await js(win,"document.querySelector('#ec29CreateFirst')?.click(); true;");await until(win,"!!document.querySelector('#ec29ProfileInput')");await js(win,"document.querySelector('#ec29Cancel')?.click(); true;");await until(win,"document.body.innerText.includes('Bienvenido a GEC Automatic News')");assert(await js(win,"!!document.querySelector('#ec29CreateFirst')"),'Cancelar el primer perfil no restauró onboarding');win.destroy();win=null;

  profileMode='profiles';automationMode='normal';win=await makeWindow();await until(win,"!!document.querySelector('#ec29ProfileButton')");await until(win,"window.__ec0330Installed===true");
  await js(win,"document.querySelector('[data-tab=settings]')?.click(); true;");await until(win,"!!document.querySelector('#ecOptimizeState0321')");await wait(350);const badge=await js(win,"document.querySelector('#ecOptimizeState0321')?.textContent||''");assert(/OPTIMIZADA/.test(badge),'La optimización global no se refleja como OPTIMIZADA en un perfil existente');
  await js(win,"document.querySelector('[data-tab=auto]')?.click(); true;");await wait(500);const queue=await js(win,"({ready:[...document.querySelectorAll('#queue .queue-index')].map(x=>x.textContent.trim()),divider:!!document.querySelector('.ec0330-preparing-divider'),exclusive:[...document.querySelectorAll('#queue .queue-exclusive')].map(x=>x.textContent.trim()),overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth})");assert(queue.ready.includes('1.'),'La cola efectiva no usa numeración 1..N');assert(queue.divider,'No aparece separación En preparación');assert(queue.exclusive.includes('EXCLUSIVO'),'La cola efectiva perdió la etiqueta EXCLUSIVO');
  automationMode='content';await js(win,"window.ECAPI.automationStatus().then(s=>refreshAutomation(s)); true;");await wait(250);const adVisible=await js(win,"(()=>{const t=document.querySelector('#queue')?.innerText||'';return t.includes('Publicidad smoke.mp4')&&t.includes('Después del contenido');})()");assert(adVisible,'La publicidad programada desaparece mientras el contenido está AL AIRE');
  automationMode='normal';await js(win,"window.ECAPI.automationStatus().then(s=>refreshAutomation(s)); true;");await wait(180);
  await js(win,"document.querySelector('[data-tab=canned]')?.click();const s=document.querySelector('#cannedInterval');s.value='custom';s.dispatchEvent(new Event('change',{bubbles:true}));true;");await wait(250);const custom=await js(win,"(()=>{const r=document.querySelector('#cannedCustomRow'),i=document.querySelector('#cannedCustomInterval');return{visible:r&&!r.classList.contains('hidden'),text:r?.innerText||'',input:!!i,cls:r?.classList.contains('ec0330-custom-interval')};})()");assert(custom.visible&&custom.input&&custom.cls&&custom.text.includes('Emitir contenido cada')&&custom.text.includes('noticias'),'Personalizado no muestra de forma clara la cantidad de noticias');
  await js(win,"document.querySelector('[data-tab=emission]')?.click(); true;");await until(win,"document.querySelectorAll('#ec0325DesignEditor .ec25-bg-row').length===3");await wait(300);const designOverflow=await js(win,"(()=>{const block=[...document.querySelectorAll('#ec0325DesignEditor .ec25-design-block')].find(x=>x.innerText.includes('Fondos y casillas'));if(!block)return{missing:true};const br=block.getBoundingClientRect(),rows=[...block.querySelectorAll('.ec25-bg-row')];return{missing:false,rows:rows.length,overflow:rows.some(r=>{const rr=r.getBoundingClientRect(),op=r.querySelector('.ec25-opacity-control')?.getBoundingClientRect();return rr.right>br.right+1||r.scrollWidth>r.clientWidth+1||(op&&op.right>br.right+1);})};})()");assert(!designOverflow.missing&&designOverflow.rows===3,'No se renderizaron las tres filas de Fondos y casillas');assert(!designOverflow.overflow,'Fondos y casillas se desborda horizontalmente en el editor de emisión');
  win.setSize(900,760);await wait(300);const compactDesignOverflow=await js(win,"(()=>{const block=[...document.querySelectorAll('#ec0325DesignEditor .ec25-design-block')].find(x=>x.innerText.includes('Fondos y casillas'));if(!block)return true;const br=block.getBoundingClientRect();return[...block.querySelectorAll('.ec25-bg-row')].some(r=>{const rr=r.getBoundingClientRect(),op=r.querySelector('.ec25-opacity-control')?.getBoundingClientRect();return rr.right>br.right+1||r.scrollWidth>r.clientWidth+1||(op&&op.right>br.right+1);});})()");assert(!compactDesignOverflow,'Fondos y casillas se desborda al estrechar la ventana');
  await js(win,"document.querySelector('[data-tab=auto]')?.click(); true;");await wait(200);const horizontal=await js(win,"document.documentElement.scrollWidth>document.documentElement.clientWidth");assert(!horizontal,'La UI 0.3.30 genera scroll horizontal a ancho intermedio');
  win.destroy();console.log('PACKAGED REAL UI 0.3.30 OK · onboarding · tuning global · exclusiva visible · anuncio persistente · personalizado claro · cola efectiva · Fondos responsive · responsive general');app.exit(0);
}catch(e){console.error(e.stack||e);try{win?.destroy();}catch{}app.exit(1);}});
