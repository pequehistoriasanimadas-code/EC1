'use strict';

const {Providers}=require('./providers');

function sourceProfile(article={}){
  const chars=Math.max(0,Number(article.sourceChars)||String(article.body||'').length),mode=String(article.extractionMode||'article');
  if(chars<300)return{level:'critical',chars,mode,targetSeconds:30,label:'fuente muy breve'};
  if(chars<700)return{level:'brief',chars,mode,targetSeconds:45,label:'fuente breve'};
  return{level:'normal',chars,mode,targetSeconds:0,label:'fuente suficiente'};
}

function installSourceQualityGuard(){
  const proto=Providers.prototype;if(proto.__ec0321SourceGuardInstalled)return;Object.defineProperty(proto,'__ec0321SourceGuardInstalled',{value:true});
  const baseGenerate=proto.generate;
  proto.generate=async function(story,article,settings){
    if(story?.__editorialTest)return baseGenerate.call(this,story,article,settings);
    const q=sourceProfile(article||{}),currentTarget=Math.max(30,Math.min(180,Number(settings?.ai?.targetSeconds)||60));let effective=settings;
    if(q.level!=='normal'){
      const target=Math.min(currentTarget,q.targetSeconds),guard=q.level==='critical'
        ?'La extracción recuperó muy poco texto. Redacta únicamente una cápsula breve con hechos explícitos de la fuente. No completes contexto por conocimiento general. Si no alcanza para una nota fiable, usa status FUENTE_INSUFICIENTE.'
        :'La fuente recuperada es breve. Mantén la nota concisa, usa solo hechos explícitos y no alargues el guion para completar duración.';
      effective={...settings,ai:{...(settings?.ai||{}),targetSeconds:target,editorialInstructions:`${String(settings?.ai?.editorialInstructions||'').trim()}\n${guard}`.trim()}};
    }
    const out=await baseGenerate.call(this,story,article,effective);out.metrics={...(out.metrics||{}),sourceChars:q.chars,sourceExtractionMode:q.mode,sourceQualityLevel:q.level,requestedTargetSeconds:currentTarget,effectiveTargetSeconds:q.level==='normal'?currentTarget:Math.min(currentTarget,q.targetSeconds)};return out;
  };
}

function installVersion0321Policy(){installSourceQualityGuard();}
module.exports={installVersion0321Policy,sourceProfile};
