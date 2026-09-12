'use strict';

const NOTE_SCHEMA=2;
const PROMO_SCHEMA=2;
const DEFAULT_CTA='Puedes ver el video aquí:';
const PRESETS=new Set(['top-left','top-center','top-right','bottom-left','bottom-center','bottom-right','custom']);
const LEGACY_POSITIONS=new Set(['top-left','top-right','bottom-left','bottom-right']);

const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
const num=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
const clamp=(value,min,max,fallback)=>Math.max(min,Math.min(max,num(value,fallback)));
const formatKey=value=>String(value||'16:9')==='9:16'?'9:16':'16:9';
const bool=(value,fallback=true)=>value==null?fallback:value!==false;

const NOTE_DEFAULT={
  titleFontFamily:'Arial',titleFontVariant:'black',titleFontSize:70,titleUppercase:false,titleColor:'#FFFFFF',titleFontWeight:900,titleFontItalic:false,
  summaryFontFamily:'Arial',summaryFontVariant:'regular',summaryFontSize:34,summaryUppercase:false,summaryColor:'#F3F3F3',summaryFontWeight:400,summaryFontItalic:false,
  categoryFontFamily:'Arial',categoryFontVariant:'black',categoryFontSize:28,categoryUppercase:true,categoryTextColor:'#000000',categoryFontWeight:900,categoryFontItalic:false,
  dateFontFamily:'Arial',dateFontVariant:'medium',dateFontSize:27,dateUppercase:true,dateColor:'#F3F3F3',dateFontWeight:500,dateFontItalic:false,
  exclusiveFontFamily:'Arial',exclusiveFontVariant:'extrabold',exclusiveFontSize:24,exclusiveUppercase:true,exclusiveTextColor:'#000000',exclusiveFontWeight:800,exclusiveFontItalic:false,
  categoryBgColor:'#F7C600',categoryBgOpacity:1,categoryRadius:0,
  exclusiveBgColor:'#F7C600',exclusiveBgOpacity:1,exclusiveRadius:5,
  lowerBgColor:'#000000',lowerOpacity:.88,
  animation:'auto',motionSpeed:'normal',
  visibility:{category:true,date:true,exclusive:true}
};

const PROMO_DEFAULT={
  '16:9':{preset:'bottom-left',centerXPercent:23.5,centerYPercent:87,widthPercent:39,minHeightPercent:16,ctaFontSize:22,titleFontSize:18,channelFontSize:14,backgroundOpacity:.85,thumbnailScale:1,borderRadius:14,paddingPercent:1.2,gapPx:18},
  '9:16':{preset:'bottom-left',centerXPercent:48,centerYPercent:78,widthPercent:78,minHeightPercent:12,ctaFontSize:22,titleFontSize:18,channelFontSize:14,backgroundOpacity:.85,thumbnailScale:1,borderRadius:14,paddingPercent:2,gapPx:18}
};

function noteLegacySeed(legacy={}){
  const o=legacy&&typeof legacy==='object'?legacy:{};
  const family=String(o.fontFamily||'Arial');
  return{
    titleFontFamily:String(o.titleFontFamily||family),titleFontVariant:String(o.titleFontVariant||'black'),titleFontSize:clamp(o.titleFontSize,8,140,70),titleUppercase:bool(o.titleUppercase,false),titleColor:String(o.titleColor||'#FFFFFF'),titleFontWeight:clamp(o.titleFontWeight,100,900,900),titleFontItalic:o.titleFontItalic===true,
    summaryFontFamily:String(o.summaryFontFamily||family),summaryFontVariant:String(o.summaryFontVariant||'regular'),summaryFontSize:clamp(o.summaryFontSize,8,140,34),summaryUppercase:bool(o.summaryUppercase,false),summaryColor:String(o.summaryColor||'#F3F3F3'),summaryFontWeight:clamp(o.summaryFontWeight,100,900,400),summaryFontItalic:o.summaryFontItalic===true,
    categoryFontFamily:String(o.categoryFontFamily||family),categoryFontVariant:String(o.categoryFontVariant||'black'),categoryFontSize:clamp(o.categoryFontSize,8,140,28),categoryUppercase:bool(o.categoryUppercase,true),categoryTextColor:String(o.categoryTextColor||'#000000'),categoryFontWeight:clamp(o.categoryFontWeight,100,900,900),categoryFontItalic:o.categoryFontItalic===true,
    dateFontFamily:String(o.dateFontFamily||family),dateFontVariant:String(o.dateFontVariant||'medium'),dateFontSize:clamp(o.dateFontSize,8,140,27),dateUppercase:bool(o.dateUppercase,true),dateColor:String(o.dateColor||o.summaryColor||'#F3F3F3'),dateFontWeight:clamp(o.dateFontWeight,100,900,500),dateFontItalic:o.dateFontItalic===true,
    exclusiveFontFamily:String(o.exclusiveFontFamily||family),exclusiveFontVariant:String(o.exclusiveFontVariant||'extrabold'),exclusiveFontSize:clamp(o.exclusiveFontSize,8,140,24),exclusiveUppercase:bool(o.exclusiveUppercase,true),exclusiveTextColor:String(o.exclusiveTextColor||'#000000'),exclusiveFontWeight:clamp(o.exclusiveFontWeight,100,900,800),exclusiveFontItalic:o.exclusiveFontItalic===true,
    categoryBgColor:String(o.categoryBgColor||'#F7C600'),categoryBgOpacity:clamp(o.categoryBgOpacity,0,1,1),categoryRadius:clamp(o.categoryRadius,0,40,0),
    exclusiveBgColor:String(o.exclusiveBgColor||'#F7C600'),exclusiveBgOpacity:clamp(o.exclusiveBgOpacity,0,1,1),exclusiveRadius:clamp(o.exclusiveRadius,0,40,5),
    lowerBgColor:String(o.lowerBgColor||'#000000'),lowerOpacity:clamp(o.lowerOpacity,0,1,.88),
    animation:['auto','zoom','vertical','horizontal','none'].includes(String(o.animation||''))?String(o.animation):'auto',
    motionSpeed:['slow','normal','fast'].includes(String(o.motionSpeed||''))?String(o.motionSpeed):'normal',
    visibility:{
      category:o.categoryVisible==null?true:o.categoryVisible!==false,
      date:o.dateVisible==null?true:o.dateVisible!==false,
      exclusive:o.exclusiveBadgeVisible==null?true:o.exclusiveBadgeVisible!==false
    }
  };
}

function normalizeNoteFormat(raw={},fallback=NOTE_DEFAULT){
  const r=raw&&typeof raw==='object'?raw:{},f=fallback&&typeof fallback==='object'?fallback:NOTE_DEFAULT;
  const base=noteLegacySeed({...f,...r});
  const visibility=r.visibility&&typeof r.visibility==='object'?r.visibility:{};
  base.visibility={
    category:visibility.category==null?bool(r.categoryVisible,f.visibility?.category!==false):visibility.category!==false,
    date:visibility.date==null?bool(r.dateVisible,f.visibility?.date!==false):visibility.date!==false,
    exclusive:visibility.exclusive==null?bool(r.exclusiveBadgeVisible,f.visibility?.exclusive!==false):visibility.exclusive!==false
  };
  return base;
}

function normalizeNoteDesignRoot(raw,legacyOutput={}){
  const legacy=normalizeNoteFormat(noteLegacySeed(legacyOutput),NOTE_DEFAULT),r=raw&&typeof raw==='object'?raw:{};
  const formats=r.formats&&typeof r.formats==='object'?r.formats:null;
  if(!formats)return{schemaVersion:NOTE_SCHEMA,formats:{'16:9':clone(legacy),'9:16':clone(legacy)}};
  return{schemaVersion:NOTE_SCHEMA,formats:{'16:9':normalizeNoteFormat(formats['16:9'],legacy),'9:16':normalizeNoteFormat(formats['9:16'],legacy)}};
}

function effectiveNoteDesign(output={},format=output?.format){
  const root=normalizeNoteDesignRoot(output?.noteDesign,output),key=formatKey(format);
  return clone(root.formats[key]);
}

function materializeEffectiveOutput(output={}){
  const o=output&&typeof output==='object'?clone(output):{},root=normalizeNoteDesignRoot(o.noteDesign,o),key=formatKey(o.format),note=root.formats[key];
  const result={...o,...clone(note),noteDesign:root};
  result.format=key;
  result.fontFamily=note.titleFontFamily||'Arial';
  result.dateFontFamily=note.dateFontFamily||result.fontFamily;
  result.categoryVisible=note.visibility.category!==false;
  result.dateVisible=note.visibility.date!==false;
  result.exclusiveBadgeVisible=note.visibility.exclusive!==false;
  // Editorial exclusivity is intentionally independent from visual badge visibility.
  result.exclusiveEnabled=o.exclusiveEnabled!==false;
  result.exclusiveText=String(o.exclusiveText||'EXCLUSIVO');
  return result;
}

function promoSafeRect(format='16:9',tiktokSafe=false){
  const key=formatKey(format);
  if(key!=='9:16'||!tiktokSafe)return{left:0,top:0,right:100,bottom:100};
  // Conservative UI-safe area for short-form platforms. Guides may be hidden, restriction stays active.
  return{left:6,top:10,right:88,bottom:82};
}

function legacyPromoGeometry(raw,key,options={}){
  const d=PROMO_DEFAULT[key],r=raw&&typeof raw==='object'?raw:{};
  if(Number.isFinite(Number(r.widthPercent))||Number.isFinite(Number(r.centerXPercent))||Number.isFinite(Number(r.centerYPercent)))return null;
  const scale=clamp(r.scale,.55,1.5,1),baseWidth=key==='9:16'?78:39,widthPercent=baseWidth*scale,minHeightPercent=key==='9:16'?12:16;
  const position=LEGACY_POSITIONS.has(String(r.position||''))?String(r.position):d.preset;
  const x=clamp(r.xPercent,0,40,key==='9:16'?5:4),y=clamp(r.yPercent,0,40,key==='9:16'?8:5);
  const isLeft=position.endsWith('left'),isTop=position.startsWith('top');
  return{
    preset:position,
    centerXPercent:isLeft?x+widthPercent/2:100-x-widthPercent/2,
    centerYPercent:isTop?y+minHeightPercent/2:100-y-minHeightPercent/2,
    widthPercent,minHeightPercent
  };
}

function clampPromoGeometry(raw,key,options={}){
  const rect=promoSafeRect(key,options.tiktokSafe===true),availableW=rect.right-rect.left,availableH=rect.bottom-rect.top,d=PROMO_DEFAULT[key];
  const widthPercent=clamp(raw.widthPercent,Math.min(20,availableW),availableW,d.widthPercent),minHeightPercent=clamp(raw.minHeightPercent,6,availableH,d.minHeightPercent);
  const halfW=widthPercent/2,halfH=minHeightPercent/2;
  const centerXPercent=clamp(raw.centerXPercent,rect.left+halfW,rect.right-halfW,(rect.left+rect.right)/2);
  const centerYPercent=clamp(raw.centerYPercent,rect.top+halfH,rect.bottom-halfH,(rect.top+rect.bottom)/2);
  return{widthPercent,minHeightPercent,centerXPercent,centerYPercent};
}

function presetGeometry(name,key,geometry={},tiktokSafe=false){
  const rect=promoSafeRect(key,tiktokSafe),base=clampPromoGeometry({...PROMO_DEFAULT[key],...geometry},key,{tiktokSafe});
  const x=name.endsWith('left')?rect.left+base.widthPercent/2:name.endsWith('right')?rect.right-base.widthPercent/2:(rect.left+rect.right)/2;
  const y=name.startsWith('top')?rect.top+base.minHeightPercent/2:rect.bottom-base.minHeightPercent/2;
  return{...base,centerXPercent:x,centerYPercent:y,preset:name};
}

function promoPreset(name,format='16:9',geometry={},tiktokSafe=false){
  const key=formatKey(format),preset=PRESETS.has(String(name))&&name!=='custom'?String(name):PROMO_DEFAULT[key].preset;
  return presetGeometry(preset,key,geometry,tiktokSafe);
}

function normalizePromoFormat(raw={},format='16:9',options={}){
  const key=formatKey(format),d=PROMO_DEFAULT[key],r=raw&&typeof raw==='object'?raw:{},legacy=legacyPromoGeometry(r,key,options);
  const requestedPreset=PRESETS.has(String(r.preset||''))?String(r.preset):(LEGACY_POSITIONS.has(String(r.position||''))?String(r.position):d.preset);
  const candidate={
    widthPercent:legacy?.widthPercent??clamp(r.widthPercent,20,100,d.widthPercent),
    minHeightPercent:legacy?.minHeightPercent??clamp(r.minHeightPercent,6,100,d.minHeightPercent),
    centerXPercent:legacy?.centerXPercent??num(r.centerXPercent,d.centerXPercent),
    centerYPercent:legacy?.centerYPercent??num(r.centerYPercent,d.centerYPercent)
  };
  const geo=clampPromoGeometry(candidate,key,options);
  let preset=requestedPreset;
  if(preset!=='custom'&&!legacy){
    const target=presetGeometry(preset,key,geo,options.tiktokSafe===true);
    if(Math.abs(candidate.centerXPercent-target.centerXPercent)>.25||Math.abs(candidate.centerYPercent-target.centerYPercent)>.25)preset='custom';
  }
  return{
    preset,
    ...geo,
    ctaFontSize:clamp(r.ctaFontSize,10,72,d.ctaFontSize),
    titleFontSize:clamp(r.titleFontSize,10,72,d.titleFontSize),
    channelFontSize:clamp(r.channelFontSize,10,72,d.channelFontSize),
    backgroundOpacity:clamp(r.backgroundOpacity,.2,1,d.backgroundOpacity),
    thumbnailScale:clamp(r.thumbnailScale,.5,1.8,d.thumbnailScale),
    borderRadius:clamp(r.borderRadius,0,60,d.borderRadius),
    paddingPercent:clamp(r.paddingPercent,.4,5,d.paddingPercent),
    gapPx:clamp(r.gapPx,0,80,d.gapPx)
  };
}

function normalizePromoDesignRoot(raw={},options={}){
  const r=raw&&typeof raw==='object'?raw:{},formats=r.formats&&typeof r.formats==='object'?r.formats:{};
  const legacyCta=options.legacyCta==null?DEFAULT_CTA:options.legacyCta;
  const cta=Object.prototype.hasOwnProperty.call(r,'ctaText')?r.ctaText:legacyCta;
  return{
    schemaVersion:PROMO_SCHEMA,
    ctaText:String(cta??'').slice(0,140),
    formats:{
      '16:9':normalizePromoFormat(formats['16:9'],'16:9',{tiktokSafe:false}),
      '9:16':normalizePromoFormat(formats['9:16'],'9:16',{tiktokSafe:options.tiktokSafe===true})
    }
  };
}

module.exports={
  NOTE_SCHEMA,PROMO_SCHEMA,DEFAULT_CTA,NOTE_DEFAULT,PROMO_DEFAULT,
  normalizeNoteFormat,normalizeNoteDesignRoot,effectiveNoteDesign,materializeEffectiveOutput,
  promoSafeRect,promoPreset,normalizePromoFormat,normalizePromoDesignRoot,formatKey
};
