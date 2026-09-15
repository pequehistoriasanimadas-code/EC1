'use strict';

const DEFAULT_CTA='Puedes ver el video aquí:';
const POSITIONS=new Set(['bottom-left','bottom-right','top-left','top-right']);
const clamp=(value,min,max,fallback)=>{const n=Number(value);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;};
const formatKey=value=>String(value||'16:9')==='9:16'?'9:16':'16:9';

const DEFAULT_YOUTUBE_PROMO_DESIGN={
  ctaText:DEFAULT_CTA,
  formats:{
    '16:9':{position:'bottom-left',xPercent:4,yPercent:5,scale:1,ctaFontSize:22,titleFontSize:18,channelFontSize:14,backgroundOpacity:.85,thumbnailScale:1,borderRadius:14,titleMaxLines:2},
    '9:16':{position:'bottom-left',xPercent:5,yPercent:8,scale:.9,ctaFontSize:22,titleFontSize:18,channelFontSize:14,backgroundOpacity:.85,thumbnailScale:1,borderRadius:14,titleMaxLines:2}
  }
};

function normalizeFormat(raw={},format='16:9'){
  const key=formatKey(format),d=DEFAULT_YOUTUBE_PROMO_DESIGN.formats[key],r=raw&&typeof raw==='object'?raw:{};
  const position=POSITIONS.has(String(r.position||''))?String(r.position):d.position;
  return{
    position,
    xPercent:clamp(r.xPercent,0,40,d.xPercent),
    yPercent:clamp(r.yPercent,0,40,d.yPercent),
    scale:clamp(r.scale,.55,1.5,d.scale),
    ctaFontSize:clamp(r.ctaFontSize,10,72,d.ctaFontSize),
    titleFontSize:clamp(r.titleFontSize,10,72,d.titleFontSize),
    channelFontSize:clamp(r.channelFontSize,10,72,d.channelFontSize),
    backgroundOpacity:clamp(r.backgroundOpacity,.35,1,d.backgroundOpacity),
    thumbnailScale:clamp(r.thumbnailScale,.6,1.6,d.thumbnailScale),
    borderRadius:clamp(r.borderRadius,0,40,d.borderRadius),
    titleMaxLines:Math.round(clamp(r.titleMaxLines,1,4,d.titleMaxLines))
  };
}

function normalizeYoutubePromoDesignRoot(raw={},legacyCta){
  const r=raw&&typeof raw==='object'?raw:{},ctaSource=Object.prototype.hasOwnProperty.call(r,'ctaText')?r.ctaText:(legacyCta==null?DEFAULT_CTA:legacyCta),formats=r.formats&&typeof r.formats==='object'?r.formats:{};
  return{
    ctaText:String(ctaSource??'').slice(0,140),
    formats:{
      '16:9':normalizeFormat(formats['16:9'],'16:9'),
      '9:16':normalizeFormat(formats['9:16'],'9:16')
    }
  };
}

function normalizeYoutubePromoDesign(raw={},format='16:9',legacyCta){
  const root=normalizeYoutubePromoDesignRoot(raw,legacyCta),key=formatKey(format);
  return{...root.formats[key],format:key,ctaText:root.ctaText};
}

module.exports={DEFAULT_CTA,DEFAULT_YOUTUBE_PROMO_DESIGN,normalizeYoutubePromoDesignRoot,normalizeYoutubePromoDesign};
