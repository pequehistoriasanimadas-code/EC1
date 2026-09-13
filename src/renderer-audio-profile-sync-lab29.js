'use strict';
(function installAudioProfileSyncLab29(){
  if(window.__ecAudioProfileSyncLab29)return;
  if(!window.ECAPI||!document.querySelector('#tab-audio')){setTimeout(installAudioProfileSyncLab29,120);return;}
  window.__ecAudioProfileSyncLab29=true;
  const q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)];
  let generation=0,retryTimer=null;

  function setValue(id,value){const el=q('#'+id);if(el&&document.activeElement!==el)el.value=value==null?'':String(value);}
  function show(el,on){if(el)el.classList.toggle('hidden',!on);}
  function syncActiveReference(referenceVoiceId){
    qa('#v2ReferenceList .v2-reference-row[data-id]').forEach(row=>{
      const active=String(row.dataset.id||'')===String(referenceVoiceId||'');
      let badge=row.querySelector('.v2-reference-active');
      if(active&&!badge){badge=document.createElement('span');badge.className='v2-reference-active';badge.textContent='ACTIVA';row.firstElementChild?.appendChild(badge);}
      else if(!active)badge?.remove();
    });
  }
  function syncKokoroSpecific(engine){
    const attack=q('#initialAttackProtection')?.closest('.switch-row'),padding=q('#initialAttackPaddingMs')?.closest('label');
    attack?.classList.toggle('ec29-engine-specific-hidden',engine!=='kokoro');
    padding?.classList.toggle('ec29-engine-specific-hidden',engine!=='kokoro');
  }
  function applySettings(fresh){
    if(!fresh?.tts)return false;
    try{if(typeof settings!=='undefined'&&settings){settings.tts=fresh.tts;settings.ai=fresh.ai||settings.ai;}}catch{}
    const t=fresh.tts,engine=String(t.engine||'kokoro'),style=String(t.style||'news'),referenceVoiceId=String(t.referenceVoiceId||''),qwen=t.engineParams?.qwen3tts||{},chatter=t.engineParams?.chatterbox||{};
    setValue('v2TtsEngine',engine);setValue('v2VoiceStyle',style);setValue('v2QwenVoiceMode',qwen.voiceMode||'reference');setValue('v2FineTunedModel',qwen.fineTunedModelId||'');
    setValue('v2ChatterExaggeration',Number(chatter.exaggeration??.45));setValue('v2ChatterCfg',Number(chatter.cfgWeight??.40));setValue('v2QwenTemperature',Number(qwen.temperature??.78));
    if(t.voice!=null)setValue('voice',t.voice);
    const ref=q('#v2ReferenceVoice');
    if(ref&&[...ref.options].some(o=>o.value===referenceVoiceId))ref.value=referenceVoiceId;
    const external=q('#v2ExternalVoice'),qwenRow=q('#v2QwenModeRow'),latam=q('#v2ChatterLatamNote'),fineLabel=q('#v2FineTunedSelectLabel'),referenceRow=q('#v2ReferenceRow'),referenceManager=q('#v2ReferenceManager'),fineManager=q('#v2FineTunedManager');
    const externalEngine=engine!=='kokoro',fineMode=engine==='qwen3tts'&&String(qwen.voiceMode||'reference')==='finetuned';
    show(external,externalEngine);show(qwenRow,engine==='qwen3tts');show(latam,engine==='chatterbox');show(fineLabel,fineMode);show(referenceRow,externalEngine&&!fineMode);show(referenceManager,externalEngine&&!fineMode);show(fineManager,fineMode);
    q('#v2CheckConsistency')?.classList.toggle('hidden',engine!=='chatterbox');
    q('#v2ChatterboxAdvanced')?.classList.toggle('hidden',engine!=='chatterbox');q('#v2QwenAdvanced')?.classList.toggle('hidden',engine!=='qwen3tts');
    syncKokoroSpecific(engine);syncActiveReference(referenceVoiceId);
    window.__ecAudioProfileSyncLab29Audit={engine,style,referenceVoiceId,profileApplied:true};
    return !referenceVoiceId||!!(ref&&[...ref.options].some(o=>o.value===referenceVoiceId));
  }
  async function reconcileProfile(attempt=0,token=generation){
    if(token!==generation)return;
    try{
      const fresh=await window.ECAPI.getSettings();if(token!==generation)return;
      const complete=applySettings(fresh);
      if(!complete&&attempt<12){clearTimeout(retryTimer);retryTimer=setTimeout(()=>reconcileProfile(attempt+1,token),120);}
    }catch{
      if(attempt<6){clearTimeout(retryTimer);retryTimer=setTimeout(()=>reconcileProfile(attempt+1,token),180);}
    }
  }
  function scheduleProfileSync(){generation++;clearTimeout(retryTimer);const token=generation;setTimeout(()=>reconcileProfile(0,token),260);}

  window.ECAPI.on?.('profile:changed',scheduleProfileSync);
  if(document.readyState==='complete')scheduleProfileSync();else window.addEventListener('load',scheduleProfileSync,{once:true});
})();
