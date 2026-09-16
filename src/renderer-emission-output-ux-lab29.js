'use strict';
(function installEmissionOutputUxLab29(){
  if(window.__ecEmissionOutputUxLab29)return;
  const q=s=>document.querySelector(s);
  let tries=0,timer=null;

  function move(el,to){if(el&&to&&el.parentElement!==to)to.appendChild(el);return el;}
  function cleanEmptyGrid(el){if(el&&el.children.length===0)el.remove();}

  function syncFormatButtons(){
    const format=q('#outputFormat'),toolbar=q('#ecV2PreviewToolbar'),quick=q('#ecV2VerticalQuickControls');
    if(!format||!toolbar)return;
    const vertical=format.value==='9:16';
    q('#ecV2Format16')?.classList.toggle('active',!vertical);
    q('#ecV2Format916')?.classList.toggle('active',vertical);
    q('#ecV2Format16')?.classList.toggle('dark',vertical);
    q('#ecV2Format916')?.classList.toggle('dark',!vertical);
    quick?.classList.toggle('hidden',!vertical);
  }

  function selectFormat(value){
    const format=q('#outputFormat');if(!format)return;
    if(format.value!==value){format.value=value;format.dispatchEvent(new Event('change',{bubbles:true}));}
    syncFormatButtons();
  }

  function compactEmissionDesign(){
    const preview=q('#ecEmissionV2PreviewCard'),format=q('#outputFormat'),modeBar=q('#ecEmissionV2Mode');
    const host=preview?.querySelector(':scope>.ec-v2-preview-host');
    if(!preview||!format||!modeBar||!host)return false;

    const legacyHead=preview.querySelector(':scope>.section-head');
    legacyHead?.classList.add('ec-v2-preview-legacy-head');

    let toolbar=q('#ecV2PreviewToolbar');
    if(!toolbar){
      toolbar=document.createElement('div');toolbar.id='ecV2PreviewToolbar';toolbar.className='ec-v2-preview-toolbar';
      const formatButtons=document.createElement('div');formatButtons.className='ec-v2-format-buttons';formatButtons.innerHTML='<button id="ecV2Format16" type="button" class="dark">16:9</button><button id="ecV2Format916" type="button" class="dark">9:16</button>';
      toolbar.appendChild(formatButtons);
      preview.insertBefore(toolbar,host);
      q('#ecV2Format16').onclick=()=>selectFormat('16:9');
      q('#ecV2Format916').onclick=()=>selectFormat('9:16');
    }
    toolbar.appendChild(modeBar);
    const resolution=q('#designResolution');if(resolution)toolbar.appendChild(resolution);

    let quick=q('#ecV2VerticalQuickControls');
    if(!quick){quick=document.createElement('div');quick.id='ecV2VerticalQuickControls';quick.className='ec-v2-vertical-quick-controls';toolbar.insertAdjacentElement('afterend',quick);}
    const safe=q('#verticalSafeOptions'),background=q('#verticalVideoBackgroundOptions');
    if(safe){safe.classList.add('ec-v2-quick-safe');move(safe,quick);}
    if(background){background.classList.add('ec-v2-quick-bg');move(background,quick);}

    const formatCard=format.closest('.card');
    if(formatCard)formatCard.classList.add('ec-v2-format-source-hidden');
    if(format.dataset.ecSegmented!=='1'){
      format.dataset.ecSegmented='1';format.addEventListener('change',syncFormatButtons);
    }
    syncFormatButtons();
    return true;
  }

  function advancedBlock(card,className,summaryText='Opciones avanzadas'){
    let details=card?.querySelector(`:scope>details.${className}`);if(details)return details;
    details=document.createElement('details');details.className=className;
    details.innerHTML=`<summary>${summaryText}</summary><div class="ec-output-advanced-body"></div>`;
    card?.appendChild(details);return details;
  }

  function compactOutputCards(){
    const summary=q('#ecOutputSummaryCard');
    if(summary){
      summary.classList.add('ec-output-summary-compact');
      const duplicate=q('#ecOutputMasterOpen'),buttons=duplicate?.closest('.buttons');duplicate?.remove();if(buttons&&buttons.children.length===0)buttons.remove();
    }

    const permissions=q('#ecNetworkPermissionsConfigure')?.closest('.card');
    if(permissions)permissions.classList.add('ec-output-permissions-compact');

    const lan=q('#ecLanEnabled')?.closest('.card');
    if(lan){
      lan.classList.add('ec-output-lan-compact');
      const details=advancedBlock(lan,'ec-output-lan-advanced'),body=details?.querySelector('.ec-output-advanced-body');
      const port=q('#ecLanPort')?.closest('label'),apply=q('#ecLanApply')?.closest('.buttons'),portGrid=port?.parentElement;
      if(body){move(port,body);move(apply,body);}cleanEmptyGrid(portGrid);
    }

    const ndi=q('#ecNdiEnabled')?.closest('.card');
    if(ndi){
      ndi.classList.add('ec-output-ndi-compact');
      const details=advancedBlock(ndi,'ec-output-ndi-advanced'),body=details?.querySelector('.ec-output-advanced-body');
      const name=q('#ecNdiName')?.closest('label'),fps=q('#ecNdiFps')?.closest('label'),audio=q('#ecNdiAudio')?.closest('.switch-row'),format=q('#ecNdiFormat')?.closest('label'),apply=q('#ecNdiApply')?.closest('.buttons'),attribution=ndi.querySelector('.ec-ndi-attribution');
      const gridA=name?.parentElement,gridB=format?.parentElement;
      if(body){for(const node of [name,fps,audio,format,apply,attribution])move(node,body);}cleanEmptyGrid(gridA);cleanEmptyGrid(gridB);
    }

    const permissionsHost=q('#ecNetworkPermissionsHost'),ndiHost=q('#ecNdiOutputHost');
    permissionsHost?.classList.add('ec-output-wide');ndiHost?.classList.remove('ec-output-wide');
    return !!(summary&&permissions&&lan&&ndi);
  }

  function refresh(){
    const emission=compactEmissionDesign(),output=compactOutputCards();
    window.__ecEmissionOutputUxLab29State={emission,output};
    return emission&&output;
  }
  function retry(){
    clearTimeout(timer);
    if(refresh()||tries++>=120){window.__ecEmissionOutputUxLab29=true;return;}
    timer=setTimeout(retry,100);
  }

  window.ECAPI?.on?.('profile:changed',()=>setTimeout(refresh,250));
  window.ECAPI?.on?.('output:state',()=>setTimeout(compactOutputCards,0));
  window.ECAPI?.on?.('output:lanState',()=>setTimeout(compactOutputCards,0));
  window.ECAPI?.on?.('output:ndiState',()=>setTimeout(compactOutputCards,0));
  if(document.readyState==='complete')retry();else window.addEventListener('load',retry,{once:true});
})();