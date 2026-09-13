'use strict';

const {AutomationEngine:Automation0324,applyClosings,articleAccess,buildExclusivePublicArticle,exclusiveContextSufficient}=require('./automation0324');
const {STATUS_INSUFFICIENT}=require('./editorial');
const {fetchArticleMetadata}=require('./articleMetadata0324');
const {storyKey,baseStoryKey}=require('./storyKey0324');

const wait=ms=>new Promise(r=>setTimeout(r,ms));
const isNews=x=>x&&['rss','generated'].includes(x.sourceType||'rss');
const isLiveUrl=url=>/lbposting|liveblog|live-blog|live_blog/i.test(String(url||''));
const clamp=(n,min,max,fallback)=>{n=Number(n);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;};
function exclusiveEligibilityState(settings={},newsSinceExclusive=0){
  const every=clamp(settings?.automation?.exclusiveEveryNews,0,20,4),required=every>1?every-1:0,since=Math.max(0,Number(newsSinceExclusive)||0);
  return{everyNews:every,requiredPublic:required,newsSinceExclusive:since,nonExclusiveNeeded:every>0?Math.max(0,required-since):0,due:every===0||since>=required};
}
function exclusiveSourceArticle(story,article,wantsFull=false){
  const fullUsable=wantsFull&&['COMPLETE','PARTIAL'].includes(String(article?.contentState||''))&&String(article?.body||'').trim().length>=250;
  if(fullUsable)return{sourceArticle:{...article,protectedBodyOmitted:false,exclusiveContentMode:'full'},mode:'full',sufficient:true};
  const sufficient=exclusiveContextSufficient(story,article),sourceArticle=buildExclusivePublicArticle(story,article);
  return{sourceArticle,mode:'public-preview',sufficient};
}
function selectGpuRequestIndex(queue=[],voiceBurst=0,maxVoiceBurst=2){if(!queue.length)return-1;const voiceIndex=queue.findIndex(x=>x?.kind==='voice'),aiIndex=queue.findIndex(x=>x?.kind==='ai');if(voiceIndex>=0&&(Number(voiceBurst)<Number(maxVoiceBurst)||aiIndex<0))return voiceIndex;if(aiIndex>=0)return aiIndex;return 0;}
function locutionSource(title,script){const t=String(title||'').trim(),s=String(script||'').trim();if(!t)return s;if(!s)return t;const clean=x=>x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim(),ct=clean(t),cs=clean(s.slice(0,Math.max(t.length*2,220)));return ct&&cs.startsWith(ct)?s:`${t}. ${s}`;}
function feedFor(story,s){return(s?.rssFeeds||[]).find(f=>String(f.id)===String(story?.feedId))||{};}
function sourceName(story={}){return String(story.feedName||'Fuente');}
function sectionName(item={}){return String(item.result?.category||item.story?.category||'Actualidad');}
function accessForcedExclusive(story,s){const feed=feedFor(story,s),modes=[story?.feedAccessMode,feed?.accessMode,...(story?.sourceFeeds||[]).map(x=>x?.accessMode)];return modes.some(x=>String(x||'auto')==='exclusive');}
function accessForcedPublic(story,s){const feed=feedFor(story,s);return String(story?.feedAccessMode||feed?.accessMode||'auto')==='public';}

class AutomationEngine extends Automation0324{
  constructor(args){
    super(args);
    this.aiStageTail=Promise.resolve();this.voiceStageTail=Promise.resolve();this.aiStageBusy=false;this.voiceStageBusy=false;
    this.gpuStageQueue=[];this.gpuStageBusy=false;this.gpuStageCurrent='';this.gpuVoiceBurst=0;this.gpuMaxVoiceBurst=2;this.gpuQueueTimeoutMs=180000;
    this.performanceSamples=[];this.localRuntime=args?.localRuntime||null;this.__v2ProductionProfile=null;this.__v2Preflight=null;
    this.selectionRecent=[];this.urlFailures=new Map();this.feedFailures=new Map();this.liveBaseCooldown=new Map();
    this.exclusiveReserve=[];this.exclusiveReserveKeys=new Set();
    if(!Number.isFinite(Number(this.newsSinceExclusive)))this.newsSinceExclusive=0;
  }
  trimNewsStatuses(){while(this.newsStatuses.size>300){let key='',oldest=Infinity;for(const[k,v]of this.newsStatuses){const t=Number(v.updatedAt)||0;if(t<oldest){oldest=t;key=k;}}if(!key)break;this.newsStatuses.delete(key);}}
  omittedKey(story={}){return /^#?ec-event=/i.test(String(URLSafe(story.link).hash||'').replace(/^#/,''))?storyKey(story):baseStoryKey(story);}
  isOmittedBlocked(story){const key=this.omittedKey(story),at=Number(this.omittedSources.get(key)||0);if(!at)return false;if(isLiveUrl(story?.link))return Date.now()-at<120000;return true;}
  markOmitted(story,reason='fuente insuficiente',sourceType='rss'){
    const key=this.omittedKey(story);this.omittedSources.set(key,Date.now());while(this.omittedSources.size>500)this.omittedSources.delete(this.omittedSources.keys().next().value);
    if(isLiveUrl(story?.link))this.liveBaseCooldown.set(baseStoryKey(story),Date.now()+120000);
    this.omissionStreak++;if(this.omissionStreak>=3)this.badSourceBackoffUntil=Date.now()+Math.min(5000,500*this.omissionStreak);
    this.addEmissionHistory(sourceType,story?.title||'Nota omitida','OMITIDA',{reason,feedName:sourceName(story),category:String(story?.category||'Actualidad'),storyKey:storyKey(story),baseKey:baseStoryKey(story),storyUrl:String(story?.link||''),isExclusive:!!story?.isExclusive});
  }
  schedulerState(settings=this.getSettings()||{}){const x=exclusiveEligibilityState(settings,this.newsSinceExclusive);return{...x,hasEmittedExclusive:this.exclusiveHasEmitted,reservedCount:(this.exclusiveReserve||[]).length,reserveMax:clamp(settings?.automation?.exclusiveReserveMax,1,30,10),openExclusiveArticles:settings?.automation?.openExclusiveArticles===true};}
  processingSchedulerState(settings=this.getSettings()||{}){let since=Math.max(0,Number(this.newsSinceExclusive)||0),activeNews=0;for(const item of this.queue||[]){if(!isNews(item)||item?.history||['EMITIDA','ERROR','OMITIDA'].includes(String(item?.status||'').toUpperCase()))continue;activeNews++;if(item?.isExclusive||item?.result?.isExclusive)since=0;else since++;}const x=exclusiveEligibilityState(settings,since);return{...x,projected:true,activeNews,emittedBase:Math.max(0,Number(this.newsSinceExclusive)||0),reservedCount:(this.exclusiveReserve||[]).length};}
  recordExclusiveEmission(item){
    if(item?.result?.isExclusive||item?.isExclusive){this.exclusiveHasEmitted=true;this.newsSinceExclusive=0;}else this.newsSinceExclusive=Math.max(0,Number(this.newsSinceExclusive)||0)+1;
    try{this.history?.setAutomationState?.({exclusiveHasEmitted:this.exclusiveHasEmitted,newsSinceExclusive:this.newsSinceExclusive});}catch{}
  }
  knownExclusive(story,s){return accessForcedExclusive(story,s)||story?.isExclusive===true||String(story?.accessStatus||'')==='SUBSCRIBER_ONLY';}
  hasExclusiveInPipeline(){return(this.queue||[]).some(x=>isNews(x)&&!['EMITIDA','ERROR'].includes(x.status)&&!!(x.isExclusive||x.result?.isExclusive));}
  exclusiveReserveKey(story={}){return baseStoryKey(story)||String(story?.link||'');}
  isExclusiveReserved(story){return this.exclusiveReserveKeys?.has(this.exclusiveReserveKey(story))===true;}
  reserveExclusive(story,s,extra={}){
    this.exclusiveReserve=Array.isArray(this.exclusiveReserve)?this.exclusiveReserve:[];this.exclusiveReserveKeys=this.exclusiveReserveKeys instanceof Set?this.exclusiveReserveKeys:new Set();this.queuedUrls=this.queuedUrls instanceof Set?this.queuedUrls:new Set();
    if(!story?.link)return false;const key=this.exclusiveReserveKey(story);if(!key||this.exclusiveReserveKeys.has(key))return false;
    const max=clamp(s?.automation?.exclusiveReserveMax,1,30,10),entry={key,story:{...story,isExclusive:true,accessStatus:'SUBSCRIBER_ONLY'},article:extra.article||null,accessStatus:'SUBSCRIBER_ONLY',reservedAt:Date.now(),selectionScore:Number(story.__ecSelectionScore)||Number(extra.selectionScore)||0};
    this.exclusiveReserve.push(entry);this.exclusiveReserveKeys.add(key);this.queuedUrls.add(story.link);this.setNewsStatus(entry.story,'RESERVADA',{isExclusive:true,accessStatus:'SUBSCRIBER_ONLY'});
    this.exclusiveReserve.sort((a,b)=>(Number(b.selectionScore)||0)-(Number(a.selectionScore)||0)||Date.parse(b.story?.pubDate||'')-Date.parse(a.story?.pubDate||'')||b.reservedAt-a.reservedAt);
    while(this.exclusiveReserve.length>max){const dropped=this.exclusiveReserve.pop();if(dropped){this.exclusiveReserveKeys.delete(dropped.key);this.queuedUrls.delete(dropped.story?.link);try{this.newsStatuses.delete(storyKey(dropped.story));this.newsStatuses.delete(baseStoryKey(dropped.story));}catch{}}}
    this.state();return true;
  }
  reserveKnownExclusives(items,s){
    this.exclusiveReserve=Array.isArray(this.exclusiveReserve)?this.exclusiveReserve:[];this.exclusiveReserveKeys=this.exclusiveReserveKeys instanceof Set?this.exclusiveReserveKeys:new Set();const max=clamp(s?.automation?.exclusiveReserveMax,1,30,10);if(this.exclusiveReserve.length>=max)return;
    for(const story of items||[]){if(this.exclusiveReserve.length>=max)break;if(!this.knownExclusive(story,s)||this.isExclusiveReserved(story)||!this.eligible(story,s))continue;story.__ecSelectionScore=this.scoreCandidate(story,s);this.reserveExclusive(story,s);}
  }
  takeReservedExclusive(s){
    this.exclusiveReserve=Array.isArray(this.exclusiveReserve)?this.exclusiveReserve:[];this.exclusiveReserveKeys=this.exclusiveReserveKeys instanceof Set?this.exclusiveReserveKeys:new Set();while(this.exclusiveReserve.length){const entry=this.exclusiveReserve.shift();this.exclusiveReserveKeys.delete(entry.key);if(!this.isFeedActive(entry.story,s)){this.queuedUrls.delete(entry.story?.link);continue;}return entry;}return null;
  }
  needsDueExclusive(s){const sched=this.schedulerState(s);return sched.due&&!this.hasExclusiveInPipeline();}
  urlOnCooldown(story){const key=baseStoryKey(story),until=Number(this.urlFailures.get(key)?.until||0),liveUntil=Number(this.liveBaseCooldown.get(key)||0);return until>Date.now()||liveUntil>Date.now();}
  feedOnCooldown(story){return Number(this.feedFailures.get(String(story?.feedId||''))?.until||0)>Date.now();}
  eligible(story,s){
    if(!story?.link||this.queuedUrls.has(story.link)||this.isExclusiveReserved(story)||!this.isFeedActive(story,s)||this.isOmittedBlocked(story)||this.urlOnCooldown(story)||this.feedOnCooldown(story))return false;
    if((this.queue||[]).some(x=>baseStoryKey(x.story)===baseStoryKey(story)&&!['EMITIDA','ERROR'].includes(x.status)))return false;
    if(s.automation?.avoidRepeats&&this.history.has(story.link)&&!isLiveUrl(story.link))return false;
    const maxAge=(Number(s.automation?.maxAgeHours)||6)*3600000,now=Date.now(),t=Date.parse(story.pubDate||'');if(t&&t>now+10*60000)return false;if(t&&now-t>maxAge&&!isLiveUrl(story.link))return false;return true;
  }
  scoreCandidate(story,s){
    const now=Date.now(),t=Date.parse(story.pubDate||'')||now,ageMin=Math.max(0,(now-t)/60000),feedId=String(story.feedId||''),recent=this.selectionRecent.slice(-8),recentCount=recent.filter(x=>x===feedId).length,queuedCount=(this.queue||[]).filter(x=>String(x.story?.feedId||'')===feedId&&isNews(x)&&!['EMITIDA','ERROR'].includes(x.status)).length;
    let score=1000-Math.min(900,ageMin*.9)-recentCount*135-queuedCount*70;
    const exclusive=this.knownExclusive(story,s),sched=this.schedulerState(s);if(exclusive&&sched.due)score+=420;if(exclusive&&!sched.due)score-=900;if(recent.at(-1)===feedId)score-=100;
    return score;
  }
  candidateFrom(items,s,options={}){
    const eligible=(items||[]).filter(x=>this.eligible(x,s)&&(!options.exclusiveOnly||this.knownExclusive(x,s))&&(!options.publicOnly||!this.knownExclusive(x,s)));if(!eligible.length)return null;
    let best=null,bestScore=-Infinity;for(const x of eligible){const score=this.scoreCandidate(x,s);if(score>bestScore){best=x;bestScore=score;}}
    if(best){best.__ecSelectionScore=Math.round(bestScore);best.__ecSelectionReason=this.knownExclusive(best,s)?'exclusiva elegible':'actualidad + variedad de fuente';}
    return best;
  }
  coexistenceMode(s=this.getSettings()||{}){
    const engine=String(s?.tts?.engine||'kokoro');if(engine==='kokoro')return'split';
    const usesLocal=[s?.ai?.primary,s?.ai?.backup1,s?.ai?.backup2].includes('local');if(!usesLocal)return'split';
    const saved=String(s?.ai?.lastLocalBenchmark?.coexistenceMode||s?.optimization0321?.local?.coexistenceMode||'');if(saved)return saved;return engine==='qwen3tts'?'gpu-swap':'gpu-coordinated';
  }
  stageMetric(kind,suffix){return kind==='ai'?(`ai${suffix}`):(`tts${suffix}`);}
  markStageWait(holder,kind,ms,mode){if(!holder)return;holder.metrics={...(holder.metrics||{}),[this.stageMetric(kind,'QueueWaitMs')]:Math.max(0,Number(ms)||0),pipelineMode:mode};}
  markStageElapsed(holder,kind,ms,mode){if(!holder)return;holder.metrics={...(holder.metrics||{}),[this.stageMetric(kind,'StageElapsedMs')]:Math.max(0,Number(ms)||0),pipelineMode:mode};}
  async runStage(kind,fn,holder=null,options={}){
    const mode=this.coexistenceMode();if((mode==='gpu-coordinated'||mode==='gpu-swap')&&(kind==='ai'||kind==='voice'))return this.runGpuCoordinated(kind,fn,holder,{...options,mode});
    const tailKey=kind==='ai'?'aiStageTail':'voiceStageTail',busyKey=kind==='ai'?'aiStageBusy':'voiceStageBusy',previous=this[tailKey]||Promise.resolve(),queuedAt=Date.now();
    if(holder){holder.stage=kind==='ai'?'ai-wait':'tts-wait';this.state();}
    const task=previous.then(async()=>{this.markStageWait(holder,kind,Date.now()-queuedAt,mode);this[busyKey]=true;if(kind==='voice')this.localHeavyRunning=true;if(holder)holder.stage=kind;this.state();const started=Date.now();try{return await fn();}finally{this.markStageElapsed(holder,kind,Date.now()-started,mode);this[busyKey]=false;if(kind==='voice')this.localHeavyRunning=false;this.state();}});
    this[tailKey]=task.catch(()=>{});return task;
  }
  runGpuCoordinated(kind,fn,holder=null,options={}){
    return new Promise((resolve,reject)=>{
      const req={kind,fn,holder,resolve,reject,queuedAt:Date.now(),retry:!!options.retry,mode:String(options.mode||'gpu-coordinated'),queueTimer:null};
      if(holder){holder.stage=kind==='ai'?'ai-wait':'tts-wait';holder.metrics={...(holder.metrics||{}),pipelineMode:req.mode};this.state();}
      req.queueTimer=setTimeout(()=>{
        const idx=this.gpuStageQueue.indexOf(req);if(idx<0)return;this.gpuStageQueue.splice(idx,1);
        const waited=Date.now()-req.queuedAt;this.markStageWait(holder,kind,waited,req.mode);
        if(holder){holder.metrics={...(holder.metrics||{}),gpuQueueWatchdog:true,gpuQueueTimeoutMs:this.gpuQueueTimeoutMs};holder.stage=kind==='ai'?'ai-queue-timeout':'tts-queue-timeout';}
        const err=new Error(`La etapa ${kind==='voice'?'de voz':'de IA'} esperó demasiado por la GPU (${Math.round(waited/1000)} s)`);err.code='GPU_QUEUE_TIMEOUT';err.timeoutMs=this.gpuQueueTimeoutMs;reject(err);this.state();
      },this.gpuQueueTimeoutMs);
      this.gpuStageQueue.push(req);this.pumpGpuCoordinated();
    });
  }
  nextGpuRequest(){const idx=selectGpuRequestIndex(this.gpuStageQueue,this.gpuVoiceBurst,this.gpuMaxVoiceBurst);if(idx<0)return null;const [req]=this.gpuStageQueue.splice(idx,1);return req||null;}
  async releaseOppositeForGpuSwap(kind,holder=null){
    if(kind==='ai'){
      if(holder)holder.stage='gpu-swap-release-voice';this.state();
      if(typeof this.kokoro?.stopAndWait!=='function'){const e=new Error('GPU SWAP no puede confirmar que el motor de voz liberó la GPU');e.code='GPU_SWAP_TTS_RELEASE_UNAVAILABLE';throw e;}
      await this.kokoro.stopAndWait('gpu-swap-before-ai',7000);
      await wait(300);
      return;
    }
    if(holder)holder.stage='gpu-swap-release-ai';this.state();
    const local=this.localRuntime;
    if(!local||typeof local.stopAndWait!=='function'){const e=new Error('GPU SWAP no tiene una referencia directa al runtime local');e.code='GPU_SWAP_LOCAL_RUNTIME_MISSING';throw e;}
    await local.stopAndWait('gpu-swap-before-voice',7000);
    const st=await local.status().catch(()=>null);
    if(st?.running){const e=new Error('Qwen local siguió activo después de solicitar GPU SWAP');e.code='GPU_SWAP_LOCAL_STILL_RUNNING';throw e;}
    await wait(350);
  }
  async pumpGpuCoordinated(){
    if(this.gpuStageBusy)return;const req=this.nextGpuRequest();if(!req)return;if(req.queueTimer)clearTimeout(req.queueTimer);
    this.gpuStageBusy=true;this.gpuStageCurrent=req.kind;this.gpuVoiceBurst=req.kind==='voice'?this.gpuVoiceBurst+1:0;
    const busyKey=req.kind==='ai'?'aiStageBusy':'voiceStageBusy';this[busyKey]=true;if(req.kind==='voice')this.localHeavyRunning=true;
    this.markStageWait(req.holder,req.kind,Date.now()-req.queuedAt,req.mode);if(req.holder)req.holder.stage=req.kind;this.state();
    const started=Date.now();try{if(req.mode==='gpu-swap')await this.releaseOppositeForGpuSwap(req.kind,req.holder);if(req.holder)req.holder.stage=req.kind;this.state();req.resolve(await req.fn());}catch(e){req.reject(e);}finally{
      this.markStageElapsed(req.holder,req.kind,Date.now()-started,req.mode);this[busyKey]=false;if(req.kind==='voice')this.localHeavyRunning=false;
      this.gpuStageBusy=false;this.gpuStageCurrent='';this.state();queueMicrotask(()=>this.pumpGpuCoordinated());
    }
  }
  noteFetchSuccess(story){const key=baseStoryKey(story),feedId=String(story?.feedId||'');this.urlFailures.delete(key);const f=this.feedFailures.get(feedId);if(f){f.count=Math.max(0,(f.count||0)-1);f.until=0;if(!f.count)this.feedFailures.delete(feedId);}}
  noteFetchFailure(story){
    const key=baseStoryKey(story),feedId=String(story?.feedId||''),u=this.urlFailures.get(key)||{count:0,until:0};u.count++;u.until=Date.now()+(u.count>=2?120000:8000);this.urlFailures.set(key,u);while(this.urlFailures.size>300)this.urlFailures.delete(this.urlFailures.keys().next().value);
    const f=this.feedFailures.get(feedId)||{count:0,until:0};f.count++;if(f.count>=3)f.until=Date.now()+120000;this.feedFailures.set(feedId,f);
  }
  async fetchArticleRetry(story){let last;for(let attempt=1;attempt<=2;attempt++){try{const article=await this.fetchArticle(story.link);this.noteFetchSuccess(story);return article;}catch(e){last=e;if(attempt<2)await wait(850);}}this.noteFetchFailure(story);throw last||new Error('fetch failed');}
  async producer(epoch){
    while(this.processingRunning&&epoch===this.processingEpoch){try{
      if(this.processingPaused){await wait(350);continue;}if(Date.now()<this.badSourceBackoffUntil){await wait(Math.min(900,this.badSourceBackoffUntil-Date.now()));continue;}if(this.documentWorkerRunning){this.processingNotice='Generador de Notas trabajando; se reserva CPU antes de preparar otra noticia.';await wait(250);continue;}
      const s=this.getSettings(),target=Math.max(1,Math.min(30,Number(s.automation?.bufferReady)||15)),readyCount=this.readyItems().length,sched=this.processingSchedulerState(s),needDueExclusive=sched.everyNews>0&&sched.due,desired=target+(needDueExclusive?1:0),voiceBacklog=this.gpuStageQueue.filter(x=>x.kind==='voice').length+(this.gpuStageCurrent==='voice'?1:0),maxWorkers=voiceBacklog>=2?1:2;
      if(this.inFlight.size>=maxWorkers||readyCount+this.inFlight.size>=desired){this.processingNotice=readyCount>=target?`Reserva lista: ${readyCount}/${target} noticias · ${this.exclusiveReserve.length} exclusiva(s) reservada(s).`:`Preparando reserva: ${readyCount}/${target} listas · ${this.inFlight.size} en proceso.`;this.kickDocumentWorker();await wait(280);continue;}
      const maxQueue=Math.max(target+2,Math.min(60,Number(s.automation?.queueMax)||30)),activeCount=this.queue.filter(x=>!x.history&&x.status!=='EMITIDA').length;if(activeCount>=maxQueue){await wait(450);continue;}
      await this.refreshFeedCache(s,false);this.reserveKnownExclusives(this.cachedItems,s);
      if(needDueExclusive&&this.exclusiveReserve.length){
        const reserved=this.takeReservedExclusive(s);if(reserved){this.lastNoRssAt=0;this.processingNotice=`Turno de exclusiva en la reserva de preparación · preparando una de ${this.exclusiveReserve.length+1} reservada(s).`;this.launchCandidate(reserved.story,s,epoch,{forceExclusiveDue:true,reservedArticle:reserved.article,fromReserve:true});await wait(100);continue;}
      }
      const selectionMode=needDueExclusive?{exclusiveOnly:true}:{publicOnly:true};let candidate=this.candidateFrom(this.cachedItems,s,selectionMode);if(!candidate&&Date.now()-this.lastFeedFetchAt>15000){await this.refreshFeedCache(s,true);this.reserveKnownExclusives(this.cachedItems,s);if(needDueExclusive&&this.exclusiveReserve.length){const reserved=this.takeReservedExclusive(s);if(reserved){this.lastNoRssAt=0;this.processingNotice=`Turno de exclusiva en la reserva de preparación · preparando una de ${this.exclusiveReserve.length+1} reservada(s).`;this.launchCandidate(reserved.story,s,epoch,{forceExclusiveDue:true,reservedArticle:reserved.article,fromReserve:true});await wait(100);continue;}}candidate=this.candidateFrom(this.cachedItems,s,selectionMode);}
      if(!candidate){if(!this.lastNoRssAt)this.lastNoRssAt=Date.now();this.processingNotice=needDueExclusive?`Turno de exclusiva pendiente · esperando una exclusiva elegible · ${this.exclusiveReserve.length} reservada(s).`:`Buscando noticias sin candado · faltan ${sched.nonExclusiveNeeded} pública(s) en la secuencia de preparación · ${this.exclusiveReserve.length} reservada(s).`;this.state();this.kickDocumentWorker();await wait(1800);continue;}
      this.lastNoRssAt=0;this.processingNotice=needDueExclusive?`Preparando exclusiva del turno · ${this.exclusiveReserve.length} reservada(s).`:`Priorizando noticia sin candado · faltan ${sched.nonExclusiveNeeded} pública(s) para el siguiente turno exclusivo.`;this.launchCandidate(candidate,s,epoch,{forceExclusiveDue:needDueExclusive&&this.knownExclusive(candidate,s)});await wait(100);
    }catch(e){this.emit('engine-error',e);await wait(900);}}
  }
  launchCandidate(candidate,s,epoch,options={}){
    if(!this.isFeedActive(candidate,this.getSettings()||s)){this.queuedUrls.delete(candidate?.link);return;}this.queuedUrls.add(candidate.link);const forcedExclusive=this.knownExclusive(candidate,s),holder={id:`rss-${Date.now()}-${Math.random().toString(16).slice(2)}`,sourceType:'rss',story:candidate,status:'PROCESANDO',attempts:[],metrics:{pipelineMode:this.coexistenceMode(s)},stage:'article',startedAtMs:Date.now(),outputRetries:0,isExclusive:forcedExclusive,accessStatus:forcedExclusive?'SUBSCRIBER_ONLY':'',uiVisible:false,selectionScore:Number(candidate.__ecSelectionScore)||0,selectionReason:String(candidate.__ecSelectionReason||''),forceExclusiveDue:!!options.forceExclusiveDue,reservedArticle:options.reservedArticle||null,fromExclusiveReserve:!!options.fromReserve,exclusiveContentModeRequested:s?.automation?.openExclusiveArticles===true?'full':'public-preview'};
    this.queue.push(holder);this.selectionRecent.push(String(candidate.feedId||''));this.selectionRecent=this.selectionRecent.slice(-12);this.setNewsStatus(candidate,'PROCESANDO',{isExclusive:forcedExclusive,accessStatus:holder.accessStatus});this.state();
    const task=(async()=>{try{
      const outcome=await this.process(candidate,s,holder,epoch);if(outcome?.reserved){this.reserveExclusive(holder.story||candidate,s,{article:outcome.article,selectionScore:holder.selectionScore});const i=this.queue.indexOf(holder);if(i>=0)this.queue.splice(i,1);this.state();return;}if(outcome?.omitted){this.markOmitted(holder.story||candidate,outcome.reason||'fuente insuficiente');this.setNewsStatus(holder.story||candidate,'OMITIDA',{reason:outcome.reason||'fuente insuficiente',isExclusive:!!holder.isExclusive,accessStatus:holder.accessStatus,eventId:holder.article?.eventId||''});this.removeItem(holder);return;}
      Object.assign(holder,outcome);this.assertProcessingActive(epoch);holder.metrics={...(holder.metrics||{}),totalElapsedMs:Math.max(0,Date.now()-Number(holder.startedAtMs||Date.now()))};holder.status='LISTA';holder.stage='ready';holder.uiVisible=true;holder.error='';this.recordPerformance(holder);this.omissionStreak=0;this.setNewsStatus(holder.story,'LISTA',{isExclusive:!!holder.result?.isExclusive,accessStatus:holder.result?.accessStatus||holder.accessStatus,eventId:holder.article?.eventId||''});
    }catch(e){
      if(e?.code==='PROCESSING_CANCELLED')this.removeItem(holder);else if(this.isEditorialFailure(e)){this.markOmitted(holder.story||candidate,'generación inválida tras 2 intentos');this.setNewsStatus(holder.story||candidate,'OMITIDA',{reason:'generación inválida tras 2 intentos',isExclusive:!!holder.isExclusive,accessStatus:holder.accessStatus,eventId:holder.article?.eventId||''});this.removeItem(holder);}else{
        if(this.isVoiceInfrastructureFailure(e,holder))this.haltProcessingForVoiceError(e);const reason=String(e?.message||e||'Error');this.addEmissionHistory('rss',candidate.title||'Noticia','ERROR',{reason,error:reason,feedName:sourceName(candidate),category:String(candidate.category||'Actualidad'),storyKey:storyKey(candidate),baseKey:baseStoryKey(candidate),storyUrl:String(candidate.link||''),isExclusive:!!holder.isExclusive});this.setNewsStatus(holder.story||candidate,'ERROR',{reason,isExclusive:!!holder.isExclusive,accessStatus:holder.accessStatus,eventId:holder.article?.eventId||''});this.emit('error-item',{title:candidate.title,error:reason,details:e.details,stage:holder.stage});this.removeItem(holder);
      }
    }finally{this.inFlight.delete(task);if(!this.processingRunning&&!this.inFlight.size&&!this.voiceFailureLatched)this.processingNotice='Preparación de noticias detenida.';this.state();this.kickDocumentWorker();}})();this.inFlight.add(task);
  }
  async process(story,s,holder,epoch){
    holder.stage='article';this.state();let article=holder.reservedArticle||null;if(!article){try{article=await this.fetchArticleRetry(story);}catch(e){e.message=`Artículo: ${String(e?.message||e)}`;throw e;}}holder.article=article;this.assertProcessingActive(epoch);if(!this.isFeedActive(story,this.getSettings()||s))return{omitted:true,reason:'fuente pausada o eliminada'};
    let access=articleAccess(story,article,s);if(accessForcedExclusive(story,s))access={...access,status:'SUBSCRIBER_ONLY',exclusive:true,override:'exclusive'};else if(accessForcedPublic(story,s)&&!article?.access?.signals?.strongLock)access={...access,status:'PUBLIC',exclusive:false,override:'public'};
    if(!story.pubDate||access.exclusive||String(article?.access?.status||'')==='UNKNOWN'){
      try{const meta=await fetchArticleMetadata(article.finalUrl||story.link);if(meta.pubDate&&!article.pubDate)article.pubDate=meta.pubDate;if(meta.publicPreview&&!article.publicPreview)article.publicPreview=meta.publicPreview;if(meta.strongLock){article.isExclusive=true;article.access={...(article.access||{}),status:'SUBSCRIBER_ONLY',confidence:'high',signals:{...(article.access?.signals||{}),strongLock:true}};}}catch{}
      access=articleAccess(story,article,s);if(accessForcedExclusive(story,s))access={...access,status:'SUBSCRIBER_ONLY',exclusive:true,override:'exclusive'};
    }
    holder.isExclusive=access.exclusive;holder.accessStatus=access.status;if(!story.pubDate&&article.pubDate){holder.story={...holder.story,pubDate:article.pubDate};story=holder.story;}
    const schedAtClassification=this.schedulerState(s);if(access.exclusive&&!holder.forceExclusiveDue&&!schedAtClassification.due)return{reserved:true,article,accessStatus:access.status};
    if(article.isLiveBlog&&article.liveblogNoEvent)return{omitted:true,reason:'liveblog sin evento factual nuevo'};if(['DEFECTIVE','INSUFFICIENT'].includes(article.contentState)&&!(article.isLiveBlog&&article.liveEvent)&&!access.exclusive)return{omitted:true,reason:'extracción de artículo insuficiente'};
    if(article.eventId){const original=story.link,eventLink=`${original}#ec-event=${encodeURIComponent(article.eventId)}`;if(s.automation?.avoidRepeats&&this.history.has(eventLink))return{omitted:true,reason:'evento del liveblog ya emitido'};holder.originalLink=original;holder.story={...holder.story,link:eventLink};story=holder.story;}
    let sourceArticle=article;holder.exclusiveContentMode='public';if(access.exclusive){const selected=exclusiveSourceArticle(story,article,holder.exclusiveContentModeRequested==='full');if(!selected.sufficient)return{omitted:true,reason:'información pública insuficiente'};sourceArticle=selected.sourceArticle;holder.exclusiveContentMode=selected.mode;}
    holder.uiVisible=true;holder.stage='ai';this.setNewsStatus(story,'PROCESANDO',{isExclusive:access.exclusive,accessStatus:access.status,eventId:article.eventId||''});this.state();
    const image=story.image||article.image||this.getFallbackUrl();let editorial;try{
      editorial=await this.runStage('ai',async()=>{
        const ai=await this.providers.generate(story,sourceArticle,s);this.assertProcessingActive(epoch);holder.provider=ai.provider;holder.model=ai.model;holder.attempts=ai.attempts||[];
        holder.metrics={...(holder.metrics||{}),...(ai.metrics||{}),textElapsedMs:Number(ai.metrics?.elapsedMs)||0,textTokensPerSec:Number(ai.metrics?.tokensPerSec)||0};
        if(ai.result.status===STATUS_INSUFFICIENT)return{ai,omitted:true};
        const closing=applyClosings(story,article,ai.result,s),result=closing.result;holder.isExclusive=!!result.isExclusive;holder.accessStatus=result.accessStatus||access.status;
        return{ai,result,spoken:locutionSource(result.title||story.title,closing.spokenScript||result.script)};
      },holder);
    }catch(e){e.message=`IA: ${String(e?.message||e)}`;throw e;}
    if(editorial?.omitted)return{omitted:true,reason:access.exclusive?'información pública insuficiente':'fuente insuficiente'};
    const {ai,result,spoken}=editorial;holder.stage='pronunciation';this.state();let locution={text:spoken,elapsedMs:0,smartUsed:false,smartFailed:false};
    try{if(this.pronunciation)locution=await this.pronunciation.normalize(spoken,{smart:s.tts?.pronunciationSmart!==false});this.assertProcessingActive(epoch);}
    catch(e){e.message=`Pronunciación: ${String(e?.message||e)}`;throw e;}
    holder.metrics={...(holder.metrics||{}),pronunciationElapsedMs:locution.elapsedMs||0,pronunciationSmart:!!locution.smartUsed,pronunciationSmartFailed:!!locution.smartFailed,pronunciationSmartError:locution.smartFailed?String(locution.smartError||'').slice(0,180):'',pronunciationClaude:!!locution.claudeUsed,pronunciationLearned:locution.learnedCount||0};
    holder.stage='tts';this.state();let audio,voiceAttempt=0,stallMs=0,lastVoiceError='';for(;voiceAttempt<2;voiceAttempt++){try{audio=await this.runStage('voice',()=>this.kokoro.generate(locution.text,{voice:s.tts.voice,speed:1}),holder,{retry:voiceAttempt>0});break;}catch(e){lastVoiceError=String(e?.message||e);const retryable=['TTS_STALL','TTS_TOTAL_TIMEOUT','TTS_WORKER_EXIT','GPU_QUEUE_TIMEOUT'].includes(String(e?.code||''));stallMs+=Number(e?.timeoutMs||0);holder.metrics={...(holder.metrics||{}),ttsRetryCount:voiceAttempt+1,ttsStallMs:stallMs,ttsLastError:lastVoiceError};if(!retryable||voiceAttempt>=1){e.message=`Voz: ${lastVoiceError}`;e.details=ai.attempts||[];throw e;}holder.stage='tts-retry-wait';this.state();await wait(450);this.assertProcessingActive(epoch);}}if(!audio)throw new Error(`Voz: ${lastVoiceError||'no se pudo generar audio'}`);try{this.assertProcessingActive(epoch);}catch(e){this.kokoro?.cleanupAudio?.(audio.path);throw e;}holder.metrics={...(holder.metrics||{}),ttsElapsedMs:audio.elapsedMs||0,ttsThreads:audio.threads||2,audioDurationSec:audio.durationSec||0,ttsRealtimeFactor:audio.realtimeFactor||0,ttsProfile:audio.performanceLabel||audio.performanceProfile||'',ttsEngine:audio.engine||s.tts?.engine||'kokoro',ttsDevice:audio.device||audio.executionMode||'',ttsGpuName:audio.gpuName||'',ttsGpuVramMb:Number(audio.gpuVramMb||0),ttsVariant:audio.variant||s.tts?.engineParams?.chatterbox?.variant||'',ttsSpeed:1,ttsVoiceSessionId:String(audio.voiceSessionId||''),ttsVoiceConfigFingerprint:String(audio.voiceConfigFingerprint||''),ttsConsistencyMode:String(audio.consistencyMode||'automatic'),ttsProductionSeed:Number(audio.productionSeed||0),ttsProductionTemperature:Number(audio.productionTemperature||0),ttsChunkDiagnostics:Array.isArray(audio.chunkDiagnostics)?audio.chunkDiagnostics:[],ttsReferenceQuality:audio.referenceQuality||null,ttsFallbackUsed:!!audio.fallbackExplicit||!!audio.fallbackFrom,ttsFallbackFrom:String(audio.fallbackFrom||''),ttsFallbackReason:String(audio.fallbackReason||''),ttsGenerationAttempts:voiceAttempt+1,ttsRetryCount:voiceAttempt,ttsStallMs:stallMs,ttsLastError:lastVoiceError,ttsProgressCount:Number(audio.progressCount||0),ttsWatchdog:audio.watchdog||null,ttsPersistent:!!audio.persistent,ttsWorkerStartupMs:audio.workerStartupMs||0,totalElapsedMs:Math.max(0,Date.now()-Number(holder.startedAtMs||Date.now())),pipelineMode:this.coexistenceMode(s)};
    return{article,provider:ai.provider,model:ai.model,result:{...result,ttsScript:locution.text,exclusiveContentMode:holder.exclusiveContentMode},attempts:ai.attempts||[],metrics:holder.metrics,audio,image,fallback:this.getFallbackUrl(),isExclusive:!!result.isExclusive,accessStatus:result.accessStatus||access.status,exclusiveContentMode:holder.exclusiveContentMode};
  }
  recordPerformance(holder){
    const m=holder?.metrics||{},sample={at:Date.now(),totalMs:Number(m.totalElapsedMs)||0,aiWaitMs:Number(m.aiQueueWaitMs)||0,aiMs:Number(m.textElapsedMs)||Number(m.aiStageElapsedMs)||0,pronunciationMs:Number(m.pronunciationElapsedMs)||0,voiceWaitMs:Number(m.ttsQueueWaitMs)||0,voiceMs:Number(m.ttsElapsedMs)||0,rtf:Number(m.ttsRealtimeFactor)||0,audioSec:Number(m.audioDurationSec)||0};
    this.performanceSamples.push(sample);if(this.performanceSamples.length>50)this.performanceSamples.splice(0,this.performanceSamples.length-50);
  }
  performanceSummary(){
    const rows=this.performanceSamples.slice(-20),med=key=>{const a=rows.map(x=>Number(x[key])||0).sort((a,b)=>a-b);if(!a.length)return 0;const i=Math.floor(a.length/2);return a.length%2?a[i]:(a[i-1]+a[i])/2;},p95=key=>{const a=rows.map(x=>Number(x[key])||0).sort((a,b)=>a-b);return a.length?a[Math.min(a.length-1,Math.ceil(a.length*.95)-1)]:0;};
    return{samples:rows.length,totalMedianMs:Math.round(med('totalMs')),totalP95Ms:Math.round(p95('totalMs')),voiceWaitMedianMs:Math.round(med('voiceWaitMs')),voiceMedianMs:Math.round(med('voiceMs')),rtfMedian:Number(med('rtf').toFixed(3)),aiMedianMs:Math.round(med('aiMs')),pronunciationMedianMs:Math.round(med('pronunciationMs'))};
  }
  chooseReadyItem(queue=this.queue,s=this.getSettings()||{}){
    const ready=(queue||[]).filter(x=>x.status==='LISTA');if(!ready.length)return null;const sched=this.schedulerState(s),exclusive=ready.find(x=>!!(x.result?.isExclusive||x.isExclusive)),publicItem=ready.find(x=>!(x.result?.isExclusive||x.isExclusive));
    if(sched.everyNews===0)return ready[0];
    if(sched.due){if(exclusive)return exclusive;if((this.exclusiveReserve||[]).length||this.hasExclusiveInPipeline())return null;return publicItem||null;}
    return publicItem||null;
  }
  displayQueue(settings){
    const rows=super.displayQueue(settings),active=new Map((this.queue||[]).map(x=>[x.id,x]));return rows.filter(row=>{const item=row.id?active.get(row.id):null;return !(item&&item.status==='PROCESANDO'&&!item.uiVisible);}).map(row=>{const item=row.id?active.get(row.id):null;if(item){return{...row,isExclusive:!!(item.result?.isExclusive||item.isExclusive),accessStatus:item.result?.accessStatus||item.accessStatus||item.article?.access?.status||'',exclusiveContentMode:String(item.exclusiveContentMode||item.result?.exclusiveContentMode||''),feedName:sourceName(item.story),feedId:String(item.story?.feedId||''),category:sectionName(item),storyKey:storyKey(item.story),baseKey:baseStoryKey(item.story),storyUrl:String(item.story?.link||''),selectionScore:Number(item.selectionScore)||0,selectionReason:String(item.selectionReason||'')};}return row;});
  }
  snapshot(extra={}){const s=super.snapshot(extra),mode=this.coexistenceMode(),sched=this.schedulerState();return{...s,exclusiveScheduler:sched,exclusiveReserve:{count:(this.exclusiveReserve||[]).length,max:sched.reserveMax,items:(this.exclusiveReserve||[]).slice(0,10).map(x=>({title:String(x.story?.title||''),feedName:sourceName(x.story),pubDate:String(x.story?.pubDate||''),storyUrl:String(x.story?.link||'')}))},processing:{...s.processing,pipelineWorkers:this.inFlight.size,aiBusy:this.aiStageBusy,voiceBusy:this.voiceStageBusy,pipelineMode:mode==='gpu-coordinated'?'staggered-2-gpu-coordinated':mode==='gpu-swap'?'staggered-2-gpu-swap':'staggered-2',gpuStageBusy:this.gpuStageBusy,gpuStageCurrent:this.gpuStageCurrent,gpuQueue:this.gpuStageQueue.length,gpuVoiceBurst:this.gpuVoiceBurst,gpuQueueWatchdogMs:this.gpuQueueTimeoutMs,voiceBacklog:this.gpuStageQueue.filter(x=>x.kind==='voice').length},performance:this.performanceSummary(),selector:{recentFeeds:this.selectionRecent.slice(-8),urlCooldowns:[...this.urlFailures.values()].filter(x=>Number(x.until)>Date.now()).length,feedCooldowns:[...this.feedFailures.values()].filter(x=>Number(x.until)>Date.now()).length}};}
  clearQueue(){const reserved=(this.exclusiveReserve||[]).slice();const r=super.clearQueue();for(const x of reserved){try{this.newsStatuses.delete(storyKey(x.story));this.newsStatuses.delete(baseStoryKey(x.story));}catch{}}this.exclusiveReserve=[];this.exclusiveReserveKeys.clear();this.state();return this.snapshot();}
  async consumer(epoch){
    while(this.emissionRunning&&epoch===this.emissionEpoch){
      if(this.emissionPaused){await wait(300);continue;}if(!this.isOutputReady()){this.emissionPaused=true;this.state({notice:'Abre Output para continuar la emisión'});continue;}
      const s=this.getSettings(),anyReady=this.queue.some(x=>x.status==='LISTA'),reason=this.cannedReason(s,anyReady);if(reason){const played=await this.playCanned(s,reason);if(played)continue;}
      const item=this.chooseReadyItem(this.queue,s);if(!item){await wait(300);continue;}
      this.currentItem=item;this.currentKind='news';this.currentCanned=null;item.status='AL AIRE';item.error='';if(item.sourceType==='rss')this.setNewsStatus(item.story,'AL AIRE',{isExclusive:!!(item.result?.isExclusive||item.isExclusive),accessStatus:item.result?.accessStatus||item.accessStatus,eventId:item.article?.eventId||''});this.state();
      const next=this.chooseReadyItem(this.queue.filter(x=>x!==item),s),p={source:'automatic',kind:'news',title:item.result.title||item.story.title,category:item.result.category||item.story.category||'ACTUALIDAD',pubDate:item.story.pubDate||item.article?.pubDate||'',summary:item.result.summary||'',script:item.result.script,image:item.image,preloadImage:next?.image||'',fallbackImage:item.fallback,audioUrl:item.audio.url,audioDurationSec:item.audio.durationSec||item.result.durationSec||60};
      const sent=this.sendAutomaticOutput(p);if(!sent){item.status='LISTA';if(item.sourceType==='rss')this.setNewsStatus(item.story,'LISTA',{isExclusive:!!(item.result?.isExclusive||item.isExclusive),accessStatus:item.result?.accessStatus||item.accessStatus,eventId:item.article?.eventId||''});this.currentItem=null;this.currentKind='none';this.emissionPaused=true;this.state({notice:'Output no disponible'});continue;}
      const expected=Math.max(10,Number(p.audioDurationSec)||60)*1000+15000,result=await this.waitPlayback(expected);
      if(result==='ended'){
        if(item.sourceType==='rss'&&/^https?:/i.test(item.story.link||''))this.history.add(item.story,{isExclusive:!!(item.result?.isExclusive||item.isExclusive),accessStatus:item.result?.accessStatus||item.accessStatus||''});item.status='EMITIDA';this.newsEmitted++;this.scheduledNewsTotal++;this.recordExclusiveEmission(item);const extra={durationSec:p.audioDurationSec,isExclusive:!!(item.result?.isExclusive||item.isExclusive),accessStatus:item.result?.accessStatus||item.accessStatus||'',storyKey:storyKey(item.story),baseKey:baseStoryKey(item.story),storyUrl:String(item.story?.link||''),feedName:sourceName(item.story),category:sectionName(item)};this.addEmissionHistory(item.sourceType||'rss',p.title,'EMITIDA',extra);if(item.sourceType==='rss')this.setNewsStatus(item.story,'EMITIDA',{isExclusive:extra.isExclusive,accessStatus:extra.accessStatus,eventId:item.article?.eventId||''});this.state();await wait((this.getSettings().visual.pauseSeconds||2.5)*1000);this.removeItem(item);this.kickDocumentWorker();
      }else if(result==='error'||result==='timeout'){
        try{this.controlOutput('stop');}catch{}item.outputRetries=(item.outputRetries||0)+1;item.error=result==='timeout'?'El audio excedió el tiempo esperado':'No se pudo reproducir el audio';if(item.outputRetries<=1){item.status='LISTA';if(item.sourceType==='rss')this.setNewsStatus(item.story,'LISTA',{isExclusive:!!(item.result?.isExclusive||item.isExclusive),accessStatus:item.result?.accessStatus||item.accessStatus,eventId:item.article?.eventId||''});this.state({notice:`Reintentando una vez: ${item.story.title}`});await wait(750);}else{const error=item.error;this.addEmissionHistory(item.sourceType||'rss',item.story?.title||'Noticia','ERROR',{reason:error,error,feedName:sourceName(item.story),category:sectionName(item),storyKey:storyKey(item.story),baseKey:baseStoryKey(item.story),storyUrl:String(item.story?.link||''),isExclusive:!!(item.result?.isExclusive||item.isExclusive)});if(item.sourceType==='rss')this.setNewsStatus(item.story,'ERROR',{reason:error,isExclusive:!!(item.result?.isExclusive||item.isExclusive),accessStatus:item.result?.accessStatus||item.accessStatus,eventId:item.article?.eventId||''});this.emit('error-item',{title:item.story.title,error:`${error}. Se omitió tras 1 reintento.`,stage:'output'});this.removeItem(item);this.state({notice:'Una noticia con audio defectuoso fue omitida; continúa la siguiente.'});}
      }else{item.status='LISTA';if(item.sourceType==='rss')this.setNewsStatus(item.story,'LISTA',{isExclusive:!!(item.result?.isExclusive||item.isExclusive),accessStatus:item.result?.accessStatus||item.accessStatus,eventId:item.article?.eventId||''});if(result==='closed'||result==='interrupted')this.emissionPaused=true;}
      this.currentItem=null;this.currentKind='none';this.state();
    }
  }
}

function URLSafe(value){try{return new URL(String(value||''));}catch{return{hash:''};}}
module.exports={AutomationEngine,selectGpuRequestIndex,exclusiveEligibilityState,exclusiveSourceArticle};
