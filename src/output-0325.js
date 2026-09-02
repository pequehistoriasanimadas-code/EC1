'use strict';

(function installOutput0325(){
  if(!window.__ecOutput0324||typeof applyDesign!=='function'||typeof setStoryContent!=='function'){setTimeout(installOutput0325,35);return;}
  if(window.__ecOutput0325)return;window.__ecOutput0325=true;
  const variants={regular:[400,'normal'],medium:[500,'normal'],semibold:[600,'normal'],bold:[700,'normal'],extrabold:[800,'normal'],black:[900,'normal'],italic:[400,'italic'],bolditalic:[700,'italic']};
  const rgba=(hex,a)=>{const raw=String(hex||'#000000').replace('#',''),h=raw.length===3?raw.split('').map(x=>x+x).join(''):raw,n=parseInt(h,16),alpha=Math.max(0,Math.min(1,Number(a)));return Number.isNaN(n)?`rgba(0,0,0,${alpha})`:`rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${alpha})`;};
  const root=document.documentElement.style;
  function variant(design,prefix,weightFallback){const key=String(design[`${prefix}FontVariant`]||'').toLowerCase(),v=variants[key]||[Number(design[`${prefix}FontWeight`])||weightFallback,design[`${prefix}FontItalic`]?'italic':'normal'];return{weight:Number(design[`${prefix}FontWeight`])||v[0],style:design[`${prefix}FontItalic`]===true?'italic':v[1]};}
  function setTextStyle(design,prefix,weightFallback){const v=variant(design,prefix,weightFallback);root.setProperty(`--${prefix}-font-weight`,String(Math.max(100,Math.min(900,v.weight))));root.setProperty(`--${prefix}-font-style`,v.style);root.setProperty(`--${prefix}-transform`,design[`${prefix}Uppercase`]?'uppercase':'none');}
  const baseApply=applyDesign;
  applyDesign=function(next={}){next={...next,exclusiveEnabled:true,exclusiveText:'EXCLUSIVO'};baseApply(next);design.exclusiveEnabled=true;design.exclusiveText='EXCLUSIVO';setTextStyle(design,'title',900);setTextStyle(design,'summary',400);setTextStyle(design,'category',900);setTextStyle(design,'date',500);setTextStyle(design,'exclusive',800);const categoryOpacity=design.categoryBgOpacity==null?1:Number(design.categoryBgOpacity),exclusiveOpacity=design.exclusiveBgOpacity==null?1:Number(design.exclusiveBgOpacity);root.setProperty('--cat-bg',rgba(design.categoryBgColor||'#F7C600',categoryOpacity));root.setProperty('--category-radius',`${Math.max(0,Math.min(40,Number(design.categoryRadius)||0))}px`);root.setProperty('--exclusive-bg',rgba(design.exclusiveBgColor||'#F7C600',exclusiveOpacity));root.setProperty('--exclusive-border',rgba(design.exclusiveBgColor||'#F7C600',exclusiveOpacity));root.setProperty('--exclusive-border-width','0px');root.setProperty('--exclusive-radius',`${Math.max(0,Math.min(40,Number(design.exclusiveRadius)||0))}px`);const badge=document.getElementById('exclusiveBadge');if(badge)badge.textContent='EXCLUSIVO';};
  const baseStory=setStoryContent;setStoryContent=async function(p){await baseStory(p);const badge=document.getElementById('exclusiveBadge');if(badge)badge.textContent='EXCLUSIVO';};
  try{applyDesign(design);}catch{}
})();
