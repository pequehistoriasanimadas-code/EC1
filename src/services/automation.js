const {EventEmitter}=require('events');

const wait=ms=>new Promise(r=>setTimeout(r,ms));

class AutomationEngine extends EventEmitter {
  constructor({rss,fetchArticle,providers,kokoro,history,getSettings,getFallbackUrl,sendAutomaticOutput,isOutputReady,controlOutput}) {
    super();
    Object.assign(this,{rss,fetchArticle,providers,kokoro,history,getSettings,getFallbackUrl,sendAutomaticOutput,isOutputReady,controlOutput});
    this.processingRunning=false;
    this.processingPaused=false;
    this.emissionRunning=false;
    this.emissionPaused=false;
    this.queue=[];
    this.queuedUrls=new Set();
    this.playbackResolve=null;
    this.currentItem=null;
    this.cachedItems=[];
    this.lastFeedFetchAt=0;
    this.processingEpoch=0;
    this.emissionEpoch=0;
  }

  snapshot(extra={}) {
    const counts={processing:0,ready:0,onAir:0,emitted:0,error:0};
    for(const x of this.queue){
      if(x.status==='PROCESANDO') counts.processing++;
      else if(x.status==='LISTA') counts.ready++;
      else if(x.status==='AL AIRE') counts.onAir++;
      else if(x.status==='EMITIDA') counts.emitted++;
      else if(x.status==='ERROR') counts.error++;
    }
    return {
      processing:{running:this.processingRunning,paused:this.processingPaused},
      emission:{running:this.emissionRunning,paused:this.emissionPaused,currentTitle:this.currentItem?.story?.title||''},
      counts,
      queue:this.queue.map(x=>({
        title:x.story.title,
        status:x.status,
        provider:x.provider||'',
        model:x.model||'',
        attempts:x.attempts||[],
        metrics:x.metrics||null,
        error:x.error||'',
        stage:x.stage||''
      })),
      ...extra
    };
  }
  state(extra={}) { this.emit('state',this.snapshot(extra)); }
  getState(){ return this.snapshot(); }

  startProcessing(){
    if(this.processingRunning){
      if(this.processingPaused) return this.resumeProcessing();
      this.state();return this.snapshot();
    }
    this.processingRunning=true;
    this.processingPaused=false;
    const epoch=++this.processingEpoch;
    this.state();
    this.producer(epoch);
    return this.snapshot();
  }
  pauseProcessing(){this.processingPaused=true;this.state();return this.snapshot();}
  resumeProcessing(){
    if(!this.processingRunning) return this.startProcessing();
    this.processingPaused=false;this.state();return this.snapshot();
  }
  stopProcessing(){this.processingRunning=false;this.processingPaused=false;this.processingEpoch++;this.state();return this.snapshot();}

  startEmission(){
    if(!this.isOutputReady()) throw new Error('OUTPUT_NOT_OPEN');
    if(this.emissionRunning){
      if(this.emissionPaused) return this.resumeEmission();
      this.state();return this.snapshot();
    }
    this.emissionRunning=true;
    this.emissionPaused=false;
    const epoch=++this.emissionEpoch;
    this.state();
    this.consumer(epoch);
    return this.snapshot();
  }
  pauseEmission(){
    this.emissionPaused=true;
    this.state();
    return this.snapshot();
  }
  resumeEmission(){
    if(!this.isOutputReady()) throw new Error('OUTPUT_NOT_OPEN');
    if(!this.emissionRunning) return this.startEmission();
    this.emissionPaused=false;
    this.state();
    return this.snapshot();
  }
  stopEmission(){
    this.emissionRunning=false;
    this.emissionPaused=false;
    this.emissionEpoch++;
    if(this.currentItem){
      try{this.controlOutput('stop');}catch{}
      this.finishPlayback('stopped');
    }
    this.state();
    return this.snapshot();
  }
  interruptForManual(){
    if(!this.emissionRunning) return;
    this.emissionPaused=true;
    if(this.currentItem){
      try{this.controlOutput('stop');}catch{}
      this.finishPlayback('interrupted');
    }
    this.state({notice:'Emisión automática pausada por contenido manual'});
  }
  outputClosed(){
    if(this.emissionRunning){
      this.emissionPaused=true;
      if(this.currentItem) this.finishPlayback('closed');
      this.state({notice:'Output cerrado; emisión automática pausada'});
    }
  }
  outputPlayback(event={}){
    if(event.source!=='automatic') return;
    if(event.type==='ended') this.finishPlayback('ended');
    if(event.type==='error') this.finishPlayback('error');
  }
  finishPlayback(reason){
    if(this.playbackResolve){const r=this.playbackResolve;this.playbackResolve=null;r(reason);}
  }
  clearQueue(){
    if(this.currentItem) throw new Error('No se puede vaciar la cola mientras hay una noticia al aire');
    this.queue=[];
    this.queuedUrls.clear();
    this.state();
    return this.snapshot();
  }

  candidateFrom(items,s){
    const maxAge=(s.automation.maxAgeHours||6)*3600000;
    return items.find(x=>{
      if(!x?.link) return false;
      if(this.queuedUrls.has(x.link)) return false;
      if(s.automation.avoidRepeats&&this.history.has(x.link)) return false;
      const t=Date.parse(x.pubDate||'');
      if(t&&Date.now()-t>maxAge) return false;
      return true;
    });
  }

  async refreshFeedCache(s,force=false){
    const interval=Math.max(15000,(s.automation.updateMinutes||2)*60000);
    if(!force&&this.cachedItems.length&&Date.now()-this.lastFeedFetchAt<interval) return;
    const {items,errors,feedStatus}=await this.rss.loadAll(s.rssFeeds);
    this.cachedItems=items;
    this.lastFeedFetchAt=Date.now();
    this.state({rssErrors:errors,feedStatus});
  }

  async producer(epoch){
    while(this.processingRunning&&epoch===this.processingEpoch){
      try{
        if(this.processingPaused){await wait(500);continue;}
        const s=this.getSettings();
        const target=Math.max(1,Math.min(10,s.automation.bufferReady||5));
        const readyAhead=this.queue.filter(x=>x.status==='LISTA'||x.status==='PROCESANDO').length;
        if(readyAhead>=target){await wait(800);continue;}

        const maxQueue=Math.max(target,Math.min(30,s.automation.queueMax||12));
        if(this.queue.length>=maxQueue){
          const errors=this.queue.filter(x=>x.status==='ERROR');
          if(errors.length){
            const remove=errors[0];this.queue=this.queue.filter(x=>x!==remove);this.queuedUrls.delete(remove.story.link);
          } else {await wait(1000);continue;}
        }

        await this.refreshFeedCache(s,false);
        let candidate=this.candidateFrom(this.cachedItems,s);
        if(!candidate&&Date.now()-this.lastFeedFetchAt>15000){
          await this.refreshFeedCache(s,true);
          candidate=this.candidateFrom(this.cachedItems,s);
        }
        if(!candidate){await wait(3000);continue;}

        this.queuedUrls.add(candidate.link);
        const holder={story:candidate,status:'PROCESANDO',attempts:[],metrics:null,stage:'article'};
        this.queue.push(holder);this.state();
        try{
          Object.assign(holder,await this.process(candidate,s,holder));
          holder.status='LISTA';holder.stage='ready';holder.error='';
        } catch(e){
          holder.status='ERROR';holder.error=e.message;holder.attempts=e.details||holder.attempts||[];
          this.emit('error-item',{title:candidate.title,error:e.message,details:e.details,stage:holder.stage});
        }
        this.state();
      }catch(e){this.emit('engine-error',e);await wait(1500);}
    }
  }

  async process(story,s,holder){
    let article;
    holder.stage='article';this.state();
    try{article=await this.fetchArticle(story.link);}catch(e){e.message=`Artículo: ${e.message}`;throw e;}
    const image=story.image||article.image||this.getFallbackUrl();

    holder.stage='ai';this.state();
    let ai;
    try{ai=await this.providers.generate(story,article,s);}catch(e){e.message=`IA: ${e.message}`;throw e;}
    holder.provider=ai.provider;holder.model=ai.model;holder.attempts=ai.attempts||[];holder.metrics=ai.metrics||null;

    holder.stage='tts';this.state();
    let audio;
    try{audio=await this.kokoro.generate(ai.result.script,{voice:s.tts.voice,speed:s.tts.speed});}
    catch(e){e.message=`Kokoro: ${e.message}`;e.details=ai.attempts||[];throw e;}
    return {article,provider:ai.provider,model:ai.model,result:ai.result,attempts:ai.attempts||[],metrics:ai.metrics||null,audio,image,fallback:this.getFallbackUrl()};
  }

  async consumer(epoch){
    while(this.emissionRunning&&epoch===this.emissionEpoch){
      if(this.emissionPaused){await wait(300);continue;}
      if(!this.isOutputReady()){
        this.emissionPaused=true;this.state({notice:'Abre Output para continuar la emisión'});continue;
      }
      const item=this.queue.find(x=>x.status==='LISTA');
      if(!item){await wait(350);continue;}

      this.currentItem=item;item.status='AL AIRE';item.error='';this.state();
      const p={
        source:'automatic',
        title:item.result.title||item.story.title,
        category:item.result.category||item.story.category||'ACTUALIDAD',
        summary:item.result.summary||'',
        script:item.result.script,
        image:item.image,
        fallbackImage:item.fallback,
        audioUrl:item.audio.url,
        audioDurationSec:item.audio.durationSec||item.result.durationSec||60
      };
      const sent=this.sendAutomaticOutput(p);
      if(!sent){
        item.status='LISTA';this.currentItem=null;this.emissionPaused=true;this.state({notice:'Output no disponible'});continue;
      }

      const expected=Math.max(10,Number(p.audioDurationSec)||60)*1000+15000;
      const reason=await Promise.race([
        new Promise(resolve=>this.playbackResolve=resolve),
        wait(expected).then(()=> 'timeout')
      ]);
      this.playbackResolve=null;

      if(reason==='ended'){
        this.history.add(item.story);
        item.status='EMITIDA';this.state();
        await wait((this.getSettings().visual.pauseSeconds||2.5)*1000);
        this.queue=this.queue.filter(x=>x!==item);
        this.queuedUrls.delete(item.story.link);
      } else {
        item.status='LISTA';
        if(reason==='error'||reason==='timeout'){
          item.error=reason==='timeout'?'Output: el audio excedió el tiempo esperado':'Output: no se pudo reproducir el audio';
          this.emissionPaused=true;
          this.emit('error-item',{title:item.story.title,error:item.error,stage:'output'});
        } else if(reason==='closed'||reason==='interrupted') {
          this.emissionPaused=true;
        }
      }
      this.currentItem=null;this.state();
    }
  }
}

module.exports={AutomationEngine};
