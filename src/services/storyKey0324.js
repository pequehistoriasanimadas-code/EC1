'use strict';

const TRACKING_PARAMS=new Set(['fbclid','gclid','mc_cid','mc_eid','ref','source']);

function canonicalStoryUrl(value,{keepEvent=true}={}){
  const raw=String(value||'').trim();
  if(!raw)return'';
  try{
    const u=new URL(raw);
    u.protocol=u.protocol.toLowerCase();
    u.hostname=u.hostname.toLowerCase().replace(/^www\./,'');
    for(const key of [...u.searchParams.keys()]){
      if(/^utm_/i.test(key)||TRACKING_PARAMS.has(key.toLowerCase()))u.searchParams.delete(key);
    }
    u.searchParams.sort();
    if(u.pathname.length>1)u.pathname=u.pathname.replace(/\/+$/,'');
    if(!(keepEvent&&/^#ec-event=/i.test(u.hash)))u.hash='';
    return u.toString();
  }catch{return raw;}
}

function storyKey(value){
  const url=typeof value==='string'?value:value?.link;
  return canonicalStoryUrl(url,{keepEvent:true});
}

function baseStoryKey(value){
  const url=typeof value==='string'?value:value?.link;
  return canonicalStoryUrl(url,{keepEvent:false});
}

module.exports={canonicalStoryUrl,storyKey,baseStoryKey};
