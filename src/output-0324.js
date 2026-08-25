'use strict';

(function installOutput0324(){
  if(typeof applyDesign!=='function'||typeof setStoryContent!=='function'||typeof makeStorySnapshot!=='function'){
    setTimeout(installOutput0324,30);
    return;
  }
  if(window.__ecOutput0324)return;
  window.__ecOutput0324=true;

  let exclusive=document.getElementById('exclusiveBadge');
  if(!exclusive){
    exclusive=document.createElement('div');
    exclusive.id='exclusiveBadge';
    exclusive.textContent='EXCLUSIVO';
    const meta=document.getElementById('metaRow');
    if(meta)meta.appendChild(exclusive);
  }

  const loadedFonts=new Set();
  function loadCustomFonts(list){
    for(const x of list||[]){
      const family=String(x?.family||'');
      const url=String(x?.url||'');
      const key=`${family}|${url}`;
      if(!family||!url||loadedFonts.has(key))continue;
      loadedFonts.add(key);
      try{
        const face=new FontFace(family,`url("${url.replace(/"/g,'%22')}")`);
        face.load().then(f=>document.fonts.add(f)).catch(()=>loadedFonts.delete(key));
      }catch{
        loadedFonts.delete(key);
      }
    }
  }

  const baseApplyDesign=applyDesign;
  applyDesign=function(next={}){
    baseApplyDesign(next);
    loadCustomFonts(design.customFonts);
    const root=document.documentElement.style;
    const set=(key,value)=>root.setProperty(key,value);
    const font=(value,fallback='Arial')=>`"${String(value||fallback).replace(/"/g,'')}",sans-serif`;
    const px=(value,fallback,min,max)=>`${Math.max(min,Math.min(max,Number(value)||fallback))}px`;
    const weight=(value,fallback)=>Math.max(100,Math.min(900,Number(value)||fallback));

    set('--title-font-family',font(design.titleFontFamily||design.fontFamily));
    set('--summary-font-family',font(design.summaryFontFamily||design.fontFamily));
    set('--category-font-family',font(design.categoryFontFamily||design.fontFamily));
    set('--date-font-family',font(design.dateFontFamily||design.fontFamily));
    set('--exclusive-font-family',font(design.exclusiveFontFamily||design.fontFamily));

    set('--title-font-size',px(design.titleFontSize,70,20,120));
    set('--summary-font-size',px(design.summaryFontSize,34,12,72));
    set('--category-font-size',px(design.categoryFontSize,28,10,48));
    set('--date-font-size',px(design.dateFontSize,27,10,48));
    set('--exclusive-font-size',px(design.exclusiveFontSize,24,10,48));

    set('--title-font-weight',weight(design.titleFontWeight,900));
    set('--summary-font-weight',weight(design.summaryFontWeight,400));
    set('--category-font-weight',weight(design.categoryFontWeight,900));
    set('--date-font-weight',weight(design.dateFontWeight,500));
    set('--exclusive-font-weight',weight(design.exclusiveFontWeight,800));

    set('--exclusive-color',design.exclusiveTextColor||'#000000');
    set('--exclusive-bg',design.exclusiveBgColor||'#F7C600');
    set('--exclusive-border',design.exclusiveBorderColor||design.exclusiveBgColor||'#F7C600');
    set('--exclusive-border-width',px(design.exclusiveBorderWidth,0,0,8));
    set('--exclusive-radius',px(design.exclusiveRadius,5,0,30));

    exclusive.textContent=String(design.exclusiveText||'EXCLUSIVO').slice(0,32);
    if(design.exclusiveEnabled===false)exclusive.classList.remove('show');
  };

  transitionEnabled=function(){return design.transitionType!=='none';};

  const baseSetStory=setStoryContent;
  setStoryContent=async function(p){
    await baseSetStory(p);
    const show=!!p?.isExclusive&&design.exclusiveEnabled!==false;
    exclusive.textContent=String(design.exclusiveText||'EXCLUSIVO').slice(0,32);
    exclusive.classList.toggle('show',show);
    exclusive.dataset.publisher=String(p?.publisherName||'');
  };

  const baseSnapshot=makeStorySnapshot;
  makeStorySnapshot=function(){
    const snap=baseSnapshot();
    if(!snap)return snap;
    const meta=snap.querySelector('.snapshot-meta-row');
    if(meta&&exclusive.classList.contains('show')){
      const ex=document.createElement('div');
      ex.className='snapshot-exclusive show';
      ex.textContent=exclusive.textContent;
      meta.appendChild(ex);
    }
    return snap;
  };

  try{applyDesign(design);}catch{}
})();
