'use strict';
(function installOutput0331(){
  if(window.__ec0331OutputInstalled)return;window.__ec0331OutputInstalled=true;
  const stage=document.getElementById('stage'),story=document.getElementById('storyLayer'),canned=document.getElementById('cannedLayer'),musicEl=document.getElementById('music');if(!stage||!musicEl||!window.ECAPI)return;
  const standby=document.createElement('div');standby.id='standbyLayer';standby.className='media-layer standby-layer';standby.innerHTML='<video id="standbyVideo" autoplay muted playsinline></video><div id="standbyFallback"></div>';stage.insertBefore(standby,stage.firstChild);const video=standby.querySelector('#standbyVideo'),fallback=standby.querySelector('#standbyFallback');
  let design={transitionEnabled:true,transitionType:'fade',transitionDuration:.7,musicEnabled:false,musicLoop:true,musicVolume:20,musicUrl:'',standbyVideo:'',standbyVideoUrl:''},showing=true,serial=0,musicSerial=0,musicRetryTimer=null,standbyPaused=false,musicWatchdog=null,outputMode='standby';
  let standbyVideoWatchdog=null,lastStandbyCurrentTime=-1,lastStandbyProgressAt=Date.now(),standbyRecoveryBusy=false,lastStandbyRecoveryAt=0,standbyStallSignalAt=0;
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,Number(v)||0)),volume=v=>clamp(v,0,100)/100,sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const transitionMs=()=>clamp(design.transitionDuration||.7,.2,2)*1000;
  const transitionOn=()=>design.transitionEnabled!==false&&design.transitionType!=='none';
  const clearMusicRetry=()=>{if(musicRetryTimer){clearTimeout(musicRetryTimer);musicRetryTimer=null;}};
  const musicShouldPlay=()=>showing&&outputMode==='standby'&&!standbyPaused&&design.musicEnabled&&!!String(design.musicUrl||'');
  const standbyVideoShouldPlay=()=>showing&&outputMode==='standby'&&!standbyPaused&&!!String(design.standbyVideoUrl||'');
  function publishMusicState(reason=''){window.__ec0331StandbyMusicPlaying=musicShouldPlay()&&!musicEl.paused&&!musicEl.ended;window.__ec0331StandbyMusicState={reason,showing,standbyPaused,outputMode,enabled:!!design.musicEnabled,paused:!!musicEl.paused,ended:!!musicEl.ended,readyState:Number(musicEl.readyState)||0,currentTime:Number(musicEl.currentTime)||0,src:musicEl.getAttribute('src')||'',at:Date.now()};}
  function publishStandbyVideoState(reason=''){window.__ec0331StandbyVideoState={reason,showing,standbyPaused,outputMode,shouldPlay:standbyVideoShouldPlay(),paused:!!video.paused,ended:!!video.ended,readyState:Number(video.readyState)||0,currentTime:Number(video.currentTime)||0,lastProgressAt:lastStandbyProgressAt,lastRecoveryAt:lastStandbyRecoveryAt,src:video.getAttribute('src')||'',at:Date.now()};}
  function markStandbyVideoProgress(reason='progress'){
    const t=Number(video.currentTime)||0;lastStandbyCurrentTime=t;lastStandbyProgressAt=Date.now();standbyStallSignalAt=0;publishStandbyVideoState(reason);
  }
  function waitMusicReady(timeout=2200){if(musicEl.readyState>=2)return Promise.resolve();return new Promise(resolve=>{let done=false;const finish=()=>{if(done)return;done=true;clearTimeout(timer);musicEl.removeEventListener('loadeddata',finish);musicEl.removeEventListener('canplay',finish);resolve();};const timer=setTimeout(finish,timeout);musicEl.addEventListener('loadeddata',finish,{once:true});musicEl.addEventListener('canplay',finish,{once:true});});}
  function waitStandbyVideoReady(timeout=2600){if(video.readyState>=2)return Promise.resolve(true);return new Promise(resolve=>{let done=false;const finish=ok=>{if(done)return;done=true;clearTimeout(timer);video.removeEventListener('loadeddata',onReady);video.removeEventListener('canplay',onReady);video.removeEventListener('error',onError);resolve(ok);},onReady=()=>finish(true),onError=()=>finish(false),timer=setTimeout(()=>finish(video.readyState>=2),timeout);video.addEventListener('loadeddata',onReady,{once:true});video.addEventListener('canplay',onReady,{once:true});video.addEventListener('error',onError,{once:true});});}
  async function ensureMusic(reason='ensure'){
    const token=++musicSerial;clearMusicRetry();const url=String(design.musicUrl||'');
    if(!musicShouldPlay()){if(!design.musicEnabled||!url||standbyPaused)musicEl.pause();publishMusicState(`${reason}:disabled`);return false;}
    const current=musicEl.getAttribute('src')||'';if(current!==url){musicEl.src=url;musicEl.autoplay=true;try{musicEl.load();}catch{} }
    musicEl.loop=design.musicLoop!==false;musicEl.volume=volume(design.musicVolume==null?20:design.musicVolume);if((musicEl.ended||(!Number.isFinite(musicEl.currentTime)))&&design.musicLoop!==false)try{musicEl.currentTime=0;}catch{}
    await waitMusicReady();if(token!==musicSerial||!musicShouldPlay()){publishMusicState(`${reason}:cancelled`);return false;}
    const delays=[0,80,180,320,520,800,1200];for(let i=0;i<delays.length;i++){
      if(delays[i])await sleep(delays[i]);if(token!==musicSerial||!musicShouldPlay()){publishMusicState(`${reason}:cancelled-${i}`);return false;}
      try{await musicEl.play();}catch{}
      if(!musicEl.paused){musicEl.volume=volume(design.musicVolume==null?20:design.musicVolume);publishMusicState(`${reason}:playing-${i}`);return true;}
    }
    publishMusicState(`${reason}:retry`);if(token===musicSerial&&musicShouldPlay())musicRetryTimer=setTimeout(()=>ensureMusic('retry-timer').catch(()=>{}),900);return false;
  }
  function startMusicWatchdog(){if(musicWatchdog)return;musicWatchdog=setInterval(()=>{if(!musicShouldPlay()){if((outputMode==='content'||outputMode==='ad')&&!musicEl.paused)try{musicEl.pause();}catch{}return publishMusicState('watchdog-idle');}if(musicEl.paused||musicEl.ended||musicEl.readyState<2)ensureMusic('watchdog').catch(()=>{});else{musicEl.loop=design.musicLoop!==false;musicEl.volume=volume(design.musicVolume==null?20:design.musicVolume);publishMusicState('watchdog-playing');}},700);}
  async function recoverStandbyVideo(reason='watchdog'){
    if(standbyRecoveryBusy||!standbyVideoShouldPlay())return false;
    const now=Date.now();if(now-lastStandbyRecoveryAt<4500)return false;
    const url=String(design.standbyVideoUrl||'');if(!url)return false;
    standbyRecoveryBusy=true;lastStandbyRecoveryAt=now;publishStandbyVideoState(`recover:${reason}:start`);
    try{
      video.pause();video.loop=true;video.muted=true;video.playsInline=true;
      if(video.getAttribute('src')!==url)video.src=url;
      try{video.currentTime=0;}catch{}
      try{video.load();}catch{}
      const ready=await waitStandbyVideoReady();
      if(!standbyVideoShouldPlay())return false;
      if(!ready){video.classList.add('hidden');fallback.classList.remove('hidden');publishStandbyVideoState(`recover:${reason}:not-ready`);return false;}
      video.classList.remove('hidden');fallback.classList.add('hidden');
      try{video.currentTime=0;}catch{}
      try{await video.play();}catch{}
      if(!video.paused){markStandbyVideoProgress(`recover:${reason}:playing`);return true;}
      publishStandbyVideoState(`recover:${reason}:play-failed`);return false;
    }finally{standbyRecoveryBusy=false;}
  }
  function startStandbyVideoWatchdog(){
    if(standbyVideoWatchdog)return;
    standbyVideoWatchdog=setInterval(()=>{
      if(!standbyVideoShouldPlay()){lastStandbyCurrentTime=Number(video.currentTime)||0;lastStandbyProgressAt=Date.now();standbyStallSignalAt=0;return publishStandbyVideoState('watchdog-idle');}
      const now=Date.now(),current=Number(video.currentTime)||0,advanced=lastStandbyCurrentTime<0||Math.abs(current-lastStandbyCurrentTime)>.08;
      if(advanced){lastStandbyCurrentTime=current;lastStandbyProgressAt=now;standbyStallSignalAt=0;return publishStandbyVideoState('watchdog-progress');}
      const noProgressMs=now-lastStandbyProgressAt,signalled=standbyStallSignalAt>0&&now-standbyStallSignalAt>2200;
      if((video.paused||video.ended||video.readyState<2||signalled||noProgressMs>6000)&&noProgressMs>3200)recoverStandbyVideo(signalled?'stall-event':'no-progress').catch(()=>{});
      else publishStandbyVideoState('watchdog-waiting');
    },1500);
  }
  function setSource(){const url=String(design.standbyVideoUrl||'');if(!url){video.pause();video.removeAttribute('src');try{video.load();}catch{}video.classList.add('hidden');fallback.classList.remove('hidden');lastStandbyCurrentTime=-1;lastStandbyProgressAt=Date.now();standbyStallSignalAt=0;publishStandbyVideoState('source-empty');return;}if(video.getAttribute('src')!==url){video.src=url;video.loop=true;video.muted=true;video.playsInline=true;video.load();lastStandbyCurrentTime=-1;lastStandbyProgressAt=Date.now();standbyStallSignalAt=0;}video.classList.remove('hidden');fallback.classList.add('hidden');}
  async function showStandby(){outputMode='standby';const token=++serial;standbyPaused=false;setSource();lastStandbyCurrentTime=Number(video.currentTime)||0;lastStandbyProgressAt=Date.now();standbyStallSignalAt=0;standby.classList.remove('hidden-layer');standby.style.pointerEvents='none';showing=true;if(transitionOn()){standby.style.transition=`opacity ${transitionMs()}ms ease-in-out`;standby.style.opacity='0';standby.getBoundingClientRect();standby.style.opacity='1';await sleep(transitionMs());}else standby.style.opacity='1';if(token!==serial)return;standby.style.transition='';if(video.src)video.play().then(()=>markStandbyVideoProgress('show-standby')).catch(()=>{});await ensureMusic('show-standby');setTimeout(()=>ensureMusic('show-standby-late').catch(()=>{}),350);}
  async function hideStandby(){const token=++serial;if(!showing&&standby.classList.contains('hidden-layer'))return;if(transitionOn()){standby.style.transition=`opacity ${transitionMs()}ms ease-in-out`;standby.style.opacity='1';standby.getBoundingClientRect();standby.style.opacity='0';await sleep(transitionMs());}else standby.style.opacity='0';if(token!==serial)return;standby.classList.add('hidden-layer');standby.style.transition='';standby.style.opacity='1';video.pause();showing=false;standbyPaused=false;standbyStallSignalAt=0;clearMusicRetry();publishStandbyVideoState('hide-standby');publishMusicState('hide-standby');}
  function apply(next={}){design={...design,...next};setSource();if(showing&&!standbyPaused){video.play().then(()=>markStandbyVideoProgress('design-apply')).catch(()=>{});ensureMusic('design-apply').catch(()=>{});}else{publishStandbyVideoState('design-apply-idle');publishMusicState('design-apply-idle');}}
  function retryStandbyMusic(){if(musicShouldPlay())setTimeout(()=>ensureMusic('event-retry').catch(()=>{}),0);}
  function noteStandbyStall(reason){if(!standbyVideoShouldPlay())return;standbyStallSignalAt=Date.now();publishStandbyVideoState(reason);setTimeout(()=>{if(standbyVideoShouldPlay()&&standbyStallSignalAt&&Date.now()-lastStandbyProgressAt>2600)recoverStandbyVideo(reason).catch(()=>{});},2800);}
  window.ECAPI.on('output:design',d=>{apply(d||{});setTimeout(retryStandbyMusic,120);setTimeout(retryStandbyMusic,650);});
  window.ECAPI.on('output:story',p=>{const nextMode=p?.mediaRole==='ad'?'ad':((p?.kind||'news')==='canned'?'content':'news');outputMode=nextMode;musicSerial++;clearMusicRetry();if(nextMode==='content'||nextMode==='ad'){try{musicEl.pause();}catch{}publishMusicState(`story-${nextMode}-music-stopped`);}hideStandby().catch(()=>{});});
  window.ECAPI.on('output:control',a=>{if(a==='stop')setTimeout(()=>showStandby().catch(()=>{}),0);if(a==='skip'){musicSerial++;clearMusicRetry();video.pause();const av=document.getElementById('audio'),cv=document.getElementById('cannedVideo');try{av?.pause();}catch{}try{cv?.pause();}catch{}publishStandbyVideoState('control-skip');publishMusicState('control-skip');}if(a==='pause'){standbyPaused=true;video.pause();clearMusicRetry();musicEl.pause();publishStandbyVideoState('control-pause');publishMusicState('control-pause');}if(a==='play'&&showing){standbyPaused=false;lastStandbyProgressAt=Date.now();standbyStallSignalAt=0;video.play().then(()=>markStandbyVideoProgress('control-play')).catch(()=>{});ensureMusic('control-play').catch(()=>{});}if(a==='standby-audio-kick'&&showing){standbyPaused=false;ensureMusic('main-kick').catch(()=>{});}});
  video.addEventListener('playing',()=>markStandbyVideoProgress('playing-event'));
  video.addEventListener('timeupdate',()=>{const t=Number(video.currentTime)||0;if(lastStandbyCurrentTime<0||Math.abs(t-lastStandbyCurrentTime)>.08)markStandbyVideoProgress('timeupdate');});
  video.addEventListener('canplay',()=>{if(standbyVideoShouldPlay()&&video.paused)video.play().catch(()=>{});publishStandbyVideoState('canplay-event');});
  video.addEventListener('stalled',()=>noteStandbyStall('stalled'));
  video.addEventListener('waiting',()=>noteStandbyStall('waiting'));
  video.addEventListener('error',()=>{video.classList.add('hidden');fallback.classList.remove('hidden');noteStandbyStall('error');});
  video.addEventListener('ended',()=>{if(video.src&&standbyVideoShouldPlay()){try{video.currentTime=0;video.play().then(()=>markStandbyVideoProgress('ended-loop')).catch(()=>{});}catch{}}});
  musicEl.addEventListener('playing',()=>publishMusicState('playing-event'));musicEl.addEventListener('pause',()=>publishMusicState('pause-event'));musicEl.addEventListener('canplay',retryStandbyMusic);musicEl.addEventListener('loadeddata',retryStandbyMusic);musicEl.addEventListener('error',()=>{publishMusicState('error-event');if(musicShouldPlay()){clearMusicRetry();musicRetryTimer=setTimeout(()=>ensureMusic('error-retry').catch(()=>{}),700);}});
  window.addEventListener('focus',()=>{retryStandbyMusic();if(standbyVideoShouldPlay())video.play().catch(()=>{});});window.addEventListener('pageshow',()=>{retryStandbyMusic();if(standbyVideoShouldPlay())video.play().catch(()=>{});});window.addEventListener('load',()=>{setTimeout(retryStandbyMusic,0);setTimeout(retryStandbyMusic,500);});document.addEventListener('visibilitychange',()=>{if(!document.hidden){retryStandbyMusic();if(standbyVideoShouldPlay()){lastStandbyProgressAt=Date.now();video.play().catch(()=>{});}}});document.addEventListener('pointerdown',retryStandbyMusic,{passive:true});
  startMusicWatchdog();startStandbyVideoWatchdog();
  (async()=>{try{const s=await window.ECAPI.getSettings();apply(s?.visual?.output||{});}catch{}await showStandby();setTimeout(retryStandbyMusic,180);setTimeout(retryStandbyMusic,650);setTimeout(retryStandbyMusic,1500);})();
})();
