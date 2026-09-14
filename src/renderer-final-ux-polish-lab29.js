'use strict';
(function installFinalUxPolishLab29(){
  if(window.__ecFinalUxPolishLab29)return;
  const q=s=>document.querySelector(s),qa=(s,r=document)=>[...r.querySelectorAll(s)];
  const move=(node,host,before=null)=>{if(!node||!host)return node;if(before&&before.parentElement===host)host.insertBefore(node,before);else host.appendChild(node);return node;};
  const text=node=>String(node?.textContent||'').replace(/\s+/g,' ').trim();
  let tries=0,timer=null,autoSaveTimer=null,lastAutomationState=null,pipelineObserver=null;

  function compactExclusiveCopy(){
    const card=q('#exclusiveSchedule0324');if(!card)return false;
    for(const node of qa('.note,p,small',card)){
      if(/Turno de exclusiva|producirá una reservada|seguir avanzando si hay alguna disponible/i.test(text(node)))node.classList.add('ec-final-exclusive-copy-hidden');
    }
    card.classList.add('ec-final-exclusive-compact');return true;
  }

  function equalizeLibraries(){
    const available=q('#ecCannedAvailableCard')||q('#cannedList')?.closest('.card');
    const ads=q('#adsLibraryCard');
    if(!available||!ads)return false;
    available.classList.add('ec-final-library-card');ads.classList.add('ec-final-library-card');return true;
  }

  function arrangeAudio(){
    const left=q('#ec27AudioLeft'),right=q('#ec27AudioRight'),bottom=q('#ec29AudioBottom');
    if(!left||!right||!bottom)return false;
    const voice=q('#ec27VoiceSlot')?.closest('.ec27-card');
    const custom=q('#ec27CustomVoiceSlot')?.closest('.ec27-card');
    const pron=q('#ec27PronSlot')?.closest('.ec27-card');
    const learning=(q('#ec28LearningList')||q('#ec27LearningList'))?.closest('.ec27-card');
    const music=q('#musicEnabled')?.closest('.card');
    const rules=q('#ec27RuleVersion')?.closest('.ec27-card');
    if(!voice||!custom||!pron||!learning||!music||!rules)return false;

    move(rules,bottom,bottom.firstElementChild);
    move(learning,right);move(music,right);
    move(voice,left);move(custom,left);move(pron,left);

    let row=q('#ecAudioPronOptionsRow');
    if(!row){row=document.createElement('div');row.id='ecAudioPronOptionsRow';row.className='ec-audio-pron-options-row';q('#ec27PronSlot')?.insertAdjacentElement('afterend',row);}
    const controls=[q('#pronunciationClaudeVerify')?.closest('.switch-row'),q('#speechNormalizerEnabled')?.closest('.switch-row'),q('#initialAttackProtection')?.closest('.switch-row')].filter(Boolean);
    for(const control of controls)move(control,row);
    const labels=['Verificar con Claude','Normalización avanzada','Protección inicial'];
    controls.forEach((control,i)=>{const b=control.querySelector('b');if(b)b.textContent=labels[i];const small=control.querySelector('small');if(small)small.classList.add('ec-final-pron-help-hidden');});
    return controls.length>=2;
  }

  function compactSettingsClosures(){
    const card=q('#ec29SettingsSourcesCard'),partial=q('#globalPartialClose'),exclusive=q('#globalExclusiveClose');
    if(!card||!partial||!exclusive)return false;
    let section=q('#ec29SettingsClosuresSection');
    if(!section){
      section=document.createElement('div');section.id='ec29SettingsClosuresSection';section.className='ec29-closures-section';
      section.innerHTML='<h3>Cierres automáticos</h3><div id="ec29SettingsClosuresGrid" class="ec29-closures-grid"></div>';
      const add=q('#addFeed');if(add?.parentElement===card)add.insertAdjacentElement('afterend',section);else card.appendChild(section);
    }
    const grid=q('#ec29SettingsClosuresGrid');
    partial.classList.add('ec29-closure-card','ec29-closure-partial');exclusive.classList.add('ec29-closure-card','ec29-closure-exclusive');
    move(partial,grid);move(exclusive,grid);
    for(const root of [partial,exclusive]){
      for(const node of qa('p,.note,small',root)){
        const t=text(node);
        if(/Se aplica a fuentes RSS|Solo se usa si la página|EC detecta contenido para suscriptores|Se aplica cuando la detección automática/i.test(t))node.classList.add('ec-final-closure-help-hidden');
      }
      for(const label of qa('label',root)){
        const first=[...label.childNodes].find(n=>n.nodeType===Node.TEXT_NODE&&String(n.nodeValue||'').trim());
        if(first&&/Texto del cierre/i.test(first.nodeValue||''))first.nodeValue='';
      }
    }
    return true;
  }

  function compactQueueColors(){
    const card=q('#ec29SettingsQueueCard');if(!card)return false;
    card.classList.add('ec-final-queue-colors-visible');
    return qa('input[type="color"]',card).length>=5;
  }

  function moveCycleIntoSelection(){
    const recovery=q('#ec27RecoveryStatus'),body=q('#ecCannedSelectionBody');if(!recovery||!body)return false;
    let cycle=q('#ecCannedCycleBlock');
    if(!cycle){cycle=document.createElement('div');cycle.id='ecCannedCycleBlock';cycle.className='ec-canned-cycle-block';body.appendChild(cycle);}
    const candidates=qa('h3,h4,b,strong,div,span',recovery).filter(n=>/^Ciclo de contenidos$/i.test(text(n)));
    const title=candidates[0];
    if(title&&!cycle.contains(title)){
      const parent=title.parentElement;
      if(parent&&parent!==recovery&&parent.children.length<=3&&/Ciclo de contenidos/i.test(text(parent)))move(parent,cycle);
      else{
        const next=title.nextElementSibling;move(title,cycle);
        if(next&&/Sin biblioteca|ciclo|disponible/i.test(text(next)))move(next,cycle);
      }
    }
    return true;
  }

  function hideManualSaveActions(){
    const master=q('#save');
    master?.closest('.settings-save')?.classList.add('ec-final-settings-save-hidden');
    if(master)master.classList.add('ec-final-settings-save-button-hidden');
    for(const button of qa('#tab-audio button')){
      if(/^Guardar audio y locución$/i.test(text(button)))button.classList.add('ec-final-audio-save-hidden');
    }
    return !!master;
  }

  function isAutosaveTarget(target){
    if(!target||!target.closest)return false;
    const tab=target.closest('#tab-settings,#tab-audio');if(!tab)return false;
    if(target.matches('button,[type="button"],[type="submit"],[type="file"],[type="password"]'))return false;
    if(target.matches('#claudeKey,#geminiKey'))return false;
    if(target.closest('#ec27LearningList,#ec28LearningList'))return false;
    if(!target.matches('input,select,textarea'))return false;
    return true;
  }
  function scheduleAutomaticSave(){
    clearTimeout(autoSaveTimer);
    autoSaveTimer=setTimeout(()=>{
      autoSaveTimer=null;
      try{q('#save')?.click();}catch{}
    },520);
  }
  function installAutomaticPersistence(){
    if(window.__ecFinalAutomaticPersistenceLab29)return true;
    const settingsTab=q('#tab-settings'),audioTab=q('#tab-audio'),master=q('#save');
    if(!settingsTab||!audioTab||!master)return false;
    const onEdit=e=>{if(isAutosaveTarget(e.target))scheduleAutomaticSave();};
    settingsTab.addEventListener('change',onEdit);settingsTab.addEventListener('input',onEdit);
    audioTab.addEventListener('change',onEdit);audioTab.addEventListener('input',onEdit);
    window.__ecFlushSettingsAutosaveLab29=()=>{if(!autoSaveTimer)return;clearTimeout(autoSaveTimer);autoSaveTimer=null;try{q('#save')?.click();}catch{}};
    window.__ecFinalAutomaticPersistenceLab29=true;
    return true;
  }

  function pipelineSource(){
    const known=q('#localPipelineState0320');if(known)return known;
    return qa('#tab-auto span,#tab-auto p,#tab-auto div,#tab-auto b,#tab-auto small').find(node=>/^PIPELINE(?: LOCAL)?\s*·/i.test(text(node)))||null;
  }
  function humanPipelineMode(value){
    const raw=String(value||'').replace(/^PIPELINE(?: LOCAL)?\s*·\s*/i,'').trim();
    if(!raw||/DETENIDO|EN ESPERA/i.test(raw))return'';
    if(/SOLAPADO/i.test(raw))return'Solapado ✓';
    if(/SECUENCIAL/i.test(raw))return'Secuencial';
    if(/IA REMOTA/i.test(raw))return'IA remota';
    return raw.replace(/\s+/g,' ');
  }
  function syncPipelineDetail(state=lastAutomationState){
    if(state)lastAutomationState=state;
    const source=pipelineSource(),detailAnchor=q('#processingDetail');
    if(!source||!detailAnchor)return false;
    source.classList.add('ec-final-pipeline-source-hidden');
    let detail=q('#ecAutoPipelineDetail');
    if(!detail){detail=document.createElement('p');detail.id='ecAutoPipelineDetail';detail.className='note ec-auto-pipeline-detail hidden';detailAnchor.insertAdjacentElement('afterend',detail);}
    const running=!!lastAutomationState?.processing?.running,mode=humanPipelineMode(text(source));
    if(!running||!mode){detail.textContent='';detail.classList.add('hidden');}
    else{detail.textContent=`Pipeline: ${mode}`;detail.classList.remove('hidden');detail.title=source.title||'';}
    if(!pipelineObserver&&typeof MutationObserver==='function'){
      pipelineObserver=new MutationObserver(()=>setTimeout(()=>syncPipelineDetail(lastAutomationState),0));
      pipelineObserver.observe(source,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['class','title']});
    }
    return true;
  }

  function apply(){
    const results=[compactExclusiveCopy(),equalizeLibraries(),arrangeAudio(),compactSettingsClosures(),compactQueueColors(),moveCycleIntoSelection(),hideManualSaveActions(),installAutomaticPersistence()];
    syncPipelineDetail(lastAutomationState);
    window.__ecFinalUxPolishLab29Audit={exclusive:results[0],libraries:results[1],audio:results[2],closures:results[3],queueColors:results[4],cycle:results[5],manualSaveHidden:results[6],autosave:results[7],pipeline:!!q('#ecAutoPipelineDetail')};
    return results.every(Boolean);
  }
  function retry(){clearTimeout(timer);if(apply()){window.__ecFinalUxPolishLab29=true;setTimeout(apply,250);setTimeout(apply,900);return;}if(tries++<180)timer=setTimeout(retry,120);}
  window.ECAPI?.on?.('profile:changed',()=>setTimeout(apply,320));
  window.ECAPI?.on?.('automation:state',state=>{lastAutomationState=state;setTimeout(()=>{compactExclusiveCopy();moveCycleIntoSelection();syncPipelineDetail(state);},30);});
  try{window.ECAPI?.automationStatus?.().then(state=>{lastAutomationState=state;setTimeout(()=>syncPipelineDetail(state),0);}).catch(()=>{});}catch{}
  retry();
})();
