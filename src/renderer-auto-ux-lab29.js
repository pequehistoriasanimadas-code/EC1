'use strict';
(function installAutomaticOperatorUxLab29(){
  if(window.__ecAutoUxLab29Installed)return;
  const q=s=>document.querySelector(s);
  let lastAutomation=null,lastOutput=null,retryTimer=null,retryCount=0,settleTimer=null,settlePass=0;

  function loadCss(){
    if(q('#ecAutoUxLab29Css'))return;
    const link=document.createElement('link');
    link.id='ecAutoUxLab29Css';link.rel='stylesheet';link.href='control-auto-ux-lab29.css';
    document.head.appendChild(link);
  }
  function move(node,host){if(node&&host&&node.parentElement!==host)host.appendChild(node);return node;}
  function fmtClockFromMin(value){const sec=Math.max(0,Math.round((Number(value)||0)*60)),m=Math.floor(sec/60),s=sec%60;return`${m}:${String(s).padStart(2,'0')}`;}

  function prerequisites(){
    return !!(window.ECAPI&&q('#tab-auto')&&q('#tab-auto .auto-cols')&&q('.queue-card')&&q('#ecLanMonitorCard')&&q('#cannedEnabled')&&q('#ecYoutubePromoEnabled')&&q('#processStart')&&q('#emissionStart')&&q('#ec28EmissionPanel')&&q('#sessionCounters'));
  }

  function ensureOperatorStrip(tab){
    let strip=q('#ecAutoOperatorStrip');
    if(!strip){
      strip=document.createElement('div');strip.id='ecAutoOperatorStrip';strip.className='card ec-auto-operator-strip';
      strip.innerHTML=`<div class="ec-auto-strip-grid">
        <div class="ec-auto-strip-item"><span>Preparación</span><div id="ecAutoPreparationStateHost"></div></div>
        <div class="ec-auto-strip-item"><span>Emisión</span><div id="ecAutoEmissionStateHost"></div></div>
        <div class="ec-auto-strip-item"><span>Listas</span><b id="ecAutoReadyValue">0 / 15</b></div>
        <div class="ec-auto-strip-item"><span>Autonomía</span><b id="ecAutoAutonomyValue">0:00</b></div>
        <div id="ecAutoContentToggleHost" class="ec-auto-strip-item ec-auto-switch-host"></div>
        <div id="ecAutoPromoToggleHost" class="ec-auto-strip-item ec-auto-switch-host"></div>
        <div class="ec-auto-strip-item ec-auto-output-item"><span>Output</span><b id="ecAutoOutputValue">1920×1080</b></div>
      </div>`;
      const h1=tab.querySelector('h1');(h1||tab.firstElementChild)?.insertAdjacentElement('afterend',strip);
    }
    move(q('#processingState'),q('#ecAutoPreparationStateHost'));
    move(q('#emissionState'),q('#ecAutoEmissionStateHost'));
    const cannedRow=q('#cannedEnabled')?.closest('.switch-row');
    const promoRow=q('#ecYoutubePromoEnabled')?.closest('.switch-row');
    if(cannedRow){const b=cannedRow.querySelector('b');if(b)b.textContent='Contenidos';move(cannedRow,q('#ecAutoContentToggleHost'));}
    if(promoRow)move(promoRow,q('#ecAutoPromoToggleHost'));
    return strip;
  }

  function ensureMainColumns(){
    const grid=q('#tab-auto .auto-cols');if(!grid)return null;
    grid.classList.add('ec-auto-operator-grid');
    let left=q('#ecAutoLeft'),right=q('#ecAutoRight');
    if(!left){left=grid.querySelector(':scope > div:first-child');if(left)left.id='ecAutoLeft';}
    if(!right){right=q('#ecAutoRightColumn');if(right)right.id='ecAutoRight';}
    if(!right){right=document.createElement('div');right.id='ecAutoRight';grid.appendChild(right);}
    if(!left){left=document.createElement('div');left.id='ecAutoLeft';grid.insertBefore(left,right);}
    left.classList.add('ec-auto-left');right.classList.add('ec-auto-right');
    return{grid,left,right};
  }

  function ensureQueue(left){
    const queueCard=q('.queue-card');if(!queueCard)return;
    queueCard.classList.add('ec-auto-queue-card','ec-auto-section-list');move(queueCard,left);
    const head=queueCard.querySelector('.section-head');if(!head)return;
    const titleWrap=head.firstElementChild||head;
    let live=q('#ecAutoQueueLiveSummary');
    const subtitle=titleWrap.querySelector('.queue-subtitle');
    if(subtitle){subtitle.id='ecAutoQueueLiveSummary';live=subtitle;}
    if(!live){live=document.createElement('p');live.id='ecAutoQueueLiveSummary';live.className='note queue-subtitle';titleWrap.appendChild(live);}
    let actions=q('#ecAutoQueueActions');if(!actions){actions=document.createElement('div');actions.id='ecAutoQueueActions';actions.className='ec-auto-queue-actions';head.appendChild(actions);}
    const prepButtons=q('#processStart')?.closest('.buttons');
    if(prepButtons){prepButtons.classList.add('ec-auto-prep-actions');move(prepButtons,actions);}
    const clear=q('#clearQueue');if(clear)move(clear,actions);
    q('#queueSummary')?.classList.add('ec-auto-legacy-summary');
  }

  function ensureBottomSettings(left){
    let bottom=q('#ecAutoBottomSettings');if(!bottom){bottom=document.createElement('div');bottom.id='ecAutoBottomSettings';bottom.className='ec-auto-bottom-settings';left.appendChild(bottom);}
    let prepHost=q('#ecAutoPrepSettingsHost');if(!prepHost){prepHost=document.createElement('div');prepHost.id='ecAutoPrepSettingsHost';bottom.appendChild(prepHost);}
    let exclusiveHost=q('#ecAutoExclusiveHost');if(!exclusiveHost){exclusiveHost=document.createElement('div');exclusiveHost.id='ecAutoExclusiveHost';bottom.appendChild(exclusiveHost);}
    const prep=q('#bufferReady')?.closest('.card');
    if(prep){prep.classList.add('ec-auto-prep-settings-card','ec-auto-section-settings');move(prep,prepHost);}
    const exclusive=q('#exclusiveSchedule0324');
    if(exclusive){exclusive.classList.add('ec-auto-exclusive-card','ec-auto-section-exclusive');move(exclusive,exclusiveHost);}
  }

  function ensureNowCard(right){
    let host=q('#ecAutoNowHost');if(!host){host=document.createElement('div');host.id='ecAutoNowHost';right.appendChild(host);}
    let card=q('#ecAutoNowCard');
    if(!card){
      card=document.createElement('div');card.id='ecAutoNowCard';card.className='card ec-auto-now-card ec-auto-section-live';
      card.innerHTML='<div class="section-head"><h3>Ahora al aire</h3></div><div id="ecAutoNowBody"></div>';
      host.appendChild(card);
    }
    move(q('#ec28EmissionPanel'),q('#ecAutoNowBody'));
    return card;
  }

  function ensureRight(right){
    const monitor=q('#ecLanMonitorCard');if(monitor){monitor.classList.add('ec-auto-monitor-card','ec-auto-section-monitor');move(monitor,right);}
    ensureNowCard(right);
    let emissionHost=q('#ecAutoEmissionHost');if(!emissionHost){emissionHost=document.createElement('div');emissionHost.id='ecAutoEmissionHost';right.appendChild(emissionHost);}
    const emissionCard=q('#emissionStart')?.closest('.card');
    if(emissionCard){
      emissionCard.classList.add('ec-auto-emission-card','ec-auto-section-control');
      const h3=emissionCard.querySelector('h3');if(h3)h3.textContent='Control de emisión';
      move(emissionCard,emissionHost);
    }
    let sessionHost=q('#ecAutoSessionHost');if(!sessionHost){
      const card=document.createElement('div');card.id='ecAutoSessionCard';card.className='card ec-auto-session-card ec-auto-section-session';
      card.innerHTML='<div class="section-head"><h3>Resumen de sesión</h3></div><div id="ecAutoSessionHost"></div>';
      right.appendChild(card);sessionHost=q('#ecAutoSessionHost');
    }
    move(q('#sessionCounters'),sessionHost);
  }

  function renderAutomation(s=lastAutomation){
    if(!s)return;lastAutomation=s;
    const c=s.counts||{},b=s.buffer||{};
    const ready=q('#ecAutoReadyValue'),autonomy=q('#ecAutoAutonomyValue'),queueLive=q('#ecAutoQueueLiveSummary');
    if(ready)ready.textContent=`${Number(c.ready)||0} / ${Number(b.target)||15}`;
    if(autonomy)autonomy.textContent=fmtClockFromMin(b.autonomyMin);
    if(queueLive)queueLive.textContent=`${Number(c.ready)||0} listas · ${(Number(c.processing)||0)+(Number(c.pending)||0)} preparando · ${Number(c.error)||0} errores`;
  }

  function renderOutput(s=lastOutput){
    if(!s)return;lastOutput=s;const out=q('#ecAutoOutputValue');
    if(out)out.textContent=s.resolution||(Number(s.width)>0&&Number(s.height)>0?`${Number(s.width)}×${Number(s.height)}`:(s.format==='9:16'?'1080×1920':'1920×1080'));
  }

  async function hydrate(){
    try{const s=await window.ECAPI.automationStatus?.();if(s)renderAutomation(s);}catch{}
    try{const o=await window.ECAPI.outputStatus?.();if(o)renderOutput(o);}catch{}
  }

  function installLayout(){
    if(!prerequisites())return false;
    loadCss();const tab=q('#tab-auto'),cols=ensureMainColumns();if(!cols)return false;
    ensureOperatorStrip(tab);ensureQueue(cols.left);ensureBottomSettings(cols.left);ensureRight(cols.right);
    window.__ecAutoUxLab29Audit={installed:true,contentSwitches:document.querySelectorAll('#cannedEnabled').length,promoSwitches:document.querySelectorAll('#ecYoutubePromoEnabled').length,queueCards:document.querySelectorAll('#queue').length,monitorCards:document.querySelectorAll('#ecLanMonitorCard').length,onAirPanels:document.querySelectorAll('#ec28EmissionPanel').length};
    return true;
  }

  function settleLateNodes(){
    if(!window.__ecAutoUxLab29Installed)return;
    const cols=ensureMainColumns();if(cols){ensureOperatorStrip(q('#tab-auto'));ensureQueue(cols.left);ensureBottomSettings(cols.left);ensureRight(cols.right);}
    if(settlePass++<20)settleTimer=setTimeout(settleLateNodes,250);
  }

  function attempt(){
    if(installLayout()){
      window.__ecAutoUxLab29Installed=true;clearTimeout(retryTimer);settlePass=0;clearTimeout(settleTimer);settleTimer=setTimeout(settleLateNodes,250);hydrate();return;
    }
    if(retryCount++<160)retryTimer=setTimeout(attempt,150);
  }

  window.ECAPI?.on?.('automation:state',s=>{lastAutomation=s;if(!window.__ecAutoUxLab29Installed)attempt();renderAutomation(s);});
  window.ECAPI?.on?.('output:state',s=>{lastOutput=s;if(!window.__ecAutoUxLab29Installed)attempt();renderOutput(s);});
  window.ECAPI?.on?.('profile:changed',()=>setTimeout(()=>{installLayout();settlePass=0;settleLateNodes();hydrate();},260));
  attempt();
})();
