'use strict';
(function installLab28ControlStabilization(){
  if(window.__ecLab28ControlStabilization)return;
  if(!window.ECAPI||typeof settings==='undefined'||!settings){setTimeout(installLab28ControlStabilization,120);return;}
  window.__ecLab28ControlStabilization=true;
  const q=s=>document.querySelector(s);
  const DEFAULT_CTA='Puedes ver el video aquí:';
  let optimizationState=null,optimizationBusy=false;

  function ensureVisual(){settings.visual=settings.visual||{};settings.visual.output=settings.visual.output||{};return settings.visual.output;}
  function currentCta(){const out=ensureVisual();return out.youtubePromoCtaText==null?DEFAULT_CTA:String(out.youtubePromoCtaText);}
  function injectPromoDesign(){
    const host=q('#tab-emission .cols > div:first-child');if(!host||q('#ecYoutubePromoDesignLab28'))return;
    const card=document.createElement('div');card.id='ecYoutubePromoDesignLab28';card.className='card top-gap ec-lab28-promo-design';card.innerHTML=`<div class="section-head"><div><h3>Promo de YouTube</h3><p class="note">Personaliza el llamado que aparece al final de los contenidos vinculados.</p></div><span class="mini-pill">CONTENIDOS</span></div><label>Texto de llamada<input id="ecYoutubePromoCtaTextLab28" type="text" maxlength="140" placeholder="Puedes ver el video aquí:"></label><p class="note ec-lab28-field-help">Puedes dejarlo vacío para mostrar solo miniatura, título y canal.</p>`;
    host.appendChild(card);
    const input=q('#ecYoutubePromoCtaTextLab28');input.value=currentCta();
    const persist=async()=>{const value=String(input.value??'').slice(0,140);ensureVisual().youtubePromoCtaText=value;try{await window.ECAPI.saveSettings({visual:{output:{youtubePromoCtaText:value}}});if(typeof status==='function')status('Texto de promo YouTube guardado para este perfil.');}catch(e){if(typeof status==='function')status(`Promo YouTube: no se pudo guardar · ${e?.message||e}`);}};
    input.addEventListener('change',persist);input.addEventListener('blur',persist);
  }

  function compactAutomaticLayout(){
    const tab=q('#tab-auto');if(!tab)return;tab.classList.add('lab28-auto-compact');
    const left=tab.querySelector('.auto-cols > div:first-child');if(!left)return;
    for(const card of left.querySelectorAll(':scope > .card')){const title=String(card.querySelector('h3')?.textContent||'');if(title.includes('Preparación'))card.classList.add('lab28-preparation-card');if(title.includes('Emisión automática'))card.classList.add('lab28-emission-card');}
    q('#exclusiveSchedule0324')?.classList.add('lab28-exclusive-card');
  }

  function enforceOptimizationBadge(){
    const badge=q('#ecOptimizeState0321');if(!badge||!optimizationState)return;
    const valid=optimizationState.compatible===true&&!!optimizationState.profile&&optimizationState.profileMatch?.ok!==false;
    const text=valid?'OPTIMIZADA ✓':'SIN OPTIMIZAR';if(badge.textContent!==text)badge.textContent=text;
    badge.dataset.lab28Resolved=valid?'valid':'invalid';
    const profile=optimizationState.profile,root=q('#ecOptimizer0321');
    if(root&&profile){const note=root.querySelector('.ec-opt-result .note, .ec-opt-grid p.note[data-profile-status]');if(note)note.dataset.profileScoped='true';}
  }
  async function refreshOptimization(){if(optimizationBusy||typeof window.ECAPI.optimizationV2Status!=='function')return;optimizationBusy=true;try{optimizationState=await window.ECAPI.optimizationV2Status();enforceOptimizationBadge();}catch{}finally{optimizationBusy=false;}}
  const optObserver=new MutationObserver(()=>enforceOptimizationBadge());
  function watchOptimization(){const badge=q('#ecOptimizeState0321');if(badge)optObserver.observe(badge,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['class']});refreshOptimization();}

  function enhanceNetworkPermissionFeedback(){
    const button=q('#ecNetworkPermissionsConfigure');if(!button||button.dataset.lab28Feedback)return;button.dataset.lab28Feedback='1';
    button.addEventListener('click',()=>{
      const badge=q('#ecNetworkPermissionsState'),info=q('#ecNetworkPermissionsInfo');
      if(badge){badge.textContent='SOLICITANDO';badge.className='mini-pill';}
      if(info)info.textContent='Solicitando autorización de administrador a Windows… Si tu organización bloquea UAC, GEC mostrará el motivo al finalizar.';
      button.dataset.originalLabel=button.dataset.originalLabel||button.textContent;button.textContent='Esperando a Windows…';
      const restore=()=>{if(!button.disabled)button.textContent=button.dataset.originalLabel||'Configurar permisos de red';};setTimeout(restore,1200);setTimeout(restore,8000);
    },true);
  }

  function hydrateProfileUi(){
    if(typeof window.ECAPI.getSettings==='function')window.ECAPI.getSettings().then(s=>{if(s&&typeof s==='object'){if(s.visual)settings.visual=s.visual;const input=q('#ecYoutubePromoCtaTextLab28');if(input)input.value=currentCta();}compactAutomaticLayout();refreshOptimization();}).catch(()=>{});
  }

  injectPromoDesign();compactAutomaticLayout();watchOptimization();enhanceNetworkPermissionFeedback();
  window.ECAPI.on?.('profile:changed',()=>setTimeout(hydrateProfileUi,120));
  window.ECAPI.on?.('tts-lab:event',()=>setTimeout(refreshOptimization,180));
  setInterval(()=>{injectPromoDesign();compactAutomaticLayout();enhanceNetworkPermissionFeedback();if(!document.hidden)refreshOptimization();},2500);
})();
