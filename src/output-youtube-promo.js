'use strict';
(function installYoutubePromoOutputLab27(){
  if(window.__ecYoutubePromoOutputInstalled)return;
  if(!window.ECAPI||typeof stage==='undefined'||typeof cannedVideo==='undefined'){setTimeout(installYoutubePromoOutputLab27,80);return;}
  window.__ecYoutubePromoOutputInstalled=true;
  let snapshot=null,shown=false,clearToken=0;
  const root=document.createElement('div');root.id='ecYoutubePromoOutput';root.className='ec-youtube-promo instant-clear';root.innerHTML='<img class="ec-youtube-promo-thumb" alt=""><div class="ec-youtube-promo-copy"><div class="ec-youtube-promo-kicker">Puedes ver el video aquí:</div><div class="ec-youtube-promo-title"></div><div class="ec-youtube-promo-channel"></div></div>';stage.appendChild(root);
  const thumb=root.querySelector('.ec-youtube-promo-thumb'),kickerEl=root.querySelector('.ec-youtube-promo-kicker'),titleEl=root.querySelector('.ec-youtube-promo-title'),channelEl=root.querySelector('.ec-youtube-promo-channel');
  const num=(v,fallback)=>Number.isFinite(Number(v))?Number(v):fallback;
  function applyDesign(design={}){
    const d=design&&typeof design==='object'?design:{};root.dataset.position=String(d.position||'bottom-left');
    root.style.setProperty('--yt-x',`${num(d.xPercent,4)}%`);root.style.setProperty('--yt-y',`${num(d.yPercent,5)}%`);root.style.setProperty('--yt-scale',String(num(d.scale,1)));
    root.style.setProperty('--yt-cta-size',`${num(d.ctaFontSize,22)}px`);root.style.setProperty('--yt-title-size',`${num(d.titleFontSize,18)}px`);root.style.setProperty('--yt-channel-size',`${num(d.channelFontSize,14)}px`);
    root.style.setProperty('--yt-bg-opacity',String(num(d.backgroundOpacity,.85)));root.style.setProperty('--yt-thumb-scale',String(num(d.thumbnailScale,1)));root.style.setProperty('--yt-radius',`${num(d.borderRadius,14)}px`);root.style.setProperty('--yt-title-lines',String(Math.max(1,Math.min(4,Math.round(num(d.titleMaxLines,2))))));
  }
  function resetDesign(){applyDesign({});}
  function clearYouTubePromo({forget=true}={}){
    const token=++clearToken;shown=false;root.classList.add('instant-clear');root.classList.remove('visible');if(forget)snapshot=null;
    requestAnimationFrame(()=>requestAnimationFrame(()=>{if(token===clearToken)root.classList.remove('instant-clear');}));
    if(forget){thumb.removeAttribute('src');kickerEl.textContent='Puedes ver el video aquí:';kickerEl.classList.remove('lab28-empty');titleEl.textContent='';channelEl.textContent='';resetDesign();}
  }
  function validSnapshot(p){
    const promo=p?.youtubePromo;if((p?.kind||'news')!=='canned'||String(p?.mediaRole||'')==='ad'||!promo?.enabled)return null;
    const lead=[5,7,10].includes(Number(promo.leadSeconds))?Number(promo.leadSeconds):10,title=String(promo.title||'').trim(),channel=String(promo.channel||'').trim(),thumbnailDataUrl=String(promo.thumbnailDataUrl||'');if(!title||!thumbnailDataUrl.startsWith('data:image/'))return null;return{videoId:String(promo.videoId||''),title,channel,thumbnailDataUrl,leadSeconds:lead,ctaText:promo.ctaText==null?'Puedes ver el video aquí:':String(promo.ctaText),design:promo.design&&typeof promo.design==='object'?promo.design:{}};
  }
  function arm(p){clearYouTubePromo();const next=validSnapshot(p);if(!next)return;snapshot=next;applyDesign(next.design);thumb.src=next.thumbnailDataUrl;kickerEl.textContent=next.ctaText;kickerEl.classList.toggle('lab28-empty',!next.ctaText.trim());titleEl.textContent=next.title;channelEl.textContent=next.channel;}
  function show(){if(!snapshot||shown)return;shown=true;root.classList.remove('instant-clear');root.getBoundingClientRect();root.classList.add('visible');}
  function onTime(){if(!snapshot||!Number.isFinite(cannedVideo.duration)||cannedVideo.duration<=0)return;const remain=Math.max(0,cannedVideo.duration-cannedVideo.currentTime);if(remain<=snapshot.leadSeconds&&remain>0.02){show();return;}if(shown&&remain>snapshot.leadSeconds+0.15){clearYouTubePromo({forget:false});}}
  cannedVideo.addEventListener('timeupdate',onTime);cannedVideo.addEventListener('durationchange',onTime);cannedVideo.addEventListener('ended',()=>clearYouTubePromo());cannedVideo.addEventListener('error',()=>clearYouTubePromo());cannedVideo.addEventListener('emptied',()=>clearYouTubePromo({forget:false}));
  window.ECAPI.on('output:story',p=>arm(p||{}));
  window.ECAPI.on('output:control',action=>{if(String(action||'')==='stop')clearYouTubePromo();});
  window.addEventListener('beforeunload',()=>clearYouTubePromo(),{once:true});
  window.clearYouTubePromo=clearYouTubePromo;
})();
