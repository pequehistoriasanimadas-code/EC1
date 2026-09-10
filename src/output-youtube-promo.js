'use strict';
(function installYoutubePromoOutputLab27(){
  if(window.__ecYoutubePromoOutputInstalled)return;
  if(!window.ECAPI||typeof stage==='undefined'||typeof cannedVideo==='undefined'){setTimeout(installYoutubePromoOutputLab27,80);return;}
  window.__ecYoutubePromoOutputInstalled=true;
  let snapshot=null,shown=false,clearToken=0;
  const root=document.createElement('div');root.id='ecYoutubePromoOutput';root.className='ec-youtube-promo instant-clear';root.innerHTML='<img class="ec-youtube-promo-thumb" alt=""><div class="ec-youtube-promo-copy"><div class="ec-youtube-promo-kicker">Puedes ver el video aquí:</div><div class="ec-youtube-promo-title"></div><div class="ec-youtube-promo-channel"></div></div>';stage.appendChild(root);
  const thumb=root.querySelector('.ec-youtube-promo-thumb'),titleEl=root.querySelector('.ec-youtube-promo-title'),channelEl=root.querySelector('.ec-youtube-promo-channel');
  function clearYouTubePromo({forget=true}={}){
    const token=++clearToken;shown=false;root.classList.add('instant-clear');root.classList.remove('visible');if(forget)snapshot=null;
    requestAnimationFrame(()=>requestAnimationFrame(()=>{if(token===clearToken)root.classList.remove('instant-clear');}));
    if(forget){thumb.removeAttribute('src');titleEl.textContent='';channelEl.textContent='';}
  }
  function validSnapshot(p){
    const promo=p?.youtubePromo;if((p?.kind||'news')!=='canned'||String(p?.mediaRole||'')==='ad'||!promo?.enabled)return null;
    const lead=[5,7,10].includes(Number(promo.leadSeconds))?Number(promo.leadSeconds):10,title=String(promo.title||'').trim(),channel=String(promo.channel||'').trim(),thumbnailDataUrl=String(promo.thumbnailDataUrl||'');if(!title||!thumbnailDataUrl.startsWith('data:image/'))return null;return{videoId:String(promo.videoId||''),title,channel,thumbnailDataUrl,leadSeconds:lead};
  }
  function arm(p){clearYouTubePromo();const next=validSnapshot(p);if(!next)return;snapshot=next;thumb.src=next.thumbnailDataUrl;titleEl.textContent=next.title;channelEl.textContent=next.channel;}
  function show(){if(!snapshot||shown)return;shown=true;root.classList.remove('instant-clear');root.getBoundingClientRect();root.classList.add('visible');}
  function onTime(){if(!snapshot||!Number.isFinite(cannedVideo.duration)||cannedVideo.duration<=0)return;const remain=Math.max(0,cannedVideo.duration-cannedVideo.currentTime);if(remain<=snapshot.leadSeconds&&remain>0.02){show();return;}if(shown&&remain>snapshot.leadSeconds+0.15){clearYouTubePromo({forget:false});}}
  cannedVideo.addEventListener('timeupdate',onTime);cannedVideo.addEventListener('durationchange',onTime);cannedVideo.addEventListener('ended',()=>clearYouTubePromo());cannedVideo.addEventListener('error',()=>clearYouTubePromo());cannedVideo.addEventListener('emptied',()=>clearYouTubePromo());
  window.ECAPI.on('output:story',p=>arm(p||{}));
  window.ECAPI.on('output:control',action=>{if(String(action||'')==='stop')clearYouTubePromo();});
  window.addEventListener('beforeunload',()=>clearYouTubePromo(),{once:true});
  window.clearYouTubePromo=clearYouTubePromo;
})();
