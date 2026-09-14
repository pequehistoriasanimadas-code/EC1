'use strict';
(function installYoutubePromoV2Lab29(){
  if(window.__ecYoutubePromoV2Lab29Installed)return;
  if(!window.ECAPI||typeof stage==='undefined'){setTimeout(installYoutubePromoV2Lab29,80);return;}
  const q=s=>document.querySelector(s),num=(v,f)=>Number.isFinite(Number(v))?Number(v):f;
  let latestOutputDesign=null,tries=0;
  function formatOf(source={}){return String(source.format||stage?.dataset?.format||'16:9')==='9:16'?'9:16':'16:9';}
  function legacyGeometry(d,format){
    const scale=num(d.scale,format==='9:16'?.9:1),width=(format==='9:16'?78:39)*scale,minHeight=format==='9:16'?12:16,position=String(d.position||'bottom-left'),x=num(d.xPercent,format==='9:16'?5:4),y=num(d.yPercent,format==='9:16'?8:5),left=position.endsWith('left');
    return{centerXPercent:left?x+width/2:100-x-width/2,centerYPercent:position.startsWith('top')?y+minHeight/2:100-y-minHeight/2,widthPercent:width,minHeightPercent:minHeight};
  }
  function normalizedDesign(raw={},formatHint='16:9'){
    const d=raw&&typeof raw==='object'?raw:{},format=formatOf({format:d.format||formatHint});
    const legacy=Number.isFinite(Number(d.centerXPercent))?null:legacyGeometry(d,format);
    return{
      format,
      centerXPercent:num(d.centerXPercent,legacy?.centerXPercent??50),centerYPercent:num(d.centerYPercent,legacy?.centerYPercent??82),
      widthPercent:num(d.widthPercent,legacy?.widthPercent??(format==='9:16'?78:84)),minHeightPercent:num(d.minHeightPercent,legacy?.minHeightPercent??(format==='9:16'?12:23.8)),
      ctaFontSize:num(d.ctaFontSize,format==='9:16'?25:30),titleFontSize:num(d.titleFontSize,format==='9:16'?35:40),channelFontSize:num(d.channelFontSize,format==='9:16'?25:30),
      thumbnailScale:num(d.thumbnailScale,format==='9:16'?.97:1.45),backgroundOpacity:num(d.backgroundOpacity,format==='9:16'?.70:.66),borderRadius:num(d.borderRadius,14),paddingPercent:num(d.paddingPercent,format==='9:16'?2:1.2),gapPx:num(d.gapPx,18)
    };
  }
  function designFromOutput(output={}){
    const format=formatOf(output),root=output.youtubePromoDesign;
    if(root?.formats?.[format])return{...root.formats[format],format};
    return null;
  }
  function applyDesign(raw,formatHint){
    const root=q('#ecYoutubePromoOutput');if(!root)return false;const d=normalizedDesign(raw,formatHint),baseThumb=d.format==='9:16'?300:250;
    root.classList.add('ec-youtube-promo-v2');root.dataset.v2Format=d.format;
    root.style.setProperty('--yt-v2-center-x',`${d.centerXPercent}%`);root.style.setProperty('--yt-v2-center-y',`${d.centerYPercent}%`);
    root.style.setProperty('--yt-v2-width',`${d.widthPercent}%`);root.style.setProperty('--yt-v2-min-height',`${d.minHeightPercent}%`);
    root.style.setProperty('--yt-v2-padding',`${d.paddingPercent}%`);root.style.setProperty('--yt-v2-gap',`${d.gapPx}px`);
    root.style.setProperty('--yt-cta-size',`${d.ctaFontSize}px`);root.style.setProperty('--yt-title-size',`${d.titleFontSize}px`);root.style.setProperty('--yt-channel-size',`${d.channelFontSize}px`);
    root.style.setProperty('--yt-bg-opacity',String(d.backgroundOpacity));root.style.setProperty('--yt-radius',`${d.borderRadius}px`);
    root.style.setProperty('--yt-thumb-width',`${Math.round(baseThumb*d.thumbnailScale)}px`);root.style.setProperty('--yt-thumb-scale',String(d.thumbnailScale));
    window.__ecYoutubePromoV2Lab29Audit={format:d.format,design:d};return true;
  }
  function applyLatest(){const d=designFromOutput(latestOutputDesign||{});return d?applyDesign(d,d.format):false;}
  function bind(){
    if(!q('#ecYoutubePromoOutput')){if(tries++<100)setTimeout(bind,80);return;}
    if(window.__ecYoutubePromoV2Lab29Installed)return;
    window.__ecYoutubePromoV2Lab29Installed=true;
    window.ECAPI.on('output:design',design=>{latestOutputDesign=design||{};requestAnimationFrame(()=>applyLatest());});
    window.ECAPI.on('output:story',payload=>{const promo=payload?.youtubePromo;if(!promo?.enabled)return;requestAnimationFrame(()=>{if(promo.design&&typeof promo.design==='object'&&Object.keys(promo.design).length)applyDesign(promo.design,promo.design.format||stage?.dataset?.format);else applyLatest();});});
    window.ECAPI.getSettings?.().then(s=>{latestOutputDesign=s?.visual?.output||s||{};applyLatest();}).catch(()=>{});
  }
  bind();
})();
