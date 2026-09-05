'use strict';

const {AutomationEngine}=require('./automation0325');

const clamp=(v,min,max,fallback=min)=>{const n=Number(v);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;};
const keyPath=v=>{try{return require('path').resolve(String(v||'')).normalize('NFKC').toLocaleLowerCase('es');}catch{return String(v||'').normalize('NFKC').toLocaleLowerCase('es');}};
const isNewsRow=row=>!!row&&['rss','generated'].includes(String(row.sourceType||'rss'));
const isMediaPlan=row=>!!row&&row.planned===true&&['content','ad'].includes(String(row.sourceType||''));
const isEffective=row=>!!row&&!row.history&&row.queueGroup!=='preparing';

function scanManager(manager,folder){
  try{const scan=manager?.list?.(String(folder||''));return scan?.ok&&Array.isArray(scan.files)?scan:{ok:false,files:[]};}catch{return{ok:false,files:[]};}
}
function managerSequence(manager,folder,count,exclude=[]){
  const wanted=Math.max(0,Number(count)||0),blocked=new Set((exclude||[]).map(keyPath).filter(Boolean));
  if(!wanted)return[];
  const scan=scanManager(manager,folder);if(!scan.files.length)return[];
  try{manager?.ensureBag?.(String(folder||''));}catch{}
  const bag=(Array.isArray(manager?.bag)?manager.bag:[]).filter(x=>x?.path&&!blocked.has(keyPath(x.path)));
  const all=scan.files.filter(x=>x?.path&&!blocked.has(keyPath(x.path)));
  const out=[],push=x=>{if(x?.path)out.push({...x});};
  bag.forEach(push);
  if(!all.length)return out.slice(0,wanted);
  let cycle=0;
  while(out.length<wanted&&cycle<100){
    for(const item of all){if(out.length>=wanted)break;push(item);}
    cycle++;
  }
  return out.slice(0,wanted);
}
function validMedia(manager,folder,media){
  if(!media?.path)return false;const scan=scanManager(manager,folder);return scan.files.some(x=>keyPath(x.path)===keyPath(media.path));
}
function planContext(engine,s,mode='scheduled'){
  const c=s?.canned||{},interval=clamp(c.interval,0,999,0),total=Math.max(0,Number(engine.scheduledNewsTotal)||0),played=Math.max(0,Number(engine.cannedPlayed)||0);
  const anchor=Number.isFinite(Number(engine.__ec0330ContentAnchorNews))?Math.max(0,Number(engine.__ec0330ContentAnchorNews)):Math.max(0,Number(engine.lastScheduledCannedAt)||0);
  const manual=engine.__ec0331ManualContent;
  return [mode,interval,keyPath(c.folder),keyPath(c.adsFolder),anchor,played,manual?.requestedAt||0].join('|');
}
function getRegistry(engine,context){
  if(engine.__ec0332PlanContext!==context||!(engine.__ec0332PlanRegistry instanceof Map)){
    engine.__ec0332PlanContext=context;
    engine.__ec0332PlanRegistry=new Map();
  }
  return engine.__ec0332PlanRegistry;
}
function pairRows(plan,interval){
  if(!plan?.content)return[];
  const slot=Number(plan.slot)||1,key=String(plan.key||`scheduled-${slot}`);
  const rows=[{
    id:`ec0332-content-${key}`,renderKey:`ec0332-content-${key}`,title:plan.content.name,status:'PROGRAMADO',sourceType:'content',
    planned:true,queueGroup:'effective',planReason:'scheduled',planKey:key,planSlot:slot,mediaPath:plan.content.path,
    planText:`Después de ${interval} noticia${interval===1?'':'s'}`,locked:true
  }];
  if(plan.ad)rows.push({
    id:`ec0332-ad-${key}`,renderKey:`ec0332-ad-${key}`,title:plan.ad.name,status:'PROGRAMADO',sourceType:'ad',
    planned:true,queueGroup:'effective',planReason:'scheduled',planKey:key,planSlot:slot,mediaPath:plan.ad.path,
    planText:'Después del contenido',locked:true,adLocked:true
  });
  return rows;
}
function acquirePlan(engine,s,context,slot,contentSeq,adSeq,usedContent,usedAds){
  const c=s?.canned||{},registry=getRegistry(engine,context),key=`${context}|slot:${slot}`;
  let plan=registry.get(key);
  const contentOk=plan?.content&&validMedia(engine.canned,c.folder,plan.content),adRequired=c.insertAdAfterContent!==false&&String(c.adsFolder||'').trim(),adOk=!adRequired||!plan?.ad||validMedia(engine.ads,c.adsFolder,plan.ad);
  if(!contentOk||!adOk)plan=null;
  if(!plan){
    const choose=(seq,used)=>{
      const fresh=seq.find(x=>x?.path&&!used.has(keyPath(x.path)));
      return fresh||seq[(Math.max(1,slot)-1)%Math.max(1,seq.length)]||null;
    };
    const content=choose(contentSeq,usedContent);if(!content)return null;
    const ad=adRequired?choose(adSeq,usedAds):null;
    plan={key,slot,content:{...content},ad:ad?{...ad}:null,createdAt:Date.now()};
    registry.set(key,plan);
    while(registry.size>60)registry.delete(registry.keys().next().value);
  }
  if(plan.content?.path)usedContent.add(keyPath(plan.content.path));
  if(plan.ad?.path)usedAds.add(keyPath(plan.ad.path));
  return plan;
}
function normalizePositions(rows){
  let pos=0;
  return (rows||[]).map(row=>{
    const x={...row};
    if(x.history||x.queueGroup==='preparing'){x.displayPosition=0;x.sessionSeq=0;}
    else{x.displayPosition=++pos;x.sessionSeq=x.displayPosition;}
    return x;
  });
}

function projectFullQueue(engine,s,baseRows){
  const rows=(baseRows||[]).filter(Boolean),c=s?.canned||{},interval=clamp(c.interval,0,999,0);
  if(!c.enabled||interval<=0)return normalizePositions(rows.filter(r=>!isMediaPlan(r)||String(r.status||'').toUpperCase()==='AL AIRE'));

  const preparing=rows.filter(r=>r.queueGroup==='preparing'&&!r.history);
  const effective=rows.filter(isEffective);
  const planned=effective.filter(isMediaPlan);
  const core=effective.filter(r=>!isMediaPlan(r));
  const currentKind=String(engine.currentKind||'none');
  const currentMedia=planned.filter(r=>String(r.status||'').toUpperCase()==='AL AIRE'||(currentKind==='canned'&&r.sourceType==='ad')||(currentKind==='ad'&&r.sourceType==='ad'));
  const nonScheduled=planned.filter(r=>!currentMedia.includes(r)&&String(r.planReason||'scheduled')!=='scheduled');
  let immediate=nonScheduled;
  if(!immediate.length&&engine.__ec0331ManualContent){
    const p=engine.__ec0331MediaPlan;
    if(p?.content)immediate=[{id:'ec0332-manual-content',renderKey:'ec0332-manual-content',title:p.content.name,status:'PROGRAMADO',sourceType:'content',planned:true,queueGroup:'effective',planReason:'manual-specific',planText:'Próximo en emisión',mediaPath:p.content.path,locked:true}];
    if(p?.ad)immediate.push({id:'ec0332-manual-ad',renderKey:'ec0332-manual-ad',title:p.ad.name,status:'PROGRAMADO',sourceType:'ad',planned:true,queueGroup:'effective',planReason:'manual-specific',planText:'Después del contenido',mediaPath:p.ad.path,locked:true,adLocked:true});
  }

  const total=Math.max(0,Number(engine.scheduledNewsTotal)||0),anchor=Number.isFinite(Number(engine.__ec0330ContentAnchorNews))?Math.max(0,Number(engine.__ec0330ContentAnchorNews)):Math.max(0,Number(engine.lastScheduledCannedAt)||0);
  let progress=Math.min(interval,Math.max(0,total-anchor));
  const mediaActive=currentKind==='canned'||currentKind==='ad';
  if(mediaActive)progress=0;

  const immediateContent=immediate.find(x=>x.sourceType==='content'),immediateAd=immediate.find(x=>x.sourceType==='ad');
  const excludeContent=[immediateContent?.mediaPath,...currentMedia.filter(x=>x.sourceType==='content').map(x=>x.mediaPath)].filter(Boolean),excludeAds=[immediateAd?.mediaPath,...currentMedia.filter(x=>x.sourceType==='ad').map(x=>x.mediaPath)].filter(Boolean);
  const maxSlots=Math.max(2,Math.ceil((core.filter(isNewsRow).length+interval)/interval)+2);
  const contentSeq=managerSequence(engine.canned,c.folder,maxSlots+2,excludeContent),adSeq=managerSequence(engine.ads,c.adsFolder,maxSlots+2,excludeAds);
  const resetMode=mediaActive?'after-active':immediate.length?'after-immediate':'scheduled',context=planContext(engine,s,resetMode),usedContent=new Set(),usedAds=new Set();
  let slot=0;
  const scheduledPair=()=>{slot++;const p=acquirePlan(engine,s,context,slot,contentSeq,adSeq,usedContent,usedAds);return pairRows(p,interval);};

  const out=[];
  if(currentMedia.length){out.push(...currentMedia);progress=0;}

  const newsRows=core.filter(r=>isNewsRow(r)&&['AL AIRE','LISTA'].includes(String(r.status||'').toUpperCase()));
  const otherCore=core.filter(r=>!isNewsRow(r));
  if(otherCore.length)out.push(...otherCore);

  let immediateInserted=!immediate.length||mediaActive;
  const airIndex=newsRows.findIndex(r=>String(r.status||'').toUpperCase()==='AL AIRE');
  if(!immediateInserted&&airIndex<0){out.push(...immediate);immediateInserted=true;progress=0;}

  let dueBefore=!immediate.length&&!mediaActive&&progress>=interval;
  if(dueBefore&&airIndex<0){out.push(...scheduledPair());progress=0;dueBefore=false;}

  for(let i=0;i<newsRows.length;i++){
    const row=newsRows[i];out.push(row);
    const isAir=String(row.status||'').toUpperCase()==='AL AIRE';

    if(!immediateInserted&&isAir){
      out.push(...immediate);immediateInserted=true;progress=0;dueBefore=false;continue;
    }
    if(dueBefore&&isAir){
      out.push(...scheduledPair());progress=0;dueBefore=false;continue;
    }

    progress++;
    if(progress>=interval){
      out.push(...scheduledPair());
      progress=0;
    }
  }

  if(!immediateInserted){out.push(...immediate);immediateInserted=true;}
  const final=[...out,...preparing];
  return normalizePositions(final);
}

function installRelease0332(){
  const p=AutomationEngine.prototype;
  if(p.__ec0332QueuePlanner)return;
  Object.defineProperty(p,'__ec0332QueuePlanner',{value:true});
  const baseDisplay=p.displayQueue;
  p.displayQueue=function(s=this.getSettings?.()||{}){
    return projectFullQueue(this,s,baseDisplay.call(this,s)||[]);
  };
  const baseReset=p.resetSessionCounters;
  p.resetSessionCounters=function(){
    this.__ec0332PlanRegistry=new Map();this.__ec0332PlanContext='';
    return baseReset.call(this);
  };
}

module.exports={installRelease0332,projectFullQueue,managerSequence,normalizePositions,isNewsRow};
