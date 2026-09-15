'use strict';
(function installCannedUxLab29(){
  if(window.__ecCannedUxLab29Installed)return;
  const q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)];
  let tries=0,timer=null;
  const move=(node,host,before=null)=>{if(!node||!host)return node;if(before&&before.parentElement===host){if(node.parentElement!==host||node.nextElementSibling!==before)host.insertBefore(node,before);}else if(node.parentElement!==host)host.appendChild(node);return node;};
  const hide=node=>{if(node)node.classList.add('ec-canned-hidden');};
  const directText=(label,text)=>{if(!label)return;const node=[...label.childNodes].find(n=>n.nodeType===Node.TEXT_NODE&&String(n.nodeValue||'').trim());if(node)node.nodeValue=`${text} `;else label.insertBefore(document.createTextNode(`${text} `),label.firstChild);};
  const tell=msg=>{try{if(typeof status==='function')status(msg);}catch{}}

  function libraryHead(card,kind){
    const head=card?.querySelector(':scope > .section-head');if(!head)return null;
    head.classList.add('ec-canned-library-head');
    const isAds=kind==='ads',id=isAds?'ecAdsLibraryActions':'ecCannedLibraryActions';
    let actions=q('#'+id);if(!actions){actions=document.createElement('div');actions.id=id;actions.className='ec-canned-library-actions';head.appendChild(actions);}
    const count=q(isAds?'#adsCount':'#cannedCount'),buttons=q(isAds?'#pickAdsFolder':'#pickCannedFolder')?.closest('.buttons');
    move(count,actions);if(buttons){buttons.classList.add('ec-canned-folder-actions');move(buttons,actions);}
    const info=q(isAds?'#adsFolderInfo':'#cannedFolderInfo');if(info){info.classList.add('ec-canned-folder-info');head.insertAdjacentElement('afterend',info);}
    return head;
  }

  function removeLegacyFolderLabels(program,ads){
    const cannedButtons=q('#pickCannedFolder')?.closest('.buttons'),adsButtons=q('#pickAdsFolder')?.closest('.buttons');
    for(const root of [program,ads])qa('label').filter(x=>root?.contains(x)).forEach(label=>{const t=String(label.textContent||'').trim();if(/^Carpeta de contenidos$/i.test(t)||/^Carpeta de anuncios$/i.test(t))hide(label);});
    const beforeCanned=cannedButtons?.previousElementSibling;if(beforeCanned?.tagName==='LABEL'&&/Carpeta de contenidos/i.test(beforeCanned.textContent||''))hide(beforeCanned);
    const beforeAds=adsButtons?.previousElementSibling;if(beforeAds?.tagName==='LABEL'&&/Carpeta de anuncios/i.test(beforeAds.textContent||''))hide(beforeAds);
  }

  function compactRules(program){
    if(!program)return;
    let row=q('#ecCannedRulesRow');if(!row){row=document.createElement('div');row.id='ecCannedRulesRow';row.className='ec-canned-rules-row';const head=program.querySelector(':scope > .section-head');head?.insertAdjacentElement('afterend',row);}
    const emergency=q('#cannedEmergency')?.closest('.switch-row'),interval=q('#cannedInterval')?.closest('label');
    if(emergency){emergency.classList.add('ec-canned-backup-rule');const b=emergency.querySelector('b');if(b)b.textContent='Usar como respaldo';const small=emergency.querySelector('small');if(small)small.textContent='Cuando no haya noticias listas.';move(emergency,row);}
    if(interval){interval.classList.add('ec-canned-frequency-rule');directText(interval,'Cada');move(interval,row);}
  }

  function hideLegacyAutonomyTarget(program){
    const roots=[program,q('#ec29CannedLeft')].filter(Boolean);
    for(const root of roots){
      qa('label').filter(x=>root.contains(x)&&/Autonomía objetivo para recuperación/i.test(x.textContent||'')).forEach(label=>{
        label.classList.add('ec-canned-legacy-autonomy-target');
        const box=label.closest('.subcard,.card');if(box&&box!==program&&box.id!=='ec27RecoveryStatus')box.classList.add('ec-canned-legacy-autonomy-card');
      });
      qa('.note,p,small').filter(x=>root.contains(x)&&/(Autonomía objetivo\s*\d+\s*min|producción estimada|tiempo del anuncio posterior también cuenta para la recuperación)/i.test(x.textContent||'')).forEach(hide);
    }
  }

  async function saveRecovery(enabled){
    const input=q('#ecCannedRecoveryEnabled');if(input)input.disabled=true;
    try{
      const fresh=await window.ECAPI.getSettings();fresh.canned=fresh.canned||{};fresh.canned.recoveryEnabled=!!enabled;await window.ECAPI.saveSettings(fresh);
      try{if(typeof settings!=='undefined'&&settings){settings.canned=settings.canned||{};settings.canned.recoveryEnabled=!!enabled;}}catch{}
      tell(`Recuperación de autonomía ${enabled?'activada':'desactivada'}.`);
    }catch(e){if(input)input.checked=!enabled;tell(`Recuperación: ${e?.message||e}`);}finally{if(input)input.disabled=false;}
  }
  async function hydrateRecovery(){try{const s=await window.ECAPI.getSettings();const input=q('#ecCannedRecoveryEnabled');if(input)input.checked=s?.canned?.recoveryEnabled!==false;}catch{}}

  function compactRecovery(program){
    if(!program)return;
    const recovery=q('#ec27RecoveryStatus');if(!recovery)return;
    recovery.classList.add('ec-canned-recovery-simple');
    const head=recovery.querySelector(':scope > .section-head');if(head){const h=head.querySelector('h3');if(h)h.textContent='Recuperación de autonomía';}
    hide(recovery.querySelector('.ec27-recovery-grid'));
    let input=q('#ecCannedRecoveryEnabled');
    if(!input){
      const control=document.createElement('label');control.className='ec-canned-recovery-toggle';control.innerHTML='<span><b>Recuperar reserva automáticamente</b><small>Usa contenidos para dar tiempo a que se recupere la reserva de noticias.</small></span><input id="ecCannedRecoveryEnabled" type="checkbox"><span class="switch-ui"></span>';
      recovery.appendChild(control);input=q('#ecCannedRecoveryEnabled');input.addEventListener('change',()=>saveRecovery(input.checked));hydrateRecovery();
    }
    const selection=q('#ec27Selection'),badge=q('#ec27RecoveryBadge');
    let selectionCard=q('#ecCannedSelectionCard');
    if(!selectionCard){selectionCard=document.createElement('div');selectionCard.id='ecCannedSelectionCard';selectionCard.className='subcard ec-canned-selection-card';selectionCard.innerHTML='<div class="section-head"><h3>Próximo contenido / selección</h3><div id="ecCannedSelectionBadgeHost"></div></div><div id="ecCannedSelectionBody"></div>';recovery.insertAdjacentElement('afterend',selectionCard);}
    move(badge,q('#ecCannedSelectionBadgeHost'));move(selection,q('#ecCannedSelectionBody'));
  }

  function compactAds(ads){
    if(!ads)return;ads.classList.add('ec-canned-library-card','ec-canned-ads-library');
    hide(q('#adsState'));
    const oldSwitch=q('#adsAfterCanned')?.closest('.switch-row');if(oldSwitch)oldSwitch.classList.add('ec-canned-ads-master-switch');
    qa(':scope > .note',ads).forEach(n=>{if(/Biblioteca independiente|spots y promociones/i.test(n.textContent||''))hide(n);});
    qa(':scope > .section-head',ads).forEach((head,i)=>{if(i>0&&/Anuncios disponibles/i.test(head.textContent||''))hide(head);});
  }

  function installAutoAds(){
    const strip=q('#ecAutoOperatorStrip'),content=q('#ecAutoContentToggleHost'),promo=q('#ecAutoPromoToggleHost'),adsRow=q('#adsAfterCanned')?.closest('.switch-row');if(!strip||!content||!promo||!adsRow)return false;
    let host=q('#ecAutoAdsToggleHost');if(!host){host=document.createElement('div');host.id='ecAutoAdsToggleHost';host.className='ec-auto-strip-item ec-auto-switch-host';promo.parentElement?.insertBefore(host,promo);}
    const b=adsRow.querySelector('b');if(b)b.textContent='Anuncios';move(adsRow,host);
    window.__ecAutoUxLab29Audit={...(window.__ecAutoUxLab29Audit||{}),adsSwitches:document.querySelectorAll('#adsAfterCanned').length};
    return true;
  }

  function layout(){
    const tab=q('#tab-canned'),program=q('#ecCannedProgramCard')||q('#pickCannedFolder')?.closest('.card'),available=q('#ecCannedAvailableCard')||q('#cannedList')?.closest('.card'),ads=q('#adsLibraryCard');
    if(!tab||!program||!available||!ads)return false;
    program.classList.add('ec-canned-program-card');available.classList.add('ec-canned-library-card');
    compactRules(program);libraryHead(available,'content');libraryHead(ads,'ads');removeLegacyFolderLabels(program,ads);hideLegacyAutonomyTarget(program);compactRecovery(program);compactAds(ads);installAutoAds();
    window.__ecCannedUxLab29Audit={installed:true,rules:!!q('#ecCannedRulesRow'),recovery:!!q('#ecCannedRecoveryEnabled'),contentActions:!!q('#ecCannedLibraryActions'),adsActions:!!q('#ecAdsLibraryActions'),adsInAuto:q('#adsAfterCanned')?.closest('#ecAutoAdsToggleHost')!=null};
    return true;
  }

  function reconcile(){if(!window.__ecCannedUxLab29Installed)return;layout();installAutoAds();hydrateRecovery();}
  function attempt(){if(layout()){window.__ecCannedUxLab29Installed=true;clearTimeout(timer);setTimeout(reconcile,180);setTimeout(reconcile,700);return;}if(tries++<180)timer=setTimeout(attempt,120);}
  window.ECAPI?.on?.('profile:changed',()=>setTimeout(reconcile,250));
  window.ECAPI?.on?.('automation:state',()=>{if(window.__ecCannedUxLab29Installed&&!q('#ecAutoAdsToggleHost'))setTimeout(installAutoAds,40);});
  attempt();
})();
