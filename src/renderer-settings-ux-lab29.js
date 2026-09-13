'use strict';
(function installSettingsUxLab29(){
  if(window.__ecSettingsUxLab29)return;
  const q=s=>document.querySelector(s);
  const move=(el,to)=>{if(el&&to&&el.parentElement!==to)to.appendChild(el);return el;};
  let tries=0,retryTimer=null;

  function makeCard(id,title,note=''){
    const card=document.createElement('div');card.id=id;card.className='card ec29-settings-card';
    const head=document.createElement('div');head.className='section-head';
    const h=document.createElement('h3');h.textContent=title;head.appendChild(h);card.appendChild(head);
    if(note){const p=document.createElement('p');p.className='note';p.textContent=note;card.appendChild(p);}
    return card;
  }
  function labelFor(id){return q('#'+id)?.closest('label')||null;}
  function buttonRow(...buttons){const row=document.createElement('div');row.className='buttons';for(const b of buttons)if(b)row.appendChild(b);return row;}
  function setLabelText(label,text){
    if(!label)return;
    const textNode=[...label.childNodes].find(n=>n.nodeType===Node.TEXT_NODE&&String(n.nodeValue||'').trim());
    if(textNode)textNode.nodeValue=text;else label.insertBefore(document.createTextNode(text),label.firstChild);
  }
  function prerequisites(){
    const required=['tab-settings','ecOptimizer0321','feeds','addFeed','globalPartialClose','globalExclusiveClose','pickFallback','fallbackInfo','primary','backup1','backup2','providerSummary','localInfo','ec27LocalInstaller','localBackupMode','localIdleRow','localPolicyInfo','claudeStatus','claudeKey','claudeModel','testClaude','geminiStatus','geminiKey','geminiModel','testGemini','queueColorExclusive','resetQueueColors','tab-audio'];
    if(required.some(id=>!q('#'+id)))return false;
    if(!q('#tab-settings .settings-cols')||!q('#tab-settings .queue-colors'))return false;
    // Audio debe haber reclamado Voz/Pronunciación antes de ocultar los hosts legacy de Ajustes.
    if(!window.__ecAudioUxLab29||!q('#tab-audio .ec29-audio-workspace'))return false;
    return true;
  }

  function markEditorialLegacy(){
    const instructions=q('#editorialInstructions'),prompt=q('#editorialPrompt');
    instructions?.closest('label')?.classList.add('ec29LegacyEditorialHidden');
    prompt?.closest('details')?.classList.add('ec29LegacyEditorialHidden');
    const root=q('#tab-settings .settings-cols');
    const h=root?[...root.querySelectorAll('h3')].find(x=>/Redacción de noticias/i.test(x.textContent||'')):null;
    if(h){h.classList.add('ec29LegacyEditorialHidden');const prev=h.previousElementSibling;if(prev?.tagName==='HR')prev.classList.add('ec29LegacyEditorialHidden');const next=h.nextElementSibling;if(next?.classList?.contains('note'))next.classList.add('ec29LegacyEditorialHidden');}
  }

  function buildSourcesCard(left){
    const feedCount=q('#feedCount'),head=feedCount?.closest('.section-head'),feeds=q('#feeds'),add=q('#addFeed'),partial=q('#globalPartialClose'),exclusive=q('#globalExclusiveClose');
    if(!head||!feeds||!add||!partial||!exclusive)return null;
    const card=document.createElement('div');card.id='ec29SettingsSourcesCard';card.className='card ec29-settings-card ec29-settings-sources';
    const note=head.nextElementSibling?.classList?.contains('note')?head.nextElementSibling:null;
    move(head,card);move(note,card);move(feeds,card);move(add,card);move(partial,card);move(exclusive,card);
    left.appendChild(card);
    // Invariante legacy: ensureGlobalPartialCloseControls usa addFeed.closest('.card').
    if(add.closest('.card')!==card)throw new Error('No se pudo conservar el host de Fuentes de noticias.');
    return card;
  }

  function buildFallbackCard(left){
    const card=makeCard('ec29SettingsFallbackCard','Imagen de respaldo','Se usa cuando una noticia o documento no tiene una imagen propia.');
    const pick=q('#pickFallback'),info=q('#fallbackInfo');move(pick,card);move(info,card);left.appendChild(card);return card;
  }

  function buildQueueCard(left){
    const card=makeCard('ec29SettingsQueueCard','Apariencia de la cola','El color identifica rápidamente cada tipo de elemento sin cambiar el diseño que sale al aire.');
    const grid=q('#tab-settings .queue-colors'),reset=q('#resetQueueColors');
    if(!grid||!reset)return null;
    const order=['queueColorRss','queueColorGenerated','queueColorExclusive','queueColorContent','queueColorAd','queueColorError'];
    for(const id of order){const label=labelFor(id);if(label)grid.appendChild(label);}
    setLabelText(labelFor('queueColorGenerated'),'Notas');
    move(grid,card);card.appendChild(buttonRow(reset));left.appendChild(card);return card;
  }

  function buildLocalCard(right){
    const card=makeCard('ec29SettingsLocalCard','IA local');
    const info=q('#localInfo'),installer=q('#ec27LocalInstaller'),diagnostic=q('#localModelDiagnostic0324'),progress=q('#downloadProgress');
    move(info,card);
    // El instalador 0.3.27 es la autoridad vigente: conserva estado, instalación completa y sus controles avanzados.
    move(installer,card);
    move(diagnostic,card);
    move(progress,card);

    const policy=document.createElement('div');policy.id='ec29LocalBackupPolicy';policy.className='ec29-local-backup-policy';
    const policyTitle=document.createElement('div');policyTitle.className='ec29-settings-minor-title';policyTitle.textContent='Si IA local está configurada como respaldo';policy.appendChild(policyTitle);
    move(labelFor('localBackupMode'),policy);move(q('#localIdleRow'),policy);move(q('#localPolicyInfo'),policy);card.appendChild(policy);

    right.appendChild(card);return card;
  }

  function buildServiceCard(right){
    const card=makeCard('ec29SettingsServiceCard','Servicio de IA');
    move(q('#providerSummary'),card);
    const grid=document.createElement('div');grid.id='ec29SettingsServiceGrid';grid.className='ec29-settings-service-grid';
    for(const id of ['primary','backup1','backup2'])move(labelFor(id),grid);
    card.appendChild(grid);right.appendChild(card);return card;
  }

  function buildProvidersCard(right){
    const card=makeCard('ec29SettingsProvidersCard','Proveedores de IA');
    const grid=document.createElement('div');grid.id='ec29SettingsProvidersGrid';grid.className='ec29-settings-providers-grid';
    const claude=document.createElement('div');claude.id='ec29ClaudeProvider';claude.className='subcard ec29-provider-card';
    const ch=document.createElement('h3');ch.textContent='Claude';claude.appendChild(ch);move(q('#claudeStatus'),claude);move(labelFor('claudeKey'),claude);move(labelFor('claudeModel'),claude);move(q('#testClaude'),claude);
    const gemini=document.createElement('div');gemini.id='ec29GeminiProvider';gemini.className='subcard ec29-provider-card';
    const gh=document.createElement('h3');gh.textContent='Gemini';gemini.appendChild(gh);move(q('#geminiStatus'),gemini);move(labelFor('geminiKey'),gemini);move(labelFor('geminiModel'),gemini);move(q('#testGemini'),gemini);
    grid.appendChild(claude);grid.appendChild(gemini);card.appendChild(grid);right.appendChild(card);return card;
  }

  function syncLocalBackupPolicy(){
    const primary=q('#primary')?.value||'';
    const backups=[q('#backup1')?.value,q('#backup2')?.value];
    const asBackup=primary!=='local'&&backups.includes('local');
    q('#ec29LocalBackupPolicy')?.classList.toggle('hidden',!asBackup);
    window.__ecSettingsUxLab29Audit={...(window.__ecSettingsUxLab29Audit||{}),localBackupVisible:asBackup,primary,backups};
  }

  function install(){
    if(window.__ecSettingsUxLab29)return true;
    if(!prerequisites())return false;
    const tab=q('#tab-settings'),optimizer=q('#ecOptimizer0321'),legacyCols=q('#tab-settings .settings-cols'),legacyCards=legacyCols?[...legacyCols.children].filter(x=>x.classList?.contains('card')):[];
    if(!tab||!optimizer||legacyCards.length<2)return false;
    markEditorialLegacy();

    let workspace=q('#ec29SettingsWorkspace');
    if(!workspace){workspace=document.createElement('div');workspace.id='ec29SettingsWorkspace';workspace.className='ec29-settings-workspace';workspace.innerHTML='<div id="ec29SettingsLeft" class="ec29-settings-stack"></div><div id="ec29SettingsRight" class="ec29-settings-stack"></div>';optimizer.insertAdjacentElement('afterend',workspace);}
    const left=q('#ec29SettingsLeft'),right=q('#ec29SettingsRight');if(!left||!right)return false;

    const sourcesCard=buildSourcesCard(left);
    const fallbackCard=buildFallbackCard(left);
    const queueCard=buildQueueCard(left);
    const localCard=buildLocalCard(right);
    const serviceCard=buildServiceCard(right);
    const providersCard=buildProvidersCard(right);
    if(!sourcesCard||!fallbackCard||!queueCard||!localCard||!serviceCard||!providersCard)return false;

    // Mantener estos contenedores en DOM conserva controles internos legacy aún leídos por saveSettings().
    for(const card of legacyCards)card.classList.add('ec29-settings-legacy-host');
    legacyCols.classList.add('ec29-settings-legacy-cols');

    for(const id of ['primary','backup1','backup2','localBackupMode'])q('#'+id)?.addEventListener('change',()=>setTimeout(syncLocalBackupPolicy,0));
    window.ECAPI?.on?.('profile:changed',()=>setTimeout(syncLocalBackupPolicy,360));
    syncLocalBackupPolicy();

    window.__ecSettingsUxLab29=true;
    window.__ecSettingsUxLab29Audit={
      installed:true,
      optimizerUntouched:optimizer.parentElement===tab,
      sourcesOriginalList:!!q('#ec29SettingsSourcesCard #feeds'),
      partialClose:!!q('#ec29SettingsSourcesCard #globalPartialClose'),
      exclusiveClose:!!q('#ec29SettingsSourcesCard #globalExclusiveClose'),
      exclusiveColor:!!q('#ec29SettingsQueueCard #queueColorExclusive'),
      localInstallerPreserved:!!q('#ec29SettingsLocalCard #ec27LocalInstaller'),
      localAdvancedPreserved:!!q('#ec27LocalInstaller #ec27LocalAdvanced'),
      editorialNodesPreserved:!!q('#editorialInstructions')&&!!q('#editorialPrompt'),
      rightOrder:[...right.children].map(x=>x.id)
    };
    return true;
  }

  function retry(){
    clearTimeout(retryTimer);
    try{if(install())return;}catch(e){window.__ecSettingsUxLab29Error=String(e?.message||e);}
    if(tries++<140)retryTimer=setTimeout(retry,100);
  }
  retry();
})();
