'use strict';
(function installFinalCorrectionsLab29(){
  if(window.__ecFinalCorrectionsLab29Installed)return;
  const q=s=>document.querySelector(s);
  const APPROVED={
    '16:9':{preset:'custom',centerXPercent:50,centerYPercent:82,widthPercent:84,minHeightPercent:23.8,ctaFontSize:30,titleFontSize:40,channelFontSize:30,backgroundOpacity:.66,thumbnailScale:1.45,borderRadius:14,paddingPercent:1.2,gapPx:18},
    '9:16':{preset:'custom',centerXPercent:46.4,centerYPercent:76,widthPercent:78,minHeightPercent:12,ctaFontSize:25,titleFontSize:35,channelFontSize:25,backgroundOpacity:.70,thumbnailScale:.97,borderRadius:14,paddingPercent:2,gapPx:18}
  };
  const PAIRS=['ecV2PromoX','ecV2PromoY','ecV2PromoWidth','ecV2PromoHeight','ecV2PromoThumb','ecV2PromoOpacity','ecV2PromoPadding'];
  let tries=0,timer=null;

  function fixNumberPair(id){
    const range=q(`#${id}-range`),old=q(`#${id}-number`);if(!range||!old)return false;if(old.dataset.ecFinalNumberFixed==='1')return true;
    const n=old.cloneNode(true);n.dataset.ecFinalNumberFixed='1';old.replaceWith(n);
    const commitNumber=()=>{
      const raw=String(n.value??'').trim();
      if(raw===''){n.value=range.value;return;}
      range.value=raw;
      range.dispatchEvent(new Event('input',{bubbles:true}));
      queueMicrotask(()=>{n.value=range.value;});
    };
    n.addEventListener('change',commitNumber);
    n.addEventListener('blur',commitNumber);
    n.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();commitNumber();n.blur();}});
    range.addEventListener('input',()=>queueMicrotask(()=>{if(document.activeElement!==n)n.value=range.value;}));
    return true;
  }
  function setPair(id,value){const r=q(`#${id}-range`),n=q(`#${id}-number`);if(!r)return;r.value=String(value);if(n)n.value=String(value);r.dispatchEvent(new Event('input',{bubbles:true}));}
  function setInput(id,value){const el=q('#'+id);if(!el)return;el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}
  function currentFormat(){return String(q('#outputFormat')?.value||'16:9')==='9:16'?'9:16':'16:9';}
  function installReset(){
    const old=q('#ecV2ResetPromo');if(!old)return false;if(old.dataset.ecFinalResetFixed==='1')return true;
    const b=old.cloneNode(true);b.dataset.ecFinalResetFixed='1';old.replaceWith(b);
    b.onclick=()=>{
      const format=currentFormat(),d=APPROVED[format];
      if(!confirm(`¿Restaurar Promo ${format}?`))return;
      // X/Y primero convierten el preset actual a Personalizado antes de cambiar tamaño.
      setPair('ecV2PromoX',d.centerXPercent);setPair('ecV2PromoY',d.centerYPercent);
      setPair('ecV2PromoWidth',d.widthPercent);setPair('ecV2PromoHeight',d.minHeightPercent);
      setInput('ecV2PromoCtaSize',d.ctaFontSize);setInput('ecV2PromoTitleSize',d.titleFontSize);setInput('ecV2PromoChannelSize',d.channelFontSize);
      setPair('ecV2PromoThumb',Math.round(d.thumbnailScale*100));setPair('ecV2PromoOpacity',Math.round(d.backgroundOpacity*100));
      setInput('ecV2PromoRadius',d.borderRadius);setInput('ecV2PromoGap',d.gapPx);setPair('ecV2PromoPadding',d.paddingPercent);
    };
    return true;
  }
  function apply(){
    if(!q('#ecEmissionV2PromoCard'))return false;
    const pairs=PAIRS.every(fixNumberPair),reset=installReset();
    if(pairs&&reset){window.__ecFinalPromoInputAudit={numericCommit:'blur/change/Enter',defaults:APPROVED};return true;}
    return false;
  }
  function reconcile(){clearTimeout(timer);if(apply()){window.__ecFinalCorrectionsLab29Installed=true;return;}if(tries++<180)timer=setTimeout(reconcile,120);}
  window.ECAPI?.on?.('profile:changed',()=>setTimeout(()=>{window.__ecFinalCorrectionsLab29Installed=false;tries=0;reconcile();},300));
  reconcile();
})();
