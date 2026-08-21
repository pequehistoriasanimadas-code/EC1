const {EventEmitter}=require('events');

const wait=ms=>new Promise(r=>setTimeout(r,ms));
function locutionSource(title,script){
  const t=String(title||'').trim();
  const s=String(script||'').trim();
  if(!t)return s;if(!s)return t;
  const clean=x=>x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
  const ct=clean(t),cs=clean(s.slice(0,Math.max(t.length*2,220)));
  if(ct&&cs.startsWith(ct))return s;
  return `${t}. ${s}`;
}
function cancelError(){const e=new Error('Procesamiento cancelado');e.code='PROCESSING_CANCELLED';return e;}

class AutomationEngine extends EventEmitter {
  constructor({rss,fetchArticle,providers,kokoro,pronunciation,canned,ads,history,getSettings,getFallbackUrl,sendAutomaticOutput,isOutputReady,controlOutput}) {
    super();
    Object.assign(this,{rss,fetchArticle,providers,kokoro,pronunciation,canned,ads,history,getSettings,getFallbackUrl,sendAutomaticOutput,isOutputReady,controlOutput});
    this.processingRunning=false;this.processingPaused=false;this.processingNotice='';
    this.emissionRunning=false;this.emissionPaused=false;
    this.queue=[];this.queuedUrls=new Set();this.playbackResolve=null;
    this.currentItem=null;this.currentKind='none';this.currentCanned=null;
    this.cachedItems=[];this.lastFeedFetchAt=0;this.processingEpoch=0;this.emissionEpoch=0;
    this.inFlight=new Set();this.localHeavyTail=Promise.resolve();
    this.newsEmitted=0;this.cannedPlayed=0;this.adsPlayed=0;
    this.scheduledNewsTotal=0;this.lastScheduledCannedAt=-1;
    this.cannedRequested=false;this.cannedUnavailableUntil=0;this.adsUnavailableUntil=0;
  }

  scheduledProgress(interval){
    const every=Math.max(0,Math.min(999,Number(interval)||0));
    const total=Math.max(0,Number(this.scheduledNewsTotal)||0);
    if(!every)return{due:false,nextIn:null,remainder:0,total};
    if(!total)return{due:false,nextIn:every,remainder:0,total};
    const remainder=total%every;
    const alreadyServed=this.lastScheduledCannedAt===total;
    return{due:remainder===0&&!alreadyServed,nextIn:remainder===0?(alreadyServed?every:0):every-remainder,remainder,total};
  }
  snapshot(extra={}) {
    const counts={processing:0,ready:0,onAir:0,emitted:0,error:0};
    for(const x of this.queue){
      if(x.status==='PROCESANDO')counts.processing++;
      else if(x.status==='LISTA')counts.ready++;
      else if(x.status==='AL AIRE')counts.onAir++;
      else if(x.status==='EMITIDA')counts.emitted++;
      else if(x.status==='ERROR')counts.error++;
    }
    const ready=this.queue.filter(x=>x.status==='LISTA');
    const avgSec=ready.length?ready.reduce((a,x)=>a+Math.max(10,Number(x.audio?.durationSec)||60),0)/ready.length:60;
    const settings=this.getSettings()||{};
    const target=Math.max(1,Math.min(30,Number(settings.automation?.bufferReady)||15));
    const interval=Math.max(0,Math.min(999,Number(settings.canned?.interval)||0));
    const cannedEnabled=!!settings.canned?.enabled;
    const progress=this.scheduledProgress(interval);
    const adsFolder=String(settings.canned?.adsFolder||'').trim();
    const insertAd=settings.canned?.insertAdAfterContent!==false;
    return {
      processing:{running:this.processingRunning,paused:this.processingPaused,pipelineWorkers:this.inFlight.size,message:this.processingNotice},
      emission:{running:this.emissionRunning,paused:this.emissionPaused,currentTitle:this.currentItem?.story?.title||this.currentCanned?.name||'',currentKind:this.currentKind},
      counts,
      session:{newsEmitted:this.newsEmitted,cannedEmitted:this.cannedPlayed,adsEmitted:this.adsPlayed},
      buffer:{target,ready:counts.ready,autonomyMin:Number((counts.ready*avgSec/60).toFixed(1))},
      canned:{
        enabled:cannedEnabled,emergency:settings.canned?.emergency!==false,interval,
        newsSince:progress.remainder,nextIn:cannedEnabled?progress.nextIn:null,requested:this.cannedRequested,
        played:this.cannedPlayed,current:this.currentKind==='canned'?(this.currentCanned?.name||''):'',scheduledTotal:this.scheduledNewsTotal,lastScheduledAt:this.lastScheduledCannedAt
      },
      ads:{enabled:cannedEnabled&&insertAd&&!!adsFolder,insertAfterCanned:insertAd,folderConfigured:!!adsFolder,played:this.adsPlayed,current:this.currentKind==='ad'?(this.currentCanned?.name||''):''},
      queue:this.queue.map(x=>({
        title:x.story.title,status:x.status,provider:x.provider||'',model:x.model||'',attempts:x.attempts||[],metrics:x.metrics||null,
        error:x.error||'',stage:x.stage||'',outputRetries:x.outputRetries||0
      })),
      ...extra
    };
  }
  state(extra={}){this.emit('state',this.snapshot(extra));}
  getState(){return this.snapshot();}
  resetSessionCounters(){
    this.newsEmitted=0;this.cannedPlayed=0;this.adsPlayed=0;
    this.state({notice:'Contadores visibles de la sesión reiniciados; la programación de contenidos no se altera.'});
    return this.snapshot();
  }
  assertProcessingActive(epoch){if(!this.processingRunning||epoch!==this.processingEpoch)throw cancelError();}
  cleanupItemAudio(item){try{if(item?.audio?.path)this.kokoro?.cleanupAudio?.(item.audio.path);}catch{}}
  removeItem(item){this.cleanupItemAudio(item);this.queue=this.queue.filter(x=>x!==item);if(item?.story?.link)this.queuedUrls.delete(item.story.link);}

  startProcessing(){
    if(this.processingRunning){if(this.processingPaused)return this.resumeProcessing();this.state();return this.snapshot();}
    this.processingRunning=true;this.processingPaused=false;this.processingNotice='Preparando buffer de noticias.';
    const epoch=++this.processingEpoch;this.state();this.producer(epoch);return this.snapshot();
  }
  pauseProcessing(){
    this.processingPaused=true;
    this.processingNotice=this.inFlight.size?`Pausado: ${this.inFlight.size} trabajo(s) ya iniciados terminarán antes de quedar en reposo.`:'Procesamiento pausado.';
    this.state();return this.snapshot();
  }
  resumeProcessing(){
    if(!this.processingRunning)return this.startProcessing();
    this.processingPaused=false;this.processingNotice='Procesamiento reanudado.';this.state();return this.snapshot();
  }
  stopProcessing(){
    this.processingRunning=false;this.processingPaused=false;this.processingEpoch++;
    this.processingNotice=this.inFlight.size?`Deteniendo: ${this.inFlight.size} trabajo(s) en curso se cancelarán al finalizar su etapa actual.`:'Procesamiento detenido.';
    this.state();return this.snapshot();
  }

  startEmission(){
    if(!this.isOutputReady())throw new Error('OUTPUT_NOT_OPEN');
    if(this.emissionRunning){if(this.emissionPaused)return this.resumeEmission();this.state();return this.snapshot();}
    this.emissionRunning=true;this.emissionPaused=false;const epoch=++this.emissionEpoch;this.state();this.consumer(epoch);return this.snapshot();
  }
  pauseEmission(){this.emissionPaused=true;this.state();return this.snapshot();}
  resumeEmission(){
    if(!this.isOutputReady())throw new Error('OUTPUT_NOT_OPEN');
    if(!this.emissionRunning)return this.startEmission();
    this.emissionPaused=false;this.state();return this.snapshot();
  }
  stopEmission(){
    this.emissionRunning=false;this.emissionPaused=false;this.emissionEpoch++;
    if(this.currentKind!=='none'){try{this.controlOutput('stop');}catch{}this.finishPlayback('stopped');}
    this.cannedRequested=false;this.state();return this.snapshot();
  }
  interruptForManual(){
    if(!this.emissionRunning)return;
    this.emissionPaused=true;if(this.currentKind!=='none'){try{this.controlOutput('stop');}catch{}this.finishPlayback('interrupted');}
    this.state({notice:'Emisión automática pausada por contenido manual'});
  }
  outputClosed(){
    if(this.emissionRunning){this.emissionPaused=true;if(this.currentKind!=='none')this.finishPlayback('closed');this.state({notice:'Output cerrado; emisión automática pausada'});}
  }
  outputPlayback(event={}){if(event.source!=='automatic')return;if(event.type==='ended')this.finishPlayback('ended');if(event.type==='error')this.finishPlayback('error');}
  finishPlayback(reason){if(this.playbackResolve){const r=this.playbackResolve;this.playbackResolve=null;r(reason);}}
  clearQueue(){
    if(this.currentKind!=='none')throw new Error('No se puede vaciar la cola mientras hay contenido al aire');
    if(this.inFlight.size)throw new Error('Espera a que terminen las noticias que están procesándose');
    for(const item of this.queue)this.cleanupItemAudio(item);
    this.queue=[];this.queuedUrls.clear();this.state();return this.snapshot();
  }
  requestCannedNow(){
    const s=this.getSettings();
    if(!s.canned?.enabled)throw new Error('ENLATADOS_DISABLED');
    if(!String(s.canned?.folder||'').trim())throw new Error('CANNED_FOLDER_MISSING');
    if(!this.emissionRunning)throw new Error('EMISSION_NOT_RUNNING');
    this.cannedRequested=true;
    this.state({notice:this.currentKind==='none'?'Contenido solicitado':'Contenido programado para salir al terminar el contenido actual'});
    return this.snapshot();
  }

  candidateFrom(items,s){
    const maxAge=(s.automation.maxAgeHours||6)*3600000;const now=Date.now();
    return items.find(x=>{
      if(!x?.link||this.queuedUrls.has(x.link))return false;
      if(s.automation.avoidRepeats&&this.history.has(x.link))return false;
      const t=Date.parse(x.pubDate||'');
      if(t&&t>now+10*60000)return false;
      if(t&&now-t>maxAge)return false;
      return true;
    });
  }
  async refreshFeedCache(s,force=false){
    const interval=Math.max(15000,(s.automation.updateMinutes||2)*60000);
    if(!force&&this.cachedItems.length&&Date.now()-this.lastFeedFetchAt<interval)return;
    const {items,errors,feedStatus}=await this.rss.loadAll(s.rssFeeds);
    this.cachedItems=items;this.lastFeedFetchAt=Date.now();this.state({rssErrors:errors,feedStatus});
  }
  runLocalHeavy(fn){const task=this.localHeavyTail.then(fn,fn);this.localHeavyTail=task.catch(()=>{});return task;}

  launchCandidate(candidate,s,epoch){
    this.queuedUrls.add(candidate.link);
    const holder={story:candidate,status:'PROCESANDO',attempts:[],metrics:null,stage:'article',outputRetries:0};
    this.queue.push(holder);this.state();
    const task=(async()=>{
      try{
        Object.assign(holder,await this.process(candidate,s,holder,epoch));
        this.assertProcessingActive(epoch);holder.status='LISTA';holder.stage='ready';holder.error='';
      }catch(e){
        if(e?.code==='PROCESSING_CANCELLED'){this.removeItem(holder);}
        else{holder.status='ERROR';holder.error=e.message;holder.attempts=e.details||holder.attempts||[];this.emit('error-item',{title:candidate.title,error:e.message,details:e.details,stage:holder.stage});}
      }finally{
        this.inFlight.delete(task);
        if(!this.processingRunning&&!this.inFlight.size)this.processingNotice='Procesamiento detenido.';
        this.state();
      }
    })();
    this.inFlight.add(task);
  }

  async producer(epoch){
    while(this.processingRunning&&epoch===this.processingEpoch){
      try{
        if(this.processingPaused){await wait(400);continue;}
        const s=this.getSettings();
        const target=Math.max(1,Math.min(30,Number(s.automation.bufferReady)||15));
        const readyCount=this.queue.filter(x=>x.status==='LISTA').length;
        const workers=s.ai.primary==='local'?1:2;
        const availableSlots=Math.max(0,target-readyCount);
        const allowedWorkers=Math.min(workers,availableSlots);
        if(readyCount>=target||allowedWorkers<=0||this.inFlight.size>=allowedWorkers){
          this.processingNotice=readyCount>=target?`Buffer listo: ${readyCount}/${target} noticias preparadas.`:`Preparando buffer: ${readyCount}/${target} listas.`;
          await wait(350);continue;
        }
        const maxQueue=Math.max(target,Math.min(60,Number(s.automation.queueMax)||30));
        if(this.queue.length>=maxQueue){
          const remove=this.queue.find(x=>x.status==='ERROR');
          if(remove)this.removeItem(remove);else{await wait(700);continue;}
        }
        await this.refreshFeedCache(s,false);
        let candidate=this.candidateFrom(this.cachedItems,s);
        if(!candidate&&Date.now()-this.lastFeedFetchAt>15000){await this.refreshFeedCache(s,true);candidate=this.candidateFrom(this.cachedItems,s);}
        if(!candidate){this.processingNotice='Sin noticias nuevas elegibles; esperando actualización RSS.';this.state();await wait(2500);continue;}
        this.processingNotice=`Preparando buffer: ${readyCount}/${target} listas.`;
        this.launchCandidate(candidate,s,epoch);await wait(120);
      }catch(e){this.emit('engine-error',e);await wait(1200);}
    }
  }

  async process(story,s,holder,epoch){
    let article;
    holder.stage='article';this.state();
    try{article=await this.fetchArticle(story.link);}catch(e){e.message=`Artículo: ${e.message}`;throw e;}
    this.assertProcessingActive(epoch);
    const image=story.image||article.image||this.getFallbackUrl();
    holder.stage='ai';this.state();
    let ai;
    try{ai=await this.providers.generate(story,article,s);}catch(e){e.message=`IA: ${e.message}`;throw e;}
    this.assertProcessingActive(epoch);
    holder.provider=ai.provider;holder.model=ai.model;holder.attempts=ai.attempts||[];holder.metrics=ai.metrics||null;

    const local=await this.runLocalHeavy(async()=>{
      this.assertProcessingActive(epoch);holder.stage='pronunciation';this.state();
      const spoken=locutionSource(ai.result.title||story.title,ai.result.script);
      let locution={text:spoken,elapsedMs:0,smartUsed:false,smartFailed:false};
      if(this.pronunciation)locution=await this.pronunciation.normalize(spoken,{smart:s.tts?.pronunciationSmart!==false});
      this.assertProcessingActive(epoch);
      holder.metrics={...(holder.metrics||{}),pronunciationElapsedMs:locution.elapsedMs||0,pronunciationSmart:!!locution.smartUsed,pronunciationSmartFailed:!!locution.smartFailed,pronunciationSmartError:locution.smartFailed?String(locution.smartError||'').slice(0,180):'',pronunciationClaude:!!locution.claudeUsed,pronunciationLearned:locution.learnedCount||0};
      holder.stage='tts';this.state();
      let audio;
      try{audio=await this.kokoro.generate(locution.text,{voice:s.tts.voice,speed:s.tts.speed});}
      catch(e){e.message=`Kokoro: ${e.message}`;e.details=ai.attempts||[];throw e;}
      try{this.assertProcessingActive(epoch);}catch(e){this.kokoro?.cleanupAudio?.(audio.path);throw e;}
      holder.metrics={...(holder.metrics||{}),ttsElapsedMs:audio.elapsedMs||0,ttsThreads:audio.threads||2,audioDurationSec:audio.durationSec||0,ttsRealtimeFactor:audio.realtimeFactor||0,ttsProfile:audio.performanceLabel||audio.performanceProfile||''};
      return{locution,audio};
    });
    return{article,provider:ai.provider,model:ai.model,result:{...ai.result,ttsScript:local.locution.text},attempts:ai.attempts||[],metrics:holder.metrics,audio:local.audio,image,fallback:this.getFallbackUrl()};
  }

  cannedReason(s,hasReadyNews){
    const c=s.canned||{};if(!c.enabled)return'';
    if(this.cannedRequested)return'manual';
    const progress=this.scheduledProgress(c.interval);
    if(progress.due&&Date.now()>=this.cannedUnavailableUntil)return'scheduled';
    if(!hasReadyNews&&c.emergency!==false&&Date.now()>=this.cannedUnavailableUntil)return'emergency';
    return'';
  }
  async waitPlayback(maxMs){
    const result=await Promise.race([new Promise(resolve=>{this.playbackResolve=resolve;}),wait(maxMs).then(()=> 'timeout')]);
    this.playbackResolve=null;return result;
  }
  async playCanned(s,reason){
    let media;
    try{media=this.canned?.pick(s.canned?.folder||'');}
    catch(e){
      this.cannedUnavailableUntil=Date.now()+30000;if(reason==='manual')this.cannedRequested=false;
      this.emit('error-item',{title:'Contenidos',error:e.message||'No hay videos disponibles',stage:'canned'});
      this.state({notice:'No hay un contenido disponible; la emisión continúa normalmente.'});return false;
    }
    if(!media)return false;
    this.currentKind='canned';this.currentCanned=media;this.currentItem=null;this.cannedRequested=false;
    this.state({notice:`Contenido al aire: ${media.name}`});
    const sent=this.sendAutomaticOutput({source:'automatic',kind:'canned',mediaRole:'content',title:media.name,videoUrl:media.url,cannedReason:reason});
    if(!sent){this.currentKind='none';this.currentCanned=null;this.emissionPaused=true;this.state({notice:'Output no disponible'});return false;}
    const result=await this.waitPlayback(6*60*60*1000);
    let completed=false;
    if(result==='ended'){
      completed=true;this.cannedPlayed++;
      if(reason==='scheduled')this.lastScheduledCannedAt=this.scheduledNewsTotal;
    }else if(result==='error'||result==='timeout'){
      this.emissionPaused=true;this.emit('error-item',{title:media.name,error:result==='timeout'?'Contenido: tiempo máximo excedido':'Contenido: no se pudo reproducir el video',stage:'canned'});
    }else if(result==='closed'||result==='interrupted')this.emissionPaused=true;
    this.currentKind='none';this.currentCanned=null;this.state();
    if(completed&&this.emissionRunning&&!this.emissionPaused)await this.playAdAfterCanned(this.getSettings()||s,reason);
    return completed;
  }
  async playAdAfterCanned(s,reason){
    const c=s.canned||{};const folder=String(c.adsFolder||'').trim();
    if(!folder||c.insertAdAfterContent===false||Date.now()<this.adsUnavailableUntil)return false;
    let media;
    try{media=this.ads?.pick(folder);}
    catch(e){
      this.adsUnavailableUntil=Date.now()+30000;this.emit('error-item',{title:'Anuncios',error:e.message||'No hay anuncios disponibles',stage:'ads'});
      this.state({notice:'No hay un anuncio disponible; la emisión continúa normalmente.'});return false;
    }
    if(!media)return false;
    this.adsUnavailableUntil=0;this.currentKind='ad';this.currentCanned=media;this.currentItem=null;
    this.state({notice:`Anuncio al aire: ${media.name}`});
    const sent=this.sendAutomaticOutput({source:'automatic',kind:'canned',mediaRole:'ad',title:media.name,videoUrl:media.url,cannedReason:`ad-after-${reason||'content'}`});
    if(!sent){this.currentKind='none';this.currentCanned=null;this.emissionPaused=true;this.state({notice:'Output no disponible'});return false;}
    const result=await this.waitPlayback(6*60*60*1000);
    if(result==='ended')this.adsPlayed++;
    else if(result==='error'||result==='timeout'){
      this.emissionPaused=true;this.emit('error-item',{title:media.name,error:result==='timeout'?'Anuncio: tiempo máximo excedido':'Anuncio: no se pudo reproducir el video',stage:'ads'});
    }else if(result==='closed'||result==='interrupted')this.emissionPaused=true;
    this.currentKind='none';this.currentCanned=null;this.state();return result==='ended';
  }

  async consumer(epoch){
    while(this.emissionRunning&&epoch===this.emissionEpoch){
      if(this.emissionPaused){await wait(300);continue;}
      if(!this.isOutputReady()){this.emissionPaused=true;this.state({notice:'Abre Output para continuar la emisión'});continue;}
      const s=this.getSettings();
      const anyReady=this.queue.some(x=>x.status==='LISTA');
      const reason=this.cannedReason(s,anyReady);
      if(reason){const played=await this.playCanned(s,reason);if(played)continue;}
      const item=this.queue.find(x=>x.status==='PROCESANDO'||x.status==='LISTA'||x.status==='AL AIRE');
      if(!item||item.status!=='LISTA'){await wait(300);continue;}

      this.currentItem=item;this.currentKind='news';this.currentCanned=null;item.status='AL AIRE';item.error='';this.state();
      const next=this.queue.find(x=>x!==item&&x.status==='LISTA');
      const p={source:'automatic',kind:'news',title:item.result.title||item.story.title,category:item.result.category||item.story.category||'ACTUALIDAD',pubDate:item.story.pubDate||item.article?.pubDate||'',summary:item.result.summary||'',script:item.result.script,image:item.image,preloadImage:next?.image||'',fallbackImage:item.fallback,audioUrl:item.audio.url,audioDurationSec:item.audio.durationSec||item.result.durationSec||60};
      const sent=this.sendAutomaticOutput(p);
      if(!sent){item.status='LISTA';this.currentItem=null;this.currentKind='none';this.emissionPaused=true;this.state({notice:'Output no disponible'});continue;}
      const expected=Math.max(10,Number(p.audioDurationSec)||60)*1000+15000;
      const result=await this.waitPlayback(expected);
      if(result==='ended'){
        this.history.add(item.story);item.status='EMITIDA';this.newsEmitted++;this.scheduledNewsTotal++;this.state();
        await wait((this.getSettings().visual.pauseSeconds||2.5)*1000);
        this.removeItem(item);
      }else if(result==='error'||result==='timeout'){
        try{this.controlOutput('stop');}catch{}
        item.outputRetries=(item.outputRetries||0)+1;item.error=result==='timeout'?'Output: el audio excedió el tiempo esperado':'Output: no se pudo reproducir el audio';
        if(item.outputRetries<=1){item.status='LISTA';this.state({notice:`Reintentando una vez: ${item.story.title}`});await wait(750);}
        else{item.status='ERROR';this.cleanupItemAudio(item);this.emit('error-item',{title:item.story.title,error:`${item.error}. Se omitió tras 1 reintento.`,stage:'output'});this.state({notice:'Una noticia con audio defectuoso fue omitida; continúa la siguiente.'});}
      }else{
        item.status='LISTA';if(result==='closed'||result==='interrupted')this.emissionPaused=true;
      }
      this.currentItem=null;this.currentKind='none';this.state();
    }
  }
}

module.exports={AutomationEngine,locutionSource};
