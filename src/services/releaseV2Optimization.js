'use strict';
const {LocalRuntime}=require('./localRuntime');
const LABELS={chatterbox:'Chatterbox V3',qwen3tts:'Qwen3-TTS 0.6B'};
const SWAP_VOICE_TEXT='EC Automatic News verifica el modo seguro de memoria. La inteligencia artificial de texto libera la GPU y el motor de voz genera esta locución antes de devolver el turno.';
const COORDINATED_TEXT='Devuelve únicamente JSON válido con title, summary y script. title debe ser "Prueba coordinada". summary debe indicar que GEC verifica rendimiento. script debe tener unas ochenta palabras sobre una prueba técnica de producción, sin markdown.';

function installV2Optimization(){
  const p=LocalRuntime.prototype;
  if(p.__gecV2Optimization)return;
  Object.defineProperty(p,'__gecV2Optimization',{value:true});
  const base=p.benchmarkLocalAI;
  if(typeof base!=='function')return;
  if(typeof p.stopAndWait!=='function')p.stopAndWait=async function(reason='v2-stop',timeoutMs=5000){const child=this.server;this.stop(reason);if(!child)return true;const end=Date.now()+Math.max(500,Number(timeoutMs)||5000);while(Date.now()<end&&child.exitCode==null){await new Promise(r=>setTimeout(r,100));}try{if(child.exitCode==null)child.kill();}catch{}await new Promise(r=>setTimeout(r,100));return true;};

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

    // Lab.15: "GPU coordinada" is no longer inferred merely because both
    // models fit in VRAM. Prove the real production pattern: both remain
    // resident, but their heavy generations run one after the other.
    let coordinated=null;
    if(isolated>0&&errorFree&&rtf>0&&vramSafe&&args?.kokoro?.generate&&typeof this.__ec0320Request==='function'){
      try{
        const q=await this.__ec0320Request(COORDINATED_TEXT,{maxTokens:180,timeoutMs:180000});
        const coordinatedTps=Number(q?.metrics?.tokensPerSec||0);
        const audio=await args.kokoro.generate(SWAP_VOICE_TEXT,{voice:args.voice||'ef_dora',speed:Number(args.speed)||1});
        const coordinatedRtf=Number(audio?.steadyRealtimeFactor||audio?.realtimeFactor||0);
        try{if(audio?.path)args.kokoro.cleanupAudio?.(audio.path);}catch{}
        const tpsRatio=isolated>0?coordinatedTps/isolated:0;
        const tpsOk=coordinatedTps>0&&tpsRatio>=.70;
        const voiceOk=coordinatedRtf>0&&coordinatedRtf<=2.20;
        coordinated={safe:tpsOk&&voiceOk,tokensPerSec:coordinatedTps,rtf:coordinatedRtf,tpsRatio,reason:!tpsOk?`Qwen coordinado conservó solo ${Math.round(tpsRatio*100)}% del rendimiento aislado`:!voiceOk?`TTS coordinado RTF ${coordinatedRtf.toFixed(2)} > 2.20`:''};
      }catch(e){coordinated={safe:false,error:String(e?.message||e)};}
    }

    if(coordinated?.safe){
      const coordinationReason=(reasons.join(' · ')||'la ejecución simultánea degradó el rendimiento')+` · secuencial residente validado: Qwen ${coordinated.tokensPerSec.toFixed(1)} tok/s, voz RTF ${coordinated.rtf.toFixed(2)}`;
      return{
        ...result,
        ok:true,
        coexistence:{
          safe:true,
          mode:'gpu-coordinated',
          engine,
          rtf:coordinated.rtf,
          isolatedTps:isolated,
          overlapTps,
          coordinatedTps:coordinated.tokensPerSec,
          coordinatedRtf:coordinated.rtf,
          coordinatedTpsRatio:coordinated.tpsRatio,
          coordinatedValidated:true,
          vramUsedMb:used,
          vramTotalMb:total,
          simultaneousSafe:false,
          reasons,
          coordinationReason
        },
        summary:{
          ...(result.summary||{}),
          voiceLimit:2.20,
          ttsEngine:engine,
          coexistenceMode:'gpu-coordinated',
          simultaneousSafe:false,
          coordinatedValidated:true,
          coordinatedTps:coordinated.tokensPerSec,
          coordinatedRtf:coordinated.rtf,
          coordinatedTpsRatio:coordinated.tpsRatio,
          coordinationReason
        }
      };
    }
    if(coordinated&&!coordinated.safe)reasons.push(coordinated.error?`GPU coordinada falló: ${coordinated.error}`:`GPU coordinada descartada: ${coordinated.reason||'rendimiento insuficiente'}`);

    // An overlap error, VRAM pressure, or failed coordinated validation must
    // prove a true unload/reload path before enabling GPU SWAP.
    // "GPU coordinada" merely because local Qwen worked in isolation.
    // Prove a true unload/reload path before enabling GPU SWAP.
    let swap=null;
    if(isolated>0&&args?.kokoro?.generate){
      try{
        await this.stopAndWait('v2-swap-validation-release-local',5000);
        const audio=await args.kokoro.generate(SWAP_VOICE_TEXT,{voice:args.voice||'ef_dora',speed:Number(args.speed)||1});
        const swapRtf=Number(audio?.steadyRealtimeFactor||audio?.realtimeFactor||0);
        if(!audio?.path||!swapRtf)throw new Error('el motor de voz no produjo audio válido en modo secuencial');
        try{args.kokoro.cleanupAudio?.(audio.path);}catch{}
        await args.kokoro.stopAndWait?.('v2-swap-validation-release-tts',5000);
        await new Promise(r=>setTimeout(r,500));
        await this.start();
        swap={safe:true,rtf:swapRtf};
      }catch(e){
        swap={safe:false,error:String(e?.message||e)};
        try{await args.kokoro?.stopAndWait?.('v2-swap-validation-cleanup',5000);}catch{}
        try{await this.start();}catch{}
      }
    }

    if(swap?.safe){
      const coordinationReason=(reasons.join(' · ')||'los dos modelos no deben permanecer residentes al mismo tiempo')+' · validación secuencial superada';
      return{
        ...result,
        ok:true,
        coexistence:{
          safe:true,
          mode:'gpu-swap',
          engine,
          rtf:swap.rtf,
          isolatedTps:isolated,
          overlapTps,
          vramUsedMb:used,
          vramTotalMb:total,
          simultaneousSafe:false,
          swapValidated:true,
          reasons,
          coordinationReason
        },
        summary:{
          ...(result.summary||{}),
          voiceLimit:1.6,
          ttsEngine:engine,
          coexistenceMode:'gpu-swap',
          simultaneousSafe:false,
          swapValidated:true,
          swapRtf:swap.rtf,
          coordinationReason
        }
      };
    }

    if(swap?.error)reasons.push(`GPU SWAP falló: ${swap.error}`);
    return{
      ...result,
      ok:false,
      error:`${label} no superó una configuración segura junto a Qwen en esta computadora: ${reasons.join(' · ')||'prueba simultánea y secuencial no superadas'}`,
      coexistence:{safe:false,mode:'unavailable',engine,rtf,isolatedTps:isolated,overlapTps,vramUsedMb:used,vramTotalMb:total,reasons,swap}
    };
  };
}
module.exports={installV2Optimization};
