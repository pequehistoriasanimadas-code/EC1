'use strict';
(function installOutput0326(){
  if(!window.__ecOutput0325||typeof showStory!=='function'||typeof applyDesign!=='function'||typeof playback!=='function'){setTimeout(installOutput0326,60);return;}
  if(window.__ecOutput0326)return;window.__ecOutput0326=true;
  let ownedFaces=[],fontSignature='',lastEndedSerial='';
  function descriptor(url=''){try{const u=new URL(url);const weight=Math.max(100,Math.min(900,Number(u.hash.match(/(?:^|&)ecw=(\d+)/)?.[1])||400)),style=decodeURIComponent(u.hash.match(/(?:^|&)ecs=([^&]+)/)?.[1]||'normal');u.hash='';return{url:u.href,weight:String(weight),style:style==='italic'?'italic':'normal'};}catch{return{url:String(url).split('#')[0],weight:'400',style:'normal'};}}
  async function syncCustomFonts(list){const rows=Array.isArray(list)?list.filter(x=>x?.family&&x?.url):[],sig=rows.map(x=>`${x.family}|${x.url}`).join('||');if(sig===fontSignature)return;fontSignature=sig;for(const f of ownedFaces)try{document.fonts.delete(f);}catch{}ownedFaces=[];const families=new Set(rows.map(x=>x.family));for(const f of [...document.fonts]){try{if(families.has(String(f.family||'').replace(/^['"]|['"]$/g,'')))document.fonts.delete(f);}catch{}}
    for(const x of rows){const d=descriptor(x.url);try{const face=new FontFace(x.family,`url("${d.url.replace(/"/g,'%22')}")`,{weight:d.weight,style:d.style});await face.load();document.fonts.add(face);ownedFaces.push(face);}catch{}}
  }
  const baseApply=applyDesign;applyDesign=function(next={}){const custom=Array.isArray(next?.customFonts)?next.customFonts:(Array.isArray(design?.customFonts)?design.customFonts:[]),r=baseApply({...next,customFonts:[]});design.customFonts=custom;syncCustomFonts(custom).catch(()=>{});return r;};
  const basePlayback=playback;playback=function(type,message=''){if(type==='ended'&&activeKind==='news'){const serial=String(audio?.dataset?.ecSerial||'');if(serial&&serial===lastEndedSerial)return;if(serial)lastEndedSerial=serial;}return basePlayback(type,message);};
  function waitAudioReady(serial,timeout=1600){if(!audio?.src)return Promise.resolve(true);if(audio.readyState>=2)return Promise.resolve(serial===contentSerial);return new Promise(resolve=>{let done=false;const finish=()=>{if(done)return;done=true;clearTimeout(timer);audio.removeEventListener('loadeddata',finish);audio.removeEventListener('canplay',finish);audio.removeEventListener('error',finish);resolve(serial===contentSerial);};const timer=setTimeout(finish,timeout);audio.addEventListener('loadeddata',finish,{once:true});audio.addEventListener('canplay',finish,{once:true});audio.addEventListener('error',finish,{once:true});});}
  async function prepareVoice(url,serial){audio.dataset.ecSerial=String(serial);try{audio.pause();audio.currentTime=0;}catch{}if(!url){try{audio.removeAttribute('src');audio.load();}catch{}return true;}audio.preload='auto';audio.src=url;try{audio.load();}catch{}return waitAudioReady(serial);}
  showStory=async function(p,serial){
    const previous=activeKind;if(serial!==contentSerial)return;activeKind='transition';const voiceReady=prepareVoice(p.audioUrl||'',serial);
    if(previous==='news')await revealStoryFromStory(async()=>{if(serial===contentSerial)await setStoryContent(p);});
    else if(previous==='canned')await crossfadeLayers(cannedLayer,storyLayer,async()=>{if(serial===contentSerial)await setStoryContent(p);});
    else{await setStoryContent(p);storyLayer.classList.remove('hidden-layer');cannedLayer.classList.add('hidden-layer');}
    if(serial!==contentSerial)return;if(previous==='canned')clearCannedVideo();await voiceReady;if(serial!==contentSerial)return;activeKind='news';stage.dataset.kind='news';await startMusicForNews();if(serial!==contentSerial)return;audio.volume=volume(design.voiceVolume==null?100:design.voiceVolume);if(p.audioUrl){try{audio.currentTime=0;}catch{}audio.play().catch(e=>playback('error',e.message||'No se pudo iniciar el audio'));}else playback('ended');
  };
  try{syncCustomFonts(design?.customFonts||[]);}catch{}
})();
