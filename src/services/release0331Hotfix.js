'use strict';

const {AutomationEngine}=require('./automation0325');

function isExclusive(item){
  return !!(item&&(
    item.isExclusive===true||
    item.story?.isExclusive===true||
    item.result?.isExclusive===true||
    String(item.accessStatus||'').toUpperCase()==='SUBSCRIBER_ONLY'||
    String(item.result?.accessStatus||'').toUpperCase()==='SUBSCRIBER_ONLY'||
    String(item.article?.access?.status||'').toUpperCase()==='SUBSCRIBER_ONLY'
  ));
}

function syncExclusiveIdentity(item){
  if(!item)return false;
  const exclusive=isExclusive(item);
  if(!exclusive)return false;
  item.isExclusive=true;
  if(!item.accessStatus)item.accessStatus=item.result?.accessStatus||item.article?.access?.status||'SUBSCRIBER_ONLY';
  if(item.result){item.result.isExclusive=true;if(!item.result.accessStatus)item.result.accessStatus=item.accessStatus;}
  return true;
}

function normalizeDisplayRows(engine,rows){
  const byId=new Map((engine.queue||[]).filter(Boolean).map(x=>[String(x.id||''),x]));
  let position=0;
  return (rows||[]).map(row=>{
    const out={...row};
    const item=out.id?byId.get(String(out.id)):null;
    if(item){
      const exclusive=syncExclusiveIdentity(item);
      out.isExclusive=exclusive;
      if(exclusive)out.accessStatus=item.accessStatus||item.result?.accessStatus||out.accessStatus||'SUBSCRIBER_ONLY';
      out.renderKey=String(item.id||out.id||'');
    }
    if(out.queueGroup==='preparing'||out.history)out.displayPosition=0;
    else out.displayPosition=++position;
    return out;
  });
}

function installRelease0331Hotfix(){
  const p=AutomationEngine.prototype;
  if(p.__ec0331IdentityHotfix)return;
  Object.defineProperty(p,'__ec0331IdentityHotfix',{value:true});

  const baseChoose=p.chooseReadyItem;
  const baseDisplay=p.displayQueue;
  const baseSnapshot=p.snapshot;

  p.chooseReadyItem=function(queue=this.queue,s=this.getSettings?.()||{}){
    for(const item of queue||[])syncExclusiveIdentity(item);
    return baseChoose.call(this,queue,s);
  };

  p.displayQueue=function(s=this.getSettings?.()||{}){
    for(const item of this.queue||[])syncExclusiveIdentity(item);
    return normalizeDisplayRows(this,baseDisplay.call(this,s)||[]);
  };

  p.snapshot=function(extra={}){
    for(const item of this.queue||[])syncExclusiveIdentity(item);
    const snap=baseSnapshot.call(this,extra);
    if(snap?.queue)snap.queue=normalizeDisplayRows(this,snap.queue);
    return snap;
  };
}

module.exports={installRelease0331Hotfix,isExclusive,syncExclusiveIdentity,normalizeDisplayRows};
