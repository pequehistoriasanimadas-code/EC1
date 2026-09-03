'use strict';
(function installOutput0331(){
  if(window.__ec0331OutputInstalled)return;window.__ec0331OutputInstalled=true;
  const stage=document.getElementById('stage'),story=document.getElementById('storyLayer'),canned=document.getElementById('cannedLayer'),musicEl=document.getElementById('music');if(!stage||!musicEl||!window.ECAPI)return;
  const standby=document.createElement('div');standby.id='standbyLayer';standby.className='media-layer standby-layer';standby.innerHTML='<video id="standbyVideo" autoplay muted playsinline></video><div id="standbyFallback"></div>';stage.insertBefore(standby,stage.firstChild);const video=standby.querySelector('#standbyVideo'),fallback=standby.querySelector('#standbyFallback');
  let design={transitionEnabled:true,transitionType:'fade',transitionDuration:.7,musicEnabled:false,musicLoop:true,musicVolume:20,musicUrl:'',standbyVideo:'',standbyVideoUrl:''},showing=true,serial=0,musicSerial=0,musicRetryTimer=null;
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,Number(v)||0)),volume=v=>clamp(v,0,100)/100,sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const transitionMs=()=>clamp(design.transitionDuration||.7,.2,2)*1000;
  const transitionOn=()=>design.transitionEnabled!==false&&design.transitionType!=='none';
  const clearMusicRetry=()=>{if(musicRetryTimer){clearTimeout(musicRetryTimer);musicRetryTimer=null;}};
  function waitMusicReady(timeout=1800){if(musicEl.readyState>=2)return Promise.resolve();return new Promise(resolve=>{let done=false;const finish=()=>{if(done)return;done=true;clearTimeout(timer);musicEl.removeEventListener('loadeddata',finish);musicEl.removeEventListener('canplay',finish);resolve();};const timer=setTimeout(finish,timeout);musicEl.addEventListener('loadeddata',finish,{once:true});musicEl.addEventListener('canplay',finish,{once:true});});}
  async function ensureMusic(){
    const token=++musicSerial;clearMusicRetry();const url=String(design.musicUrl||'');if(!design.musicEnabled||!url){musicEl.pause();return false;}
    const current=musicEl.getAttribute('src')||'';if(current!==url){musicEl.src=url;try{musicEl.load();}catch{} }
    musicEl.loop=design.musicLoop!==false;musicEl.volume=volume(design.musicVolume==null?20:design.musicVolume);if(musicEl.ended&&design.musicLoop!==false)try{musicEl.currentTime=0;}catch{}
    await waitMusicReady();if(token!==musicSerial||!design.musicEnabled)return false;
    const delays=[0,120,280,550,900,1400];for(let i=0;i<delays.length;i++){
      if(delays[i])await sleep(delays[i]);if(token!==musicSerial||!design.musicEnabled)return false;if(!showing&&standby.classList.contains('hidden-layer'))return false;
      try{await musicEl.play();if(!musicEl.paused){window.__ec0331StandbyMusicPlaying=true;return true;}}catch{}
    }
    if(token===musicSerial&&design.musicEnabled&&showing){musicRetryTimer=setTimeout(()=>ensureMusic().catch(()=>{}),1800);}return false;
  }
  function setSource(){const url=String(design.standbyVideoUrl||'');if(!url){video.pause();video.removeAttribute('src');try{video.load();}catch{}video.classList.add('hidden');fallback.classList.remove('hidden');return;}if(video.getAttribute('src')!==url){video.src=url;video.loop=true;video.muted=true;video.playsInline=true;video.load();}video.classList.remove('hidden');fallback.classList.add('hidden');}
  async function showStandby(){const token=++serial;setSource();standby.classList.remove('hidden-layer');standby.style.pointerEvents='none';if(transitionOn()){standby.style.transition=`opacity ${transitionMs()}ms ease-in-out`;standby.style.opacity='0';standby.getBoundingClientRect();standby.style.opacity='1';await sleep(transitionMs());}else standby.style.opacity='1';if(token!==serial)return;standby.style.transition='';showing=true;if(video.src)video.play().catch(()=>{});await ensureMusic();}
  async function hideStandby(){const token=++serial;if(!showing&&standby.classList.contains('hidden-layer'))return;if(transitionOn()){standby.style.transition=`opacity ${transitionMs()}ms ease-in-out`;standby.style.opacity='1';standby.getBoundingClientRect();standby.style.opacity='0';await sleep(transitionMs());}else standby.style.opacity='0';if(token!==serial)return;standby.classList.add('hidden-layer');standby.style.transition='';standby.style.opacity='1';video.pause();showing=false;}
  function apply(next={}){design={...design,...next};setSource();if(showing){video.play().catch(()=>{});ensureMusic().catch(()=>{});}}
  function retryStandbyMusic(){if(showing&&design.musicEnabled)setTimeout(()=>ensureMusic().catch(()=>{}),0);}
  window.ECAPI.on('output:design',d=>apply(d||{}));
  window.ECAPI.on('output:story',()=>{hideStandby().catch(()=>{});});
  window.ECAPI.on('output:control',a=>{if(a==='stop')setTimeout(()=>showStandby().catch(()=>{}),0);if(a==='pause'){video.pause();clearMusicRetry();}if(a==='play'&&showing){video.play().catch(()=>{});ensureMusic().catch(()=>{});}});
  video.addEventListener('error',()=>{video.classList.add('hidden');fallback.classList.remove('hidden');});
  video.addEventListener('ended',()=>{if(video.src){try{video.currentTime=0;video.play().catch(()=>{});}catch{}}});
  musicEl.addEventListener('canplay',retryStandbyMusic);musicEl.addEventListener('loadeddata',retryStandbyMusic);musicEl.addEventListener('error',()=>{if(showing&&design.musicEnabled){clearMusicRetry();musicRetryTimer=setTimeout(()=>ensureMusic().catch(()=>{}),1200);}});
  window.addEventListener('focus',retryStandbyMusic);document.addEventListener('visibilitychange',()=>{if(!document.hidden)retryStandbyMusic();});
  (async()=>{try{const s=await window.ECAPI.getSettings();apply(s?.visual?.output||{});}catch{}await showStandby();setTimeout(retryStandbyMusic,250);setTimeout(retryStandbyMusic,900);})();
})();
