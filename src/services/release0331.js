'use strict';

const fs=require('fs');
const path=require('path');
const {pathToFileURL}=require('url');
const {ipcMain,dialog}=require('electron');
const {AutomationEngine}=require('./automation0325');
const {SettingsStore}=require('./settings');

const clamp=(v,min,max,fallback=min)=>{const n=Number(v);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;};
const keyPath=v=>{try{return path.resolve(String(v||'')).normalize('NFKC').toLocaleLowerCase('es');}catch{return String(v||'').normalize('NFKC').toLocaleLowerCase('es');}};
const isNews=x=>!!x&&['rss','generated'].includes(x.sourceType||'rss');
function isExclusive(x){return!!(x&&(x.isExclusive===true||x.story?.isExclusive===true||x.result?.isExclusive===true||String(x.accessStatus||'').toUpperCase()==='SUBSCRIBER_ONLY'||String(x.result?.accessStatus||'').toUpperCase()==='SUBSCRIBER_ONLY'||String(x.article?.access?.status||'').toUpperCase()==='SUBSCRIBER_ONLY'));}
function mediaExists(media,manager,folder){if(!media?.path)return false;try{const scan=manager?.list?.(folder);return!!scan?.files?.some(x=>keyPath(x.path)===keyPath(media.path));}catch{return false;}}
function mediaByPath(manager,folder,wanted){if(!wanted)return null;try{const scan=manager?.list?.(folder);return scan?.files?.find(x=>keyPath(x.path)===keyPath(wanted))||null;}catch{return null;}}
function mediaByName(manager,folder,name){if(!name)return null;try{const scan=manager?.list?.(folder);return scan?.files?.find(x=>String(x.name||'')===String(name||''))||null;}catch{return null;}}
function safePeek(manager,folder){try{return manager?.peek?.(folder)||null;}catch{return null;}}
function rowFor(item){return{id:item.id||'',title:item.story?.title||item.result?.title||'',status:item.status,sourceType:item.sourceType||'rss',provider:item.provider||'',model:item.model||'',attempts:item.attempts||[],metrics:item.metrics||null,error:item.error||'',stage:item.stage||'',outputRetries:item.outputRetries||0,priority:item.priority||'normal',isExclusive:isExclusive(item),accessStatus:item.result?.accessStatus||item.accessStatus||item.article?.access?.status||'',feedName:String(item.story?.feedName||''),feedId:String(item.story?.feedId||''),category:String(item.result?.category||item.story?.category||''),storyUrl:String(item.story?.link||''),sessionSeq:Number(item.sessionSeq)||0};}

function installSettings0331(){
  const p=SettingsStore.prototype;if(p.__ec0331Settings)return;Object.defineProperty(p,'__ec0331Settings',{value:true});
  const defaults=p.defaults,load=p.load;
  const enrich=s=>{s=s||{};s.visual=s.visual||{};s.visual.output=s.visual.output||{};if(s.visual.output.standbyVideo==null)s.visual.output.standbyVideo='';const f=String(s.visual.output.standbyVideo||'');s.visual.output.standbyVideoUrl=f&&fs.existsSync(f)?pathToFileURL(f).href:'';return s;};
  p.defaults=function(){return enrich(defaults.call(this));};p.load=function(){return enrich(load.call(this));};
}

function strictProjected(engine,s){
  const remaining=(engine.queue||[]).filter(x=>x.status==='LISTA'&&isNews(x)),out=[],blocked=[];const every=clamp(s?.automation?.exclusiveEveryNews,0,20,4);let has=!!engine.exclusiveHasEmitted,since=Math.max(0,Number(engine.newsSinceExclusive)||0);
  while(remaining.length){
    let chosen=null;
    if(!every||every<=1){chosen=remaining[0];}
    else if(!has){chosen=remaining[0];}
    else if(since<every-1){chosen=remaining.find(x=>!isExclusive(x));if(!chosen){blocked.push(...remaining.splice(0));break;}}
    else{chosen=remaining.find(isExclusive)||remaining.find(x=>!isExclusive(x))||remaining[0];}
    remaining.splice(remaining.indexOf(chosen),1);out.push(rowFor(chosen));if(isExclusive(chosen)){has=true;since=0;}else if(has)since++;
  }
  const need=has&&every>1?Math.max(0,(every-1)-since):0;for(const x of blocked)out.push({...rowFor(x),exclusiveBlocked:true,planText:`En espera: faltan ${need} noticia${need===1?'':'s'} no exclusiva${need===1?'':'s'}`});return out;
}

function planKey(engine,reason,contentPath,manualPath){return[reason||'',Number(engine.scheduledNewsTotal)||0,keyPath(contentPath),keyPath(manualPath)].join('|');}
function ensurePlan(engine,s,reasonHint='',plannedContent=null){
  const c=s?.canned||{},folder=String(c.folder||''),adsFolder=String(c.adsFolder||''),manual=engine.__ec0331ManualContent||null,reason=manual?'manual-specific':(reasonHint||'scheduled');
  let content=manual?.path?mediaByPath(engine.canned,folder,manual.path):null;
  if(!content&&plannedContent?.path)content=mediaByPath(engine.canned,folder,plannedContent.path);
  if(!content&&plannedContent?.title)content=mediaByName(engine.canned,folder,plannedContent.title);
  if(!content)content=safePeek(engine.canned,folder);
  if(!content)return null;
  const key=planKey(engine,reason,content.path,manual?.path||'');let plan=engine.__ec0331MediaPlan;
  if(plan?.key===key&&mediaExists(plan.content,engine.canned,folder)){
    if(plan.ad&&!mediaExists(plan.ad,engine.ads,adsFolder))plan.ad=null;
    if(!plan.ad&&c.insertAdAfterContent!==false&&adsFolder)plan.ad=safePeek(engine.ads,adsFolder);
    return plan;
  }
  let ad=null;if(c.insertAdAfterContent!==false&&adsFolder)ad=safePeek(engine.ads,adsFolder);
  plan={key,reason,content:{...content},ad:ad?{...ad}:null,createdAt:Date.now(),manual:!!manual};engine.__ec0331MediaPlan=plan;return plan;
}

function installEngine0331(){
  const p=AutomationEngine.prototype;if(p.__ec0331Engine)return;Object.defineProperty(p,'__ec0331Engine',{value:true});
  const baseChoose=p.chooseReadyItem,baseDisplay=p.displayQueue,basePlay=p.playCanned,baseSkip=p.skipCurrent,baseSnapshot=p.snapshot,baseReset=p.resetSessionCounters;
  p.chooseReadyItem=function(queue=this.queue,s=this.getSettings?.()||{}){
    const ready=(queue||[]).filter(x=>x.status==='LISTA');if(!ready.length)return null;const every=clamp(s?.automation?.exclusiveEveryNews,0,20,4);if(!every||every<=1)return baseChoose.call(this,queue,s);
    if(!this.exclusiveHasEmitted)return ready[0];const since=Math.max(0,Number(this.newsSinceExclusive)||0),normal=ready.find(x=>!isExclusive(x)),exclusive=ready.find(isExclusive);
    if(since<every-1)return normal||null;return exclusive||normal||null;
  };
  p.displayQueue=function(s=this.getSettings?.()||{}){
    let rows=baseDisplay.call(this,s)||[];const projected=strictProjected(this,s),slots=[];rows.forEach((r,i)=>{if(r.status==='LISTA'&&isNews(r))slots.push(i);});for(let i=0;i<slots.length;i++){if(projected[i])rows[slots[i]]={...rows[slots[i]],...projected[i]};}
    const plannedContent=rows.find(x=>x.planned&&x.sourceType==='content');if(plannedContent){const plan=ensurePlan(this,s,plannedContent.planReason||'',plannedContent);if(plan){for(const r of rows){if(r.planned&&r.sourceType==='content'){r.title=plan.content.name;r.mediaPath=plan.content.path;r.manualSpecific=plan.manual;}if(r.planned&&r.sourceType==='ad'&&plan.ad){r.title=plan.ad.name;r.mediaPath=plan.ad.path;r.adLocked=true;}}}}
    const byId=new Map((this.queue||[]).map(x=>[x.id,x]));let pos=0;rows=rows.map(r=>{const item=r.id?byId.get(r.id):null,n={...r};if(item){n.isExclusive=isExclusive(item);n.accessStatus=item.result?.accessStatus||item.accessStatus||item.article?.access?.status||n.accessStatus||'';}if(n.queueGroup!=='preparing'&&!n.history)n.displayPosition=++pos;return n;});return rows;
  };
  p.playCanned=async function(s,reason){
    const plan=ensurePlan(this,s,reason);if(plan?.content?.path){this.canned?.reservePath?.(plan.content.path);this.__ec0328Reservation={reason,folder:String(s?.canned?.folder||''),selected:{...plan.content}};}if(plan?.ad?.path)this.__ec0328AdReservation={path:plan.ad.path,reason,locked:true,name:plan.ad.name};this.__ec0331ActivePlan=plan;const result=await basePlay.call(this,s,reason);
    if(result){this.__ec0331MediaPlan=null;this.__ec0331ManualContent=null;this.__ec0331SkippedContent=false;return true;}
    if(this.__ec0331SkippedContent&&this.emissionRunning){this.__ec0331SkippedContent=false;if(plan?.ad?.path)this.__ec0328AdReservation={path:plan.ad.path,reason,locked:true,name:plan.ad.name};const adPlayed=await this.playAdAfterCanned(this.getSettings?.()||s,reason);this.__ec0331MediaPlan=null;this.__ec0331ManualContent=null;return adPlayed||true;}
    return result;
  };
  p.skipCurrent=function(){if(this.currentKind==='canned'){this.__ec0331SkippedContent=true;const keep=this.__ec0328AdReservation|| (this.__ec0331ActivePlan?.ad?.path?{path:this.__ec0331ActivePlan.ad.path,reason:this.__ec0331ActivePlan.reason,locked:true,name:this.__ec0331ActivePlan.ad.name}:null);const r=baseSkip.call(this);if(keep)this.__ec0328AdReservation=keep;return r;}return baseSkip.call(this);};
  p.scheduleSpecificContent=function(wanted){const s=this.getSettings?.()||{},folder=String(s.canned?.folder||''),media=mediaByPath(this.canned,folder,wanted);if(!media)throw new Error('El contenido seleccionado ya no está disponible en la carpeta');this.__ec0331ManualContent={path:media.path,name:media.name,requestedAt:Date.now()};this.__ec0331MediaPlan=null;this.cannedRequested=true;ensurePlan(this,s,'manual-specific',{path:media.path,title:media.name});this.state({notice:`Contenido programado como próximo: ${media.name}`});return this.snapshot();};
  p.cancelSpecificContent=function(){const name=this.__ec0331ManualContent?.name||'';this.__ec0331ManualContent=null;this.__ec0331MediaPlan=null;if(this.cannedRequested)this.cannedRequested=false;this.state({notice:name?`Programación manual cancelada: ${name}`:'No había un contenido manual programado.'});return this.snapshot();};
  p.snapshot=function(extra={}){const snap=baseSnapshot.call(this,extra),m=this.__ec0331ManualContent,plan=this.__ec0331MediaPlan;return{...snap,manualContent:m?{...m}:null,mediaPlan:plan?{reason:plan.reason,content:plan.content?{name:plan.content.name,path:plan.content.path}:null,ad:plan.ad?{name:plan.ad.name,path:plan.ad.path}:null,locked:true}:null};};
  p.resetSessionCounters=function(){this.__ec0331MediaPlan=null;this.__ec0331SkippedContent=false;return baseReset.call(this);};
}

function installIpc0331(){
  try{ipcMain.removeHandler('output:pickStandbyVideo');}catch{}try{ipcMain.removeHandler('output:clearStandbyVideo');}catch{}try{ipcMain.removeHandler('canned:scheduleSpecific');}catch{}try{ipcMain.removeHandler('canned:cancelSpecific');}catch{}
  ipcMain.handle('output:pickStandbyVideo',async()=>{const r=await dialog.showOpenDialog({properties:['openFile'],filters:[{name:'Video de espera',extensions:['mp4','m4v','webm','mov']}]});if(r.canceled||!r.filePaths?.[0])return{ok:false};const file=r.filePaths[0];return{ok:true,path:file,url:pathToFileURL(file).href,name:path.basename(file)};});
  ipcMain.handle('output:clearStandbyVideo',()=>({ok:true,path:'',url:'',name:''}));
  ipcMain.handle('canned:scheduleSpecific',(_,p={})=>{const a=global.__ec0328AutomationRef||global.__ec0329AutomationRef;if(!a)throw new Error('El motor de emisión todavía no está disponible');return a.scheduleSpecificContent(String(p.path||''));});
  ipcMain.handle('canned:cancelSpecific',()=>{const a=global.__ec0328AutomationRef||global.__ec0329AutomationRef;if(!a)throw new Error('El motor de emisión todavía no está disponible');return a.cancelSpecificContent();});
}

function installRelease0331(){installSettings0331();installEngine0331();installIpc0331();}
module.exports={installRelease0331,isExclusive,strictProjected,ensurePlan};
