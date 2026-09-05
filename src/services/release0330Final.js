'use strict';
const {AutomationEngine}=require('./automation0325');
const {projectedNews}=require('./release0330');

function isNews(x){return!!x&&['rss','generated'].includes(x.sourceType||'rss');}
function rowFor(item){return{id:item.id||'',title:item.story?.title||item.result?.title||'',status:item.status,sourceType:item.sourceType||'rss',provider:item.provider||'',model:item.model||'',attempts:item.attempts||[],metrics:item.metrics||null,error:item.error||'',stage:item.stage||'',outputRetries:item.outputRetries||0,priority:item.priority||'normal',isExclusive:!!(item.result?.isExclusive||item.isExclusive),accessStatus:item.result?.accessStatus||item.accessStatus||item.article?.access?.status||'',feedName:String(item.story?.feedName||''),feedId:String(item.story?.feedId||''),category:String(item.result?.category||item.story?.category||''),storyUrl:String(item.story?.link||''),selectionScore:Number(item.selectionScore)||0,selectionReason:String(item.selectionReason||'')};}
function insertPlanGroup(ready,plans){if(!plans.length)return[...ready];const after=Math.max(0,Number(plans[0].planAfter)||0),index=after<=0?0:Math.min(ready.length,after);const out=[...ready];out.splice(index,0,...plans);return out;}
function schedulingState(engine){return{scheduledNewsTotal:Number(engine?.scheduledNewsTotal)||0,lastScheduledCannedAt:Number(engine?.lastScheduledCannedAt),contentAnchorNews:Number(engine?.__ec0330ContentAnchorNews),lastContentNewsMarker:Number(engine?.__ec0328LastContentNewsMarker)};}
function restoreSchedulingState(engine,state={}){if(!engine)return;engine.scheduledNewsTotal=Math.max(0,Number(state.scheduledNewsTotal)||0);engine.lastScheduledCannedAt=Number.isFinite(state.lastScheduledCannedAt)?state.lastScheduledCannedAt:-1;engine.__ec0330ContentAnchorNews=Number.isFinite(state.contentAnchorNews)?Math.max(0,state.contentAnchorNews):0;engine.__ec0328LastContentNewsMarker=Number.isFinite(state.lastContentNewsMarker)?state.lastContentNewsMarker:-1;}
function reservedAdTitle(engine){const p=String(engine?.__ec0328AdReservation?.path||'').trim();if(!p)return'Anuncio programado';const parts=p.split(/[\\/]/).filter(Boolean);return parts.at(-1)||'Anuncio programado';}
function adPlanWhileContent(engine,s={}){const c=s?.canned||{};if(engine?.currentKind!=='canned'||!engine?.currentCanned)return null;if(c.insertAdAfterContent===false||!String(c.adsFolder||'').trim())return null;if(Date.now()<Number(engine.adsUnavailableUntil||0))return null;return{title:reservedAdTitle(engine),status:'PROGRAMADO',sourceType:'ad',planned:true,planAfter:0,planText:'Después del contenido',reason:'ad-after-content'};}
function installRelease0330Final(){
  const p=AutomationEngine.prototype;if(p.__ec0330FinalQueue)return;Object.defineProperty(p,'__ec0330FinalQueue',{value:true});
  const baseRemove=p.removeItem,baseReset=p.resetSessionCounters;
  p.removeItem=function(item){const original=String(item?.originalLink||''),current=String(item?.story?.link||'');const result=baseRemove.call(this,item);if(original)this.queuedUrls?.delete(original);if(current)this.queuedUrls?.delete(current);return result;};
  p.resetSessionCounters=function(){const schedule=schedulingState(this);baseReset.call(this);restoreSchedulingState(this,schedule);this.state?.({notice:'Contadores visibles reiniciados; la programación de contenidos no cambia.'});return this.snapshot?.()||{};};
  p.displayQueue=function(s=this.getSettings?.()||{}){
    const ready=projectedNews(this,s),air=[];
    if(this.currentKind==='news'&&this.currentItem)air.push(rowFor(this.currentItem));
    else if(this.currentKind==='canned'&&this.currentCanned)air.push({title:this.currentCanned.name,status:'AL AIRE',sourceType:'content',planned:false,durationSec:Number(this.currentCanned.durationSec)||0});
    else if(this.currentKind==='ad'&&this.currentCanned)air.push({title:this.currentCanned.name,status:'AL AIRE',sourceType:'ad',planned:false,durationSec:Number(this.currentCanned.durationSec)||0});
    let plans=[];
    if(this.emissionRunning){
      if(this.currentKind==='canned'){const ad=adPlanWhileContent(this,s);if(ad)plans=[ad];}
      else if(this.currentKind!=='ad'){try{plans=(this.plannedMediaRows?.(s,[...air,...ready])||[]).filter(x=>x?.planned&&['content','ad'].includes(x.sourceType));}catch{plans=[];}}
    }
    const effective=insertPlanGroup(ready,plans),preparing=(this.queue||[]).filter(x=>isNews(x)&&!['LISTA','AL AIRE','EMITIDA','ERROR'].includes(x.status)&&!(x.status==='PROCESANDO'&&x.uiVisible===false)).map(rowFor),final=[];let pos=0;
    for(const row of [...air,...effective])final.push({...row,queueGroup:'effective',displayPosition:++pos,sessionSeq:pos});
    for(const row of preparing)final.push({...row,queueGroup:'preparing',displayPosition:0,sessionSeq:0});
    return final;
  };
}
module.exports={installRelease0330Final,insertPlanGroup,adPlanWhileContent,schedulingState,restoreSchedulingState};
