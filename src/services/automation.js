const {EventEmitter}=require('events');
const {pathToFileURL}=require('url');

const wait=ms=>new Promise(r=>setTimeout(r,ms));
class AutomationEngine extends EventEmitter{
  constructor({rss,fetchArticle,providers,kokoro,history,getSettings,getFallbackUrl,sendOutput}){
    super(); Object.assign(this,{rss,fetchArticle,providers,kokoro,history,getSettings,getFallbackUrl,sendOutput});
    this.running=false; this.paused=false; this.queue=[]; this.queuedUrls=new Set(); this.outputResolve=null;
  }
  state(extra={}){this.emit('state',{running:this.running,paused:this.paused,queue:this.queue.map(x=>({title:x.story.title,status:x.status,provider:x.provider||''})),...extra});}
  async start(){if(this.running)return; this.running=true; this.paused=false; this.state(); this.producer(); this.consumer();}
  pause(){this.paused=true;this.state();}
  resume(){this.paused=false;this.state();}
  stop(){this.running=false;this.paused=false; if(this.outputResolve){this.outputResolve();this.outputResolve=null;} this.state();}
  outputEnded(){if(this.outputResolve){this.outputResolve();this.outputResolve=null;}}
  async producer(){
    while(this.running){
      try{
        if(this.paused){await wait(1000);continue;}
        const s=this.getSettings();
        while(this.running && this.queue.length < Math.min(s.automation.queueMax||10,s.automation.bufferReady||3)){
          const {items,errors}=await this.rss.loadAll(s.rssFeeds);
          if(errors.length)this.state({rssErrors:errors});
          const maxAge=(s.automation.maxAgeHours||6)*3600000;
          const candidate=items.find(x=>{
            if(this.queuedUrls.has(x.link))return false;
            if(s.automation.avoidRepeats&&this.history.has(x.link))return false;
            if(x.pubDate && Date.now()-new Date(x.pubDate).getTime()>maxAge)return false;
            return true;
          });
          if(!candidate)break;
          this.queuedUrls.add(candidate.link);
          const holder={story:candidate,status:'PROCESANDO'}; this.queue.push(holder); this.state();
          try{Object.assign(holder,await this.process(candidate,s));holder.status='LISTA';}
          catch(e){holder.status='ERROR';holder.error=e.message; this.emit('error-item',{title:candidate.title,error:e.message,details:e.details});}
          this.state();
        }
      }catch(e){this.emit('engine-error',e);}
      await wait(Math.max(15000,(this.getSettings().automation.updateMinutes||2)*60000));
    }
  }
  async process(story,s){
    const article=await this.fetchArticle(story.link);
    const image=story.image||article.image||this.getFallbackUrl();
    const {provider,result}=await this.providers.generate(story,article,s);
    const audio=await this.kokoro.generate(result.script,{voice:s.tts.voice,speed:s.tts.speed});
    return {article,provider,result,audio,image,fallback:this.getFallbackUrl()};
  }
  async consumer(){
    while(this.running){
      if(this.paused){await wait(500);continue;}
      const item=this.queue.find(x=>x.status==='LISTA');
      if(!item){this.queue=this.queue.filter(x=>x.status!=='ERROR');await wait(500);continue;}
      item.status='AL AIRE';this.state();
      const p={title:item.result.title||item.story.title,category:item.result.category||item.story.category||'ACTUALIDAD',summary:item.result.summary||'',script:item.result.script,image:item.image,fallbackImage:item.fallback,audioUrl:item.audio.url};
      this.sendOutput(p);
      await new Promise(resolve=>this.outputResolve=resolve);
      if(!this.running)break;
      this.history.add(item.story); item.status='EMITIDA'; this.state();
      await wait((this.getSettings().visual.pauseSeconds||2.5)*1000);
      this.queue=this.queue.filter(x=>x!==item); this.queuedUrls.delete(item.story.link); this.state();
    }
  }
}
module.exports={AutomationEngine};
