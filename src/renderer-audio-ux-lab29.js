'use strict';
(function installAudioUxLab29(){
  if(window.__ecAudioUxLab29)return;
  if(!window.ECAPI||!document.querySelector('#ec27VoiceSlot')||!document.querySelector('#v2TtsEngine')){
    setTimeout(installAudioUxLab29,120);
    return;
  }
  window.__ecAudioUxLab29=true;
  const q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon=(name)=>({
    play:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7z"/></svg>',
    save:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h12l2 2v16H5z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/></svg>',
    trash:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 10v7M14 10v7"/></svg>'
  }[name]||'');
  const engineLabel=()=>{const id=q('#v2TtsEngine')?.value||'kokoro';return id==='chatterbox'?'Chatterbox V3 · LatAm':id==='qwen3tts'?'Qwen3-TTS':'Kokoro';};
  let referenceAudio=null,enhanceTimer=null,enhancing=false,lastGenerationText='Última generación: sin pruebas en esta sesión.';

  function makeDetails(id,summary){
    let d=q('#'+id);if(d)return d;
    d=document.createElement('details');d.id=id;d.className='ec29-audio-details';
    const s=document.createElement('summary');s.textContent=summary;d.appendChild(s);
    return d;
  }

  function restructureAudio(){
    const pronSlot=q('#ec27PronSlot'),speechSlot=q('#ec27SpeechSlot');
    const pronCard=pronSlot?.closest('.ec27-card');
    if(pronCard){
      pronCard.classList.add('ec29-pron-card');
      const h=pronCard.querySelector('.section-head h3');if(h)h.textContent='Pronunciación y normalización';
      const pill=pronCard.querySelector('.section-head .mini-pill');if(pill)pill.textContent='ES-PE';
      if(speechSlot&&speechSlot.parentElement!==pronCard){speechSlot.classList.add('ec29-speech-common');pronCard.appendChild(speechSlot);}
      let testDetails=q('#ec27PronTestDetails');
      if(!testDetails){
        testDetails=makeDetails('ec27PronTestDetails','Prueba y diagnóstico de pronunciación');
        pronCard.appendChild(testDetails);
      }
      for(const el of [q('#testPronunciation'),q('#pronunciationTestResult'),q('#pronunciationTestAudio')])if(el&&el.parentElement!==testDetails)testDetails.appendChild(el);
    }
    const normCard=q('#ec27NormalizerBadge')?.closest('.ec27-card');
    if(normCard){
      normCard.classList.add('ec29-rules-card');
      const outerHead=[...normCard.children].find(x=>x.classList?.contains('section-head'));
      if(outerHead)outerHead.classList.add('ec29-hidden-head');
      const rules=normCard.querySelector('.subcard');if(rules)rules.classList.add('ec29-rules-inner');
      const diag=q('#ec27SpeechDiagnostic');
      if(diag&&!q('#ec27DiagnosticDetails')){
        const detail=makeDetails('ec27DiagnosticDetails','Diagnóstico de locución');
        detail.classList.add('ec29-diagnostic-details');
        const head=diag.previousElementSibling?.classList?.contains('section-head')?diag.previousElementSibling:null;
        (head||diag).insertAdjacentElement('beforebegin',detail);
        if(head)detail.appendChild(head);
        detail.appendChild(diag);
      }
    }
    const engineBox=q('#v2EngineBox');
    if(engineBox&&!q('#v2LastGeneration')){
      const line=document.createElement('div');line.id='v2LastGeneration';line.className='v2-last-generation';line.textContent=lastGenerationText;
      const preview=q('#v2VoicePreview');if(preview)preview.insertAdjacentElement('afterend',line);else engineBox.appendChild(line);
    }
  }

  function compactLearningActions(){
    qa('#ec27LearningList .ec27-save').forEach(b=>{
      b.classList.add('ec27-icon-action');b.title='Guardar corrección';b.setAttribute('aria-label','Guardar corrección');
      if(!b.dataset.iconified){b.dataset.iconified='1';b.innerHTML=icon('save');}
    });
    qa('#ec27LearningList .ec27-delete').forEach(b=>{
      b.classList.add('ec27-icon-action','danger');b.title='Eliminar pronunciación';b.setAttribute('aria-label','Eliminar pronunciación');
      if(!b.dataset.iconified){b.dataset.iconified='1';b.innerHTML=icon('trash');}
    });
  }

  async function enhanceReferences(){
    if(enhancing)return;enhancing=true;
    try{
      const [lab,current]=await Promise.all([window.ECAPI.ttsLabStatus(),window.ECAPI.getSettings()]);
      const voices=Array.isArray(lab?.voices)?lab.voices:[],selected=String(current?.tts?.referenceVoiceId||''),sel=q('#v2ReferenceVoice');
      const selectedMissing=!!selected&&!voices.some(v=>String(v.id)===selected);
      if(sel&&selectedMissing){
        let missing=[...sel.options].find(o=>o.value===selected);
        if(!missing){missing=document.createElement('option');missing.value=selected;missing.textContent='Voz de referencia no disponible';missing.disabled=true;sel.prepend(missing);}
        missing.selected=true;sel.value=selected;sel.dataset.selectedMissing='true';
      }else if(sel){delete sel.dataset.selectedMissing;}
      const byId=new Map(voices.map(v=>[String(v.id),v]));
      qa('#v2ReferenceList .v2-reference-row[data-id]').forEach(row=>{
        const id=String(row.dataset.id||''),v=byId.get(id),actions=row.querySelector('.v2-reference-actions'),info=row.firstElementChild;
        if(!actions)return;
        if(!row.querySelector('[data-play-reference]')){
          const play=document.createElement('button');play.type='button';play.className='dark compact v2-reference-play';play.dataset.playReference=id;play.title=`Reproducir referencia ${v?.name||''}`.trim();play.setAttribute('aria-label',play.title);play.innerHTML=icon('play');actions.prepend(play);
          play.onclick=async()=>{if(!v?.url)return;try{if(referenceAudio){referenceAudio.pause();referenceAudio.src='';}referenceAudio=new Audio(v.url);await referenceAudio.play();}catch(e){if(typeof status==='function')status(`Referencia: ${e.message||e}`);}};
        }
        let badge=row.querySelector('.v2-reference-active');
        if(id===selected){if(!badge){badge=document.createElement('span');badge.className='v2-reference-active';badge.textContent='ACTIVA';info?.appendChild(badge);}}
        else badge?.remove();
        const del=row.querySelector('[data-delete]');if(del){del.classList.add('v2-reference-delete');del.title='Eliminar voz de referencia';del.setAttribute('aria-label','Eliminar voz de referencia');if(!del.dataset.iconified){del.dataset.iconified='1';del.innerHTML=icon('trash');}}
      });
    }catch{}finally{enhancing=false;}
  }

  function scheduleEnhance(){clearTimeout(enhanceTimer);enhanceTimer=setTimeout(()=>{restructureAudio();compactLearningActions();enhanceReferences();},80);}

  async function renderGenericDiagnostic(){
    const out=q('#ec27SpeechDiagnostic');if(!out)return;
    try{
      const p=await window.ECAPI.pronunciationStatus(),d=p?.speechNormalizer?.last;
      if(!d){const text=`Normalizador ${p?.speechNormalizer?.version||''} · sin notas procesadas todavía.`;if(out.textContent!==text)out.textContent=text;return;}
      const engine=engineLabel(),finalText=String(d.normalized||d.sentToKokoro||d.afterPronunciation||'');
      const parts=[
        'ORIGINAL',String(d.original||''),'',
        'DESPUÉS DE PRONUNCIACIÓN',String(d.afterPronunciation||''),'',
        'DESPUÉS DEL NORMALIZADOR ES-PE',String(d.normalized||d.afterPronunciation||''),'',
        'TEXTO ENVIADO AL MOTOR TTS',`Destino: ${engine}`,finalText,'',
        `Transformaciones: ${(d.transforms||[]).join(', ')||'ninguna'}`,
        `Reglas: ${d.rulesVersion||p?.speechNormalizer?.rulesVersion||''}${d.fallbackReason?`\nFallback: ${d.fallbackReason}`:''}`
      ];
      const text=parts.join('\n');if(out.textContent!==text)out.textContent=text;
    }catch(e){const text=`Diagnóstico: ${e.message||e}`;if(out.textContent!==text)out.textContent=text;}
  }

  function monitorLastGeneration(){
    const action=q('#v2EngineAction'),line=q('#v2LastGeneration');if(!action||!line)return;
    const text=String(action.textContent||'').trim();
    if(/^Prueba lista ·/.test(text)){
      lastGenerationText='Última generación: '+text.replace(/^Prueba lista ·\s*/,'');
      line.textContent=lastGenerationText;
      action.textContent='Prueba de voz lista ✓';
    }else if(line.textContent!==lastGenerationText)line.textContent=lastGenerationText;
  }

  restructureAudio();compactLearningActions();enhanceReferences();renderGenericDiagnostic();monitorLastGeneration();

  const learn=q('#ec27LearningList');if(learn)new MutationObserver(compactLearningActions).observe(learn,{childList:true,subtree:true});
  const refs=q('#v2ReferenceList');if(refs)new MutationObserver(scheduleEnhance).observe(refs,{childList:true,subtree:true});
  const engineAction=q('#v2EngineAction');if(engineAction)new MutationObserver(monitorLastGeneration).observe(engineAction,{childList:true,characterData:true,subtree:true});
  const diag=q('#ec27SpeechDiagnostic');if(diag)new MutationObserver(()=>setTimeout(renderGenericDiagnostic,0)).observe(diag,{childList:true,characterData:true,subtree:true});
  q('#v2TtsEngine')?.addEventListener('change',()=>setTimeout(()=>{scheduleEnhance();renderGenericDiagnostic();},120));
  q('#v2ReferenceVoice')?.addEventListener('change',()=>setTimeout(scheduleEnhance,120));
  q('#ec27RefreshDiag')?.addEventListener('click',()=>setTimeout(renderGenericDiagnostic,250));
})();
