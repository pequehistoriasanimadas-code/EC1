'use strict';
(function installLab28OutputPromoCta(){
  if(window.__ecLab28OutputPromoCta)return;
  if(!window.ECAPI||typeof window.ECAPI.on!=='function'){setTimeout(installLab28OutputPromoCta,100);return;}
  window.__ecLab28OutputPromoCta=true;
  const DEFAULT_CTA='Puedes ver el video aquí:';
  function apply(payload){
    const kicker=document.querySelector('.ec-youtube-promo-kicker');if(!kicker)return;
    const promo=payload?.youtubePromo,role=String(payload?.mediaRole||''),kind=String(payload?.kind||'');
    if(kind!=='canned'||role!=='content'||!promo?.enabled){kicker.classList.remove('lab28-empty');return;}
    const text=promo.ctaText==null?DEFAULT_CTA:String(promo.ctaText);kicker.textContent=text;kicker.classList.toggle('lab28-empty',!text.trim());
  }
  window.ECAPI.on('output:story',apply);
})();
