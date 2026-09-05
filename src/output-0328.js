'use strict';
(function installOutput0328(){
  if(window.__ec0328OutputInstalled)return;window.__ec0328OutputInstalled=true;
  const a=document.getElementById('audio'),v=document.getElementById('cannedVideo');let last=0;
  function emit(media,force=false){try{if(typeof source==='undefined'||source!=='automatic'||!window.ECAPI?.outputPlayback)return;const now=Date.now();if(!force&&now-last<250)return;last=now;const duration=Number(media?.duration),current=Number(media?.currentTime);window.ECAPI.outputPlayback({type:'progress',source:'automatic',kind:typeof activeKind==='undefined'?'none':activeKind,currentSec:Number.isFinite(current)?current:0,durationSec:Number.isFinite(duration)?duration:0});}catch{}}
  for(const media of [a,v]){if(!media)continue;media.addEventListener('timeupdate',()=>emit(media));media.addEventListener('loadedmetadata',()=>emit(media,true));media.addEventListener('play',()=>emit(media,true));media.addEventListener('pause',()=>emit(media,true));media.addEventListener('seeking',()=>emit(media,true));}
})();
