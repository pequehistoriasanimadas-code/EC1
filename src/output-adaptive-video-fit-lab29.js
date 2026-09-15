'use strict';
(function installAdaptiveVideoFitLab29(){
  if(window.__ecAdaptiveVideoFitLab29Installed)return;
  const q=s=>document.querySelector(s);
  const BOUND='ecAdaptiveVideoFitBound';
  const MATCH_TOLERANCE=.04;
  let observer=null,resizeObserver=null,retryTimer=null,tries=0;

  function stageAspect(){
    const stage=q('#stage');
    if(!stage)return 16/9;
    const w=Number(stage.clientWidth)||Number.parseFloat(stage.style.width)||0;
    const h=Number(stage.clientHeight)||Number.parseFloat(stage.style.height)||0;
    if(w>0&&h>0)return w/h;
    return String(stage.dataset.format||'16:9')==='9:16'?9/16:16/9;
  }

  function applyAdaptiveVideoFit(video){
    if(!video)return 'contain';
    const vw=Number(video.videoWidth)||0,vh=Number(video.videoHeight)||0;
    let fit='contain';
    if(vw>0&&vh>0){
      const source=vw/vh,target=stageAspect();
      const delta=target>0?Math.abs(source-target)/target:1;
      fit=delta<=MATCH_TOLERANCE?'cover':'contain';
      video.dataset.ecSourceAspect=source.toFixed(5);
      video.dataset.ecTargetAspect=target.toFixed(5);
      video.dataset.ecAspectDelta=delta.toFixed(5);
    }
    video.style.objectFit=fit;
    video.style.objectPosition='center center';
    video.dataset.ecAdaptiveFit=fit;
    return fit;
  }

  function bindVideo(video){
    if(!video)return false;
    if(video.dataset[BOUND]!=='1'){
      video.dataset[BOUND]='1';
      video.addEventListener('loadedmetadata',()=>applyAdaptiveVideoFit(video));
      video.addEventListener('emptied',()=>{video.style.objectFit='contain';video.dataset.ecAdaptiveFit='contain';});
    }
    applyAdaptiveVideoFit(video);
    return true;
  }

  function bindKnownVideos(){
    const cannedVideo=q('#cannedVideo'),standbyVideo=q('#standbyVideo');
    bindVideo(cannedVideo);bindVideo(standbyVideo);
    window.__ecAdaptiveVideoFitLab29State={
      canned:cannedVideo?.dataset.ecAdaptiveFit||'pending',
      standby:standbyVideo?.dataset.ecAdaptiveFit||'pending',
      outputAspect:stageAspect()
    };
    return !!cannedVideo;
  }

  function applyAll(){
    for(const video of [q('#cannedVideo'),q('#standbyVideo')])if(video)applyAdaptiveVideoFit(video);
    bindKnownVideos();
  }

  function observe(){
    const stage=q('#stage');
    if(stage&&typeof ResizeObserver==='function'&&!resizeObserver){resizeObserver=new ResizeObserver(()=>applyAll());resizeObserver.observe(stage);}
    if(!observer&&document.body){observer=new MutationObserver(()=>bindKnownVideos());observer.observe(document.body,{childList:true,subtree:true});}
  }

  function retry(){
    clearTimeout(retryTimer);
    bindKnownVideos();observe();
    if(q('#stage')&&q('#cannedVideo')){window.__ecAdaptiveVideoFitLab29Installed=true;return;}
    if(tries++<160)retryTimer=setTimeout(retry,100);
  }

  window.ECAPI?.on?.('output:design',()=>setTimeout(applyAll,0));
  window.addEventListener('resize',applyAll);
  window.__ecApplyAdaptiveVideoFitLab29=applyAdaptiveVideoFit;
  if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',retry,{once:true});else retry();
})();
