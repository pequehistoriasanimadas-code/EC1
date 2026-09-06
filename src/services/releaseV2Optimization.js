'use strict';
const {LocalRuntime}=require('./localRuntime');
const LABELS={chatterbox:'Chatterbox V3',qwen3tts:'Qwen3-TTS 0.6B'};

function installV2Optimization(){
  const p=LocalRuntime.prototype;
  if(p.__gecV2Optimization)return;
  Object.defineProperty(p,'__gecV2Optimization',{value:true});
  const base=p.benchmarkLocalAI;
  if(typeof base!=='function')return;

  p.benchmarkLocalAI=async function(args={}){
    const result=await base.call(this,args);
    const engine=String(args?.settings?.tts?.engine||'kokoro');
    if(engine==='kokoro'||!result?.ok)return result;

    const row=(result.results||[]).find(x=>x.id===result.recommendedId)||(result.results||[]).find(x=>x.overlap)||{};
    const o=row?.overlap||result.summary?.overlap||{};
    const label=LABELS[engine]||engine;
    const rtf=Number(o.voiceRtf||0);
    const isolated=Number(row?.tokensPerSec||result.summary?.tokensPerSec||0);
    const overlapTps=Number(o.qwenTokensPerSec||0);
    const used=Number(o.vramMaxMb||0);
    const total=Number(o.vramTotalMb||0);
    const vramSafe=!total||used<total*.96;
    const tpsSafe=!isolated||!overlapTps||overlapTps>=isolated*.65;
    const voiceSafe=rtf>0&&rtf<=1.6;
    const errorFree=!o.error;
    const simultaneousSafe=errorFree&&vramSafe&&tpsSafe&&voiceSafe;

    if(simultaneousSafe){
      return{
        ...result,
        coexistence:{safe:true,mode:'simultaneous',engine,rtf,isolatedTps:isolated,overlapTps,vramUsedMb:used,vramTotalMb:total},
        summary:{...(result.summary||{}),voiceLimit:1.6,ttsEngine:engine,coexistenceMode:'simultaneous'}
      };
    }

    const reasons=[];
    if(o.error)reasons.push(String(o.error));
    if(!voiceSafe)reasons.push(rtf?`RTF simultáneo ${rtf.toFixed(2)} > 1.60`:'sin audio TTS válido');
    if(!tpsSafe)reasons.push(`Qwen cayó de ${isolated.toFixed(1)} a ${overlapTps.toFixed(1)} tok/s`);
    if(!vramSafe)reasons.push(`VRAM ${Math.round(used)}/${Math.round(total)} MB`);

    // V2 experimental TTS engines share the NVIDIA GPU with local Qwen.
    // When overlap is unsafe but both isolated stages worked, keep the
    // staggered two-news pipeline and serialize only the heavy GPU sections.
    if(isolated>0){
      const coordinationReason=reasons.join(' · ')||'la prueba simultánea no superó el margen de seguridad';
      return{
        ...result,
        ok:true,
        coexistence:{
          safe:true,
          mode:'gpu-coordinated',
          engine,
          rtf,
          isolatedTps:isolated,
          overlapTps,
          vramUsedMb:used,
          vramTotalMb:total,
          simultaneousSafe:false,
          reasons,
          coordinationReason
        },
        summary:{
          ...(result.summary||{}),
          voiceLimit:1.6,
          ttsEngine:engine,
          coexistenceMode:'gpu-coordinated',
          simultaneousSafe:false,
          coordinationReason
        }
      };
    }

    return{
      ...result,
      ok:false,
      error:`${label} todavía no tiene una configuración segura junto a Qwen en esta computadora: ${reasons.join(' · ')||'prueba simultánea no superada'}`,
      coexistence:{safe:false,mode:'unavailable',engine,rtf,isolatedTps:isolated,overlapTps,vramUsedMb:used,vramTotalMb:total,reasons}
    };
  };
}
module.exports={installV2Optimization};
