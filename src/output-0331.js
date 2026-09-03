'use strict';
(function installOutput0331(){
  if(window.__ec0331OutputInstalled)return;window.__ec0331OutputInstalled=true;
  const stage=document.getElementById('stage'),story=document.getElementById('storyLayer'),canned=document.getElementById('cannedLayer'),musicEl=document.getElementById('music');if(!stage||!musicEl||!window.ECAPI)return;
  const standby=document.createElement('div');standby.id='standbyLayer';standby.className='media-layer standby-layer';standby.innerHTML='<video id="standbyVideo" autoplay muted playsinline></video><div id="standbyFallback"></div>';stage.insertBefore(standby,stage.firstChild);const video=standby.querySelector('#standbyVideo'),fallback=standby.querySelector('#standbyFallback');
  let design={transitionEnabled:true,transitionType:'fade',transitionDuration:.7,musicEnabled:false,musicLoop:true,musicVolume:20,musicUrl:'',standbyVideo:'',standbyVideoUrl:''},showing=true,serial=0;
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,Number(v)||0)),volume=v=>clamp(v,0,100)/100,sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const transitionMs=()=>clamp(design.transitionDuration||.7,.2,2)*1000;
  const transitionOn=()=>design.transitionEnabled!==false&&design.transitionType!=='none';
  async function ensureMusic(){const url=String(design.musicUrl||'');if(!design.musicEnabled||!url){musicEl.pause();return;}const current=musicEl.getAttribute('src')||'';if(current!==url){musicEl.src=url;musicEl.currentTime=0;musicEl.load();}musicEl.loop=design.musicLoop!==false;musicEl.volume=volume(design.musicVolume==null?20:design.musicVolume);if(musicEl.ended&&design.musicLoop!==false)try{musicEl.currentTime=0;}catch{}if(musicEl.paused)try{await musicEl.play();}catch{} }
  function setSource(){const url=String(design.standbyVideoUrl||'');if(!url){video.pause();video.removeAttribute('src');try{video.load();}catch{}video.classList.add('hidden');fallback.classList.remove('hidden');return;}if(video.getAttribute('src')!==url){video.src=url;video.loop=true;video.muted=true;video.playsInline=true;video.load();}video.classList.remove('hidden');fallback.classList.add('hidden');}
  async function showStandby(){const token=++serial;setSource();standby.classList.remove('hidden-layer');standby.style.pointerEvents='none';if(transitionOn()){standby.style.transition=`opacity ${transitionMs()}ms ease-in-out`;standby.style.opacity='0';standby.getBoundingClientRect();standby.style.opacity='1';await sleep(transitionMs());}else standby.style.opacity='1';if(token!==serial)return;standby.style.transition='';showing=true;if(video.src)video.play().catch(()=>{});await ensureMusic();}
  async function hideStandby(){const token=++serial;if(!showing&&standby.classList.contains('hidden-layer'))return;if(transitionOn()){standby.style.transition=`opacity ${transitionMs()}ms ease-in-out`;standby.style.opacity='1';standby.getBoundingClientRect();standby.style.opacity='0';await sleep(transitionMs());}else standby.style.opacity='0';if(token!==serial)return;standby.classList.add('hidden-layer');standby.style.transition='';standby.style.opacity='1';video.pause();showing=false;}
  function apply(next={}){design={...design,...next};setSource();if(showing){video.play().catch(()=>{});ensureMusic().catch(()=>{});}}
  window.ECAPI.on('output:design',d=>apply(d||{}));
  window.ECAPI.on('output:story',()=>{hideStandby().catch(()=>{});});
  window.ECAPI.on('output:control',a=>{if(a==='stop')setTimeout(()=>showStandby().catch(()=>{}),0);if(a==='pause'){video.pause();}if(a==='play'&&showing){video.play().catch(()=>{});ensureMusic().catch(()=>{});}});
  video.addEventListener('error',()=>{video.classList.add('hidden');fallback.classList.remove('hidden');});
  video.addEventListener('ended',()=>{if(video.src){try{video.currentTime=0;video.play().catch(()=>{});}catch{}}});
  (async()=>{try{const s=await window.ECAPI.getSettings();apply(s?.visual?.output||{});}catch{}await showStandby();})();
})();
