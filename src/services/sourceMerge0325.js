'use strict';

function accessRank(mode){return String(mode||'auto')==='exclusive'?3:String(mode||'auto')==='public'?1:0;}
function dateValue(v){const n=Date.parse(v||'');return Number.isFinite(n)?n:0;}
function sourceMeta(item={}){return{feedId:String(item.feedId||''),feedName:String(item.feedName||'Fuente'),feedUrl:String(item.feedUrl||''),accessMode:String(item.feedAccessMode||'auto'),sourceMode:String(item.sourceMode||'auto')};}
function mergeSourceItems(groups=[],canonicalLink=v=>String(v||'').trim()){
  const map=new Map();
  for(const item of groups.flat()){
    const key=canonicalLink(item?.link);if(!key)continue;
    const incoming={...item,link:key},src=sourceMeta(incoming);
    if(!map.has(key)){incoming.sourceFeeds=[src];map.set(key,incoming);continue;}
    const cur=map.get(key),sources=[...(cur.sourceFeeds||[sourceMeta(cur)])];if(!sources.some(x=>x.feedId===src.feedId))sources.push(src);
    const strongest=sources.reduce((a,b)=>accessRank(b.accessMode)>accessRank(a.accessMode)?b:a,sources[0]||src);
    const merged={...cur,
      title:cur.title||incoming.title,
      description:(incoming.description||'').length>(cur.description||'').length?incoming.description:cur.description,
      image:cur.image||incoming.image||'',category:cur.category||incoming.category||'',author:cur.author||incoming.author||'',
      pubDate:dateValue(incoming.pubDate)>dateValue(cur.pubDate)?incoming.pubDate:cur.pubDate,
      sourceFeeds:sources,feedAccessMode:strongest?.accessMode||cur.feedAccessMode||'auto'
    };
    if(strongest&&accessRank(strongest.accessMode)>0){merged.feedId=strongest.feedId;merged.feedName=strongest.feedName;merged.feedUrl=strongest.feedUrl;merged.sourceMode=strongest.sourceMode;}
    map.set(key,merged);
  }
  return[...map.values()].sort((a,b)=>dateValue(b.pubDate)-dateValue(a.pubDate));
}
module.exports={mergeSourceItems,accessRank,dateValue,sourceMeta};
