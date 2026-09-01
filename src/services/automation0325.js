'use strict';

const {AutomationEngine:Automation0324,applyClosings,articleAccess,buildExclusivePublicArticle,exclusiveContextSufficient}=require('./automation0324');
const {STATUS_INSUFFICIENT}=require('./editorial');
const {fetchArticleMetadata}=require('./articleMetadata0324');
const {storyKey,baseStoryKey}=require('./storyKey0324');

const wait=ms=>new Promise(r=>setTimeout(r,ms));
const isNews=x=>x&&['rss','generated'].includes(x.sourceType||'rss');
const isLiveUrl=url=>/lbposting|liveblog|live-blog|live_blog/i.test(String(url||''));
const clamp=(n,min,max,fallback)=>{n=Number(n);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;};
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
    this.selectionRecent=[];this.urlFailures=new Map();this.feedFailures=new Map();this.liveBaseCooldown=new Map();
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
  schedulerState(settings=this.getSettings()||{}){const every=clamp(settings.automation?.exclusiveEveryNews,0,20,4),needed=every>1?Math.max(0,(every-1)-Math.max(0,this.newsSinceExclusive)):0;return{everyNews:every,hasEmittedExclusive:this.exclusiveHasEmitted,newsSinceExclusive:this.newsSinceExclusive,nonExclusiveNeeded:needed,due:every>0&&this.newsSinceExclusive>=Math.max(0,every-1)};}
  recordExclusiveEmission(item){
    if(item?.result?.isExclusive||item?.isExclusive){this.exclusiveHasEmitted=true;this.newsSinceExclusive=0;}else this.newsSinceExclusive=Math.max(0,Number(this.newsSinceExclusive)||0)+1;
    try{this.history?.setAutomationState?.({exclusiveHasEmitted:this.exclusiveHasEmitted,newsSinceExclusive:this.newsSinceExclusive});}catch{}
  }
  knownExclusive(story,s){return accessForcedExclusive(story,s)||story?.isExclusive===true||String(story?.accessStatus||'')==='SUBSCRIBER_ONLY';}
  hasExclusiveInPipeline(){return(this.queue||[]).some(x=>isNews(x)&&!['EMITIDA','ERROR'].includes(x.status)&&!!(x.isExclusive||x.result?.isExclusive));}
  needsExclusiveReserve(s){const every=clamp(s?.automation?.exclusiveEveryNews,0,20,4);return every>0&&!this.hasExclusiveInPipeline();}
  urlOnCooldown(story){const key=baseStoryKey(story),until=Number(this.urlFailures.get(key)?.until||0),liveUntil=Number(this.liveBaseCooldown.get(key)||0);return until>Date.now()||liveUntil>Date.now();}
  feedOnCooldown(story){return Number(this.feedFailures.get(String(story?.feedId||''))?.until||0)>Date.now();}
  eligible(story,s){
    if(!story?.link||this.queuedUrls.has(story.link)||!this.isFeedActive(story,s)||this.isOmittedBlocked(story)||this.urlOnCooldown(story)||this.feedOnCooldown(story))return false;
    if((this.queue||[]).some(x=>baseStoryKey(x.story)===baseStoryKey(story)&&!['EMITIDA','ERROR'].includes(x.status)))return false;
    if(s.automation?.avoidRepeats&&this.history.has(story.link)&&!isLiveUrl(story.link))return false;
    const maxAge=(Number(s.automation?.maxAgeHours)||6)*3600000,now=Date.now(),t=Date.parse(story.pubDate||'');if(t&&t>now+10*60000)return false;if(t&&now-t>maxAge&&!isLiveUrl(story.link))return false;return true;
  }
  scoreCandidate(story,s){
    const now=Date.now(),t=Date.parse(story.pubDate||'')||now,ageMin=Math.max(0,(now-t)/60000),feedId=String(story.feedId||''),recent=this.selectionRecent.slice(-8),recentCount=recent.filter(x=>x===feedId).length,queuedCount=(this.queue||[]).filter(x=>String(x.story?.feedId||'')===feedId&&isNews(x)&&!['EMITIDA','ERROR'].includes(x.status)).length;
    let score=1000-Math.min(900,ageMin*.9)-recentCount*135-queuedCount*70;
    const exclusive=this.knownExclusive(story,s),reserve=this.needsExclusiveReserve(s),sched=this.schedulerState(s);if(exclusive&&reserve)score+=650;if(exclusive&&sched.due)score+=260;if(recent.at(-1)===feedId)score-=100;
    return score;
  }
  candidateFrom(items,s,options={}){
    const eligible=(items||[]).filter(x=>this.eligible(x,s)&&(!options.exclusiveOnly||this.knownExclusive(x,s)));if(!eligible.length)return null;
    let best=null,bestScore=-Infinity;for(const x of eligible){const score=this.scoreCandidate(x,s);if(score>bestScore){best=x;bestScore=score;}}
    if(best){best.__ecSelectionScore=Math.round(bestScore);best.__ecSelectionReason=this.knownExclusive(best,s)&&this.needsExclusiveReserve(s)?'reserva exclusiva':'actualidad + variedad de fuente';}
    return best;
  }
  async runStage(kind,fn){
    const tailKey=kind==='ai'?'aiStageTail':'voiceStageTail',busyKey=kind==='ai'?'aiStageBusy':'voiceStageBusy',previous=this[tailKey]||Promise.resolve();
    const task=previous.then(async()=>{this[busyKey]=true;if(kind==='voice')this.localHeavyRunning=true;this.state();try{return await fn();}finally{this[busyKey]=false;if(kind==='voice')this.localHeavyRunning=false;this.state();}});this[tailKey]=task.catch(()=>{});return task;
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
      const s=this.getSettings(),target=Math.max(1,Math.min(30,Number(s.automation?.bufferReady)||15)),readyCount=this.readyItems().length,reserveMissing=this.needsExclusiveReserve(s),desired=target+(reserveMissing?1:0),maxWorkers=2;
      if(this.inFlight.size>=maxWorkers||readyCount+this.inFlight.size>=desired){this.processingNotice=readyCount>=target?`Reserva lista: ${readyCount}/${target} noticias · pipeline escalonado activo.`:`Preparando reserva: ${readyCount}/${target} listas · ${this.inFlight.size} en proceso.`;this.kickDocumentWorker();await wait(280);continue;}
      const maxQueue=Math.max(target+2,Math.min(60,Number(s.automation?.queueMax)||30)),activeCount=this.queue.filter(x=>!x.history&&x.status!=='EMITIDA').length;if(activeCount>=maxQueue){await wait(450);continue;}
      await this.refreshFeedCache(s,false);let exclusiveOnly=readyCount>=target&&reserveMissing,candidate=this.candidateFrom(this.cachedItems,s,{exclusiveOnly});if(!candidate&&Date.now()-this.lastFeedFetchAt>15000){await this.refreshFeedCache(s,true);candidate=this.candidateFrom(this.cachedItems,s,{exclusiveOnly});}
      if(!candidate&&exclusiveOnly){this.processingNotice=`Reserva lista: ${readyCount}/${target}. Buscando una exclusiva disponible sin detener la emisión.`;this.state();await wait(1200);continue;}
      if(!candidate){if(!this.lastNoRssAt)this.lastNoRssAt=Date.now();this.processingNotice='No hay noticias nuevas elegibles; esperando actualización de las fuentes.';this.state();this.kickDocumentWorker();await wait(1800);continue;}
      this.lastNoRssAt=0;this.processingNotice=`Preparando reserva: ${readyCount}/${target} listas · pipeline escalonado.`;this.launchCandidate(candidate,s,epoch);await wait(100);
    }catch(e){this.emit('engine-error',e);await wait(900);}}
  }
  launchCandidate(candidate,s,epoch){
    if(!this.isFeedActive(candidate,this.getSettings()||s))return;this.queuedUrls.add(candidate.link);const forcedExclusive=this.knownExclusive(candidate,s),holder={id:`rss-${Date.now()}-${Math.random().toString(16).slice(2)}`,sourceType:'rss',story:candidate,status:'PROCESANDO',attempts:[],metrics:null,stage:'article',outputRetries:0,isExclusive:forcedExclusive,accessStatus:forcedExclusive?'SUBSCRIBER_ONLY':'',uiVisible:false,selectionScore:Number(candidate.__ecSelectionScore)||0,selectionReason:String(candidate.__ecSelectionReason||'')};
    this.queue.push(holder);this.selectionRecent.push(String(candidate.feedId||''));this.selectionRecent=this.selectionRecent.slice(-12);this.setNewsStatus(candidate,'PROCESANDO',{isExclusive:forcedExclusive,accessStatus:holder.accessStatus});this.state();
    const task=(async()=>{try{
      const outcome=await this.process(candidate,s,holder,epoch);if(outcome?.omitted){this.markOmitted(holder.story||candidate,outcome.reason||'fuente insuficiente');this.setNewsStatus(holder.story||candidate,'OMITIDA',{reason:outcome.reason||'fuente insuficiente',isExclusive:!!holder.isExclusive,accessStatus:holder.accessStatus,eventId:holder.article?.eventId||''});this.removeItem(holder);return;}
      Object.assign(holder,outcome);this.assertProcessingActive(epoch);holder.status='LISTA';holder.stage='ready';holder.uiVisible=true;holder.error='';this.omissionStreak=0;this.setNewsStatus(holder.story,'LISTA',{isExclusive:!!holder.result?.isExclusive,accessStatus:holder.result?.accessStatus||holder.accessStatus,eventId:holder.article?.eventId||''});
    }catch(e){
      if(e?.code==='PROCESSING_CANCELLED')this.removeItem(holder);else if(this.isEditorialFailure(e)){this.markOmitted(holder.story||candidate,'generación inválida tras 2 intentos');this.setNewsStatus(holder.story||candidate,'OMITIDA',{reason:'generación inválida tras 2 intentos',isExclusive:!!holder.isExclusive,accessStatus:holder.accessStatus,eventId:holder.article?.eventId||''});this.removeItem(holder);}else{
        if(this.isVoiceInfrastructureFailure(e,holder))this.haltProcessingForVoiceError(e);const reason=String(e?.message||e||'Error');this.addEmissionHistory('rss',candidate.title||'Noticia','ERROR',{reason,error:reason,feedName:sourceName(candidate),category:String(candidate.category||'Actualidad'),storyKey:storyKey(candidate),baseKey:baseStoryKey(candidate),storyUrl:String(candidate.link||''),isExclusive:!!holder.isExclusive});this.setNewsStatus(holder.story||candidate,'ERROR',{reason,isExclusive:!!holder.isExclusive,accessStatus:holder.accessStatus,eventId:holder.article?.eventId||''});this.emit('error-item',{title:candidate.title,error:reason,details:e.details,stage:holder.stage});this.removeItem(holder);
      }
    }finally{this.inFlight.delete(task);if(!this.processingRunning&&!this.inFlight.size&&!this.voiceFailureLatched)this.processingNotice='Preparación de noticias detenida.';this.state();this.kickDocumentWorker();}})();this.inFlight.add(task);
  }
  async process(story,s,holder,epoch){
    holder.stage='article';this.state();let article;try{article=await this.fetchArticleRetry(story);}catch(e){e.message=`Artículo: ${String(e?.message||e)}`;throw e;}holder.article=article;this.assertProcessingActive(epoch);if(!this.isFeedActive(story,this.getSettings()||s))return{omitted:true,reason:'fuente pausada o eliminada'};
    let access=articleAccess(story,article,s);if(accessForcedExclusive(story,s))access={...access,status:'SUBSCRIBER_ONLY',exclusive:true,override:'exclusive'};else if(accessForcedPublic(story,s)&&!article?.access?.signals?.strongLock)access={...access,status:'PUBLIC',exclusive:false,override:'public'};
    if(!story.pubDate||access.exclusive||String(article?.access?.status||'')==='UNKNOWN'){
      try{const meta=await fetchArticleMetadata(article.finalUrl||story.link);if(meta.pubDate&&!article.pubDate)article.pubDate=meta.pubDate;if(meta.publicPreview&&!article.publicPreview)article.publicPreview=meta.publicPreview;if(meta.strongLock){article.isExclusive=true;article.access={...(article.access||{}),status:'SUBSCRIBER_ONLY',confidence:'high',signals:{...(article.access?.signals||{}),strongLock:true}};}}catch{}
      access=articleAccess(story,article,s);if(accessForcedExclusive(story,s))access={...access,status:'SUBSCRIBER_ONLY',exclusive:true,override:'exclusive'};
    }
    holder.isExclusive=access.exclusive;holder.accessStatus=access.status;if(!story.pubDate&&article.pubDate){holder.story={...holder.story,pubDate:article.pubDate};story=holder.story;}
    if(article.isLiveBlog&&article.liveblogNoEvent)return{omitted:true,reason:'liveblog sin evento factual nuevo'};if(['DEFECTIVE','INSUFFICIENT'].includes(article.contentState)&&!(article.isLiveBlog&&article.liveEvent)&&!access.exclusive)return{omitted:true,reason:'extracción de artículo insuficiente'};
    if(article.eventId){const original=story.link,eventLink=`${original}#ec-event=${encodeURIComponent(article.eventId)}`;if(s.automation?.avoidRepeats&&this.history.has(eventLink))return{omitted:true,reason:'evento del liveblog ya emitido'};holder.originalLink=original;holder.story={...holder.story,link:eventLink};story=holder.story;}
    let sourceArticle=article;if(access.exclusive){if(!exclusiveContextSufficient(story,article))return{omitted:true,reason:'información pública insuficiente'};sourceArticle=buildExclusivePublicArticle(story,article);}
    holder.uiVisible=true;holder.stage='ai';this.setNewsStatus(story,'PROCESANDO',{isExclusive:access.exclusive,accessStatus:access.status,eventId:article.eventId||''});this.state();
    const image=story.image||article.image||this.getFallbackUrl();let editorial;try{editorial=await this.runStage('ai',async()=>{const ai=await this.providers.generate(story,sourceArticle,s);this.assertProcessingActive(epoch);holder.provider=ai.provider;holder.model=ai.model;holder.attempts=ai.attempts||[];holder.metrics=ai.metrics||null;if(ai.result.status===STATUS_INSUFFICIENT)return{ai,omitted:true};const closing=applyClosings(story,article,ai.result,s),result=closing.result;holder.isExclusive=!!result.isExclusive;holder.accessStatus=result.accessStatus||access.status;holder.stage='pronunciation';this.state();const spoken=locutionSource(result.title||story.title,closing.spokenScript||result.script);let locution={text:spoken,elapsedMs:0,smartUsed:false,smartFailed:false};if(this.pronunciation)locution=await this.pronunciation.normalize(spoken,{smart:s.tts?.pronunciationSmart!==false});this.assertProcessingActive(epoch);holder.metrics={...(holder.metrics||{}),pronunciationElapsedMs:locution.elapsedMs||0,pronunciationSmart:!!locution.smartUsed,pronunciationSmartFailed:!!locution.smartFailed,pronunciationSmartError:locution.smartFailed?String(locution.smartError||'').slice(0,180):'',pronunciationClaude:!!locution.claudeUsed,pronunciationLearned:locution.learnedCount||0};return{ai,result,locution};});}catch(e){e.message=`IA/Pronunciación: ${String(e?.message||e)}`;throw e;}
    if(editorial?.omitted)return{omitted:true,reason:access.exclusive?'información pública insuficiente':'fuente insuficiente'};const {ai,result,locution}=editorial;
    holder.stage='tts';this.state();let audio;try{audio=await this.runStage('voice',()=>this.kokoro.generate(locution.text,{voice:s.tts.voice,speed:s.tts.speed}));}catch(e){e.message=`Voz: ${String(e?.message||e)}`;e.details=ai.attempts||[];throw e;}try{this.assertProcessingActive(epoch);}catch(e){this.kokoro?.cleanupAudio?.(audio.path);throw e;}holder.metrics={...(holder.metrics||{}),ttsElapsedMs:audio.elapsedMs||0,ttsThreads:audio.threads||2,audioDurationSec:audio.durationSec||0,ttsRealtimeFactor:audio.realtimeFactor||0,ttsProfile:audio.performanceLabel||audio.performanceProfile||'',ttsPersistent:!!audio.persistent,ttsWorkerStartupMs:audio.workerStartupMs||0};
    return{article,provider:ai.provider,model:ai.model,result:{...result,ttsScript:locution.text},attempts:ai.attempts||[],metrics:holder.metrics,audio,image,fallback:this.getFallbackUrl(),isExclusive:!!result.isExclusive,accessStatus:result.accessStatus||access.status};
  }
  chooseReadyItem(queue=this.queue,s=this.getSettings()||{}){
    const ready=(queue||[]).filter(x=>x.status==='LISTA');if(!ready.length)return null;const every=clamp(s.automation?.exclusiveEveryNews,0,20,4);if(!every)return ready[0];const due=this.newsSinceExclusive>=Math.max(0,every-1),exclusive=ready.find(x=>!!(x.result?.isExclusive||x.isExclusive)),publicItem=ready.find(x=>!(x.result?.isExclusive||x.isExclusive));if(due&&exclusive)return exclusive;if(!due&&publicItem)return publicItem;return ready[0];
  }
  displayQueue(settings){
    const rows=super.displayQueue(settings),active=new Map((this.queue||[]).map(x=>[x.id,x]));return rows.filter(row=>{const item=row.id?active.get(row.id):null;return !(item&&item.status==='PROCESANDO'&&!item.uiVisible);}).map(row=>{const item=row.id?active.get(row.id):null;if(item){return{...row,isExclusive:!!(item.result?.isExclusive||item.isExclusive),accessStatus:item.result?.accessStatus||item.accessStatus||item.article?.access?.status||'',feedName:sourceName(item.story),feedId:String(item.story?.feedId||''),category:sectionName(item),storyKey:storyKey(item.story),baseKey:baseStoryKey(item.story),storyUrl:String(item.story?.link||''),selectionScore:Number(item.selectionScore)||0,selectionReason:String(item.selectionReason||'')};}return row;});
  }
  snapshot(extra={}){const s=super.snapshot(extra);return{...s,processing:{...s.processing,pipelineWorkers:this.inFlight.size,aiBusy:this.aiStageBusy,voiceBusy:this.voiceStageBusy,pipelineMode:'staggered-2'},selector:{recentFeeds:this.selectionRecent.slice(-8),urlCooldowns:[...this.urlFailures.values()].filter(x=>Number(x.until)>Date.now()).length,feedCooldowns:[...this.feedFailures.values()].filter(x=>Number(x.until)>Date.now()).length}};}
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
module.exports={AutomationEngine};
