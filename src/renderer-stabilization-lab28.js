'use strict';
(function installLab28ControlStabilization(){
  if(window.__ecLab28ControlStabilization)return;
  if(!window.ECAPI||typeof settings==='undefined'||!settings){setTimeout(installLab28ControlStabilization,120);return;}
  window.__ecLab28ControlStabilization=true;
  const q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)];
  const DEFAULT_CTA='Puedes ver el video aquí:';
  const DEFAULT_PROMO={ctaText:DEFAULT_CTA,formats:{'16:9':{position:'bottom-left',xPercent:4,yPercent:5,scale:1,ctaFontSize:22,titleFontSize:18,channelFontSize:14,backgroundOpacity:.85,thumbnailScale:1,borderRadius:14,titleMaxLines:2},'9:16':{position:'bottom-left',xPercent:5,yPercent:8,scale:.9,ctaFontSize:22,titleFontSize:18,channelFontSize:14,backgroundOpacity:.85,thumbnailScale:1,borderRadius:14,titleMaxLines:2}}};
  const POSITIONS=new Set(['bottom-left','bottom-right','top-left','top-right']);
  let optimizationState=null,optimizationBusy=false,summaryBusy=false,promoPersistTail=Promise.resolve();
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const clamp=(v,min,max,fallback)=>{const n=Number(v);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;};
  const fmtKey=v=>String(v||'16:9')==='9:16'?'9:16':'16:9';
  const activateTab=name=>{try{if(typeof tab==='function')return tab(name);}catch{}qa('.nav').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));qa('.tab').forEach(x=>x.classList.toggle('show',x.id===`tab-${name}`));};
  const move=(el,to)=>{if(el&&to&&el.parentElement!==to)to.appendChild(el);return el;};

  function ensureVisual(){settings.visual=settings.visual||{};settings.visual.output=settings.visual.output||{};return settings.visual.output;}
  function normalizePromoRoot(raw=ensureVisual().youtubePromoDesign,legacy=ensureVisual().youtubePromoCtaText){
    const r=raw&&typeof raw==='object'?raw:{},formats=r.formats&&typeof r.formats==='object'?r.formats:{},cta=Object.prototype.hasOwnProperty.call(r,'ctaText')?r.ctaText:(legacy==null?DEFAULT_CTA:legacy);
    const one=(value,key)=>{const d=DEFAULT_PROMO.formats[key],x=value&&typeof value==='object'?value:{};return{position:POSITIONS.has(String(x.position||''))?String(x.position):d.position,xPercent:clamp(x.xPercent,0,40,d.xPercent),yPercent:clamp(x.yPercent,0,40,d.yPercent),scale:clamp(x.scale,.55,1.5,d.scale),ctaFontSize:clamp(x.ctaFontSize,10,72,d.ctaFontSize),titleFontSize:clamp(x.titleFontSize,10,72,d.titleFontSize),channelFontSize:clamp(x.channelFontSize,10,72,d.channelFontSize),backgroundOpacity:clamp(x.backgroundOpacity,.35,1,d.backgroundOpacity),thumbnailScale:clamp(x.thumbnailScale,.6,1.6,d.thumbnailScale),borderRadius:clamp(x.borderRadius,0,40,d.borderRadius),titleMaxLines:Math.round(clamp(x.titleMaxLines,1,4,d.titleMaxLines))};};
    return{ctaText:String(cta??'').slice(0,140),formats:{'16:9':one(formats['16:9'],'16:9'),'9:16':one(formats['9:16'],'9:16')}};
  }
  function currentCta(){return normalizePromoRoot().ctaText;}
  function currentPromoFormat(){return fmtKey(q('#outputFormat')?.value||ensureVisual().format);}

  function ensureOutputTab(){
    let nav=q('.nav[data-tab="output"]');
    if(!nav){const holder=document.createElement('div');holder.innerHTML='<button class="nav" data-tab="output" type="button">Salida</button>';nav=holder.firstElementChild;const audio=q('.nav[data-tab="audio"]'),settingsNav=q('.nav[data-tab="settings"]');(audio||settingsNav)?.insertAdjacentElement('beforebegin',nav);nav?.addEventListener('click',()=>activateTab('output'));}
    let panel=q('#tab-output');
    if(!panel){panel=document.createElement('section');panel.id='tab-output';panel.className='tab';panel.innerHTML=`<h1>Salida</h1><div class="ec-output-layout"><div id="ecOutputSummaryHost" class="ec-output-wide"></div><div id="ecNetworkPermissionsHost"></div><div id="ecLanOutputHost"></div><div id="ecNdiOutputHost" class="ec-output-wide"></div></div>`;const audioTab=q('#tab-audio'),settingsTab=q('#tab-settings');(audioTab||settingsTab)?.insertAdjacentElement('beforebegin',panel);}
    ensureOutputSummary();return panel;
  }
  function ensureOutputSummary(){
    const host=q('#ecOutputSummaryHost');if(!host||q('#ecOutputSummaryCard'))return;
    const card=document.createElement('div');card.id='ecOutputSummaryCard';card.className='card ec-output-summary';card.innerHTML=`<div class="section-head"><div><h3>Output maestro</h3><p class="note">Una sola señal maestra alimenta el monitor local, Output LAN y NDI.</p></div><span id="ecOutputMasterState" class="status-pill neutral">CERRADO</span></div><div class="ec-output-flow"><div class="ec-output-master"><b id="ecOutputMasterResolution">1920×1080 · 16:9</b><span>OUTPUT LOCAL</span></div><span class="ec-output-arrow">→</span><div class="ec-output-destinations"><div><b id="ecOutputMonitorSummary">Disponible</b><span>Monitor local</span></div><div><b id="ecOutputLanSummary">Desactivado</b><span>Output LAN</span></div><div><b id="ecOutputNdiSummary">Desactivado</b><span>NDI</span></div></div></div><div class="buttons"><button id="ecOutputMasterOpen" type="button">Abrir / Mostrar Output</button></div>`;host.appendChild(card);q('#ecOutputMasterOpen').onclick=()=>q('#openOutput')?.click();
  }
  async function refreshOutputSummary(state=null){
    if(summaryBusy)return;summaryBusy=true;
    try{
      const [out,lan,ndi]=await Promise.all([state?Promise.resolve(state):window.ECAPI.outputStatus?.().catch(()=>null),window.ECAPI.outputLanStatus?.().catch(()=>null),window.ECAPI.outputNdiStatus?.().catch(()=>null)]),pill=q('#ecOutputMasterState'),res=q('#ecOutputMasterResolution'),monitor=q('#ecOutputMonitorSummary'),lanEl=q('#ecOutputLanSummary'),ndiEl=q('#ecOutputNdiSummary');
      if(pill){pill.textContent=out?.open?'ACTIVO':'CERRADO';pill.className=`status-pill ${out?.open?'live':'neutral'}`;}if(res)res.textContent=`${out?.resolution||(out?.format==='9:16'?'1080×1920':'1920×1080')} · ${out?.format||'16:9'}`;if(monitor)monitor.textContent=out?.open?'Activo':'Disponible';if(lanEl)lanEl.textContent=lan?.enabled?`Activo · ${Number(lan.connections)||0} conexión${Number(lan.connections)===1?'':'es'}`:'Desactivado';if(ndiEl)ndiEl.textContent=ndi?.running?`Activo · ${Number(ndi.connections)||0} receptor${Number(ndi.connections)===1?'':'es'}`:ndi?.enabled?'Iniciando':'Desactivado';
    }catch{}finally{summaryBusy=false;}
  }
  function relocateOutputCards(){
    ensureOutputTab();
    const permissions=q('#ecNetworkPermissionsConfigure')?.closest('.card'),lan=q('#ecLanEnabled')?.closest('.card'),ndi=q('#ecNdiEnabled')?.closest('.card');move(permissions,q('#ecNetworkPermissionsHost'));move(lan,q('#ecLanOutputHost'));move(ndi,q('#ecNdiOutputHost'));
  }

  function ensureEmissionLayout(){
    const cols=q('#tab-emission .cols');if(!cols)return;
    let left=q('#ecDesignLeft');if(!left){left=cols.firstElementChild;if(left)left.id='ecDesignLeft';}
    let right=q('#ecDesignRight')||q('#ec27EmissionRight');if(right)right.id='ecDesignRight';
    if(!left||!right)return;
    const editor=q('#ec0325DesignEditor'),blocks=editor?[...editor.querySelectorAll(':scope > .ec25-design-block')]:[],backgrounds=blocks.find(x=>/Fondos y casillas/i.test(x.querySelector('h3')?.textContent||''));
    if(backgrounds){backgrounds.id='ecDesignBackgroundsCard';backgrounds.classList.remove('subcard');backgrounds.classList.add('card');}
    const preview=q('#tab-emission .preview-card'),transition=q('#transitionType')?.closest('.card'),standby=q('#ec0331StandbyCard');
    for(const node of [preview,transition,backgrounds,standby])move(node,right);
    if(preview)ensurePromoPreview(preview);injectPromoDesign();installSafeReset();
  }

  function previewMode(mode='note'){
    const note=q('#designPreview'),promo=q('#ecYoutubePromoPreview'),noteBtn=q('#ecPreviewModeNote'),promoBtn=q('#ecPreviewModeYoutube');if(!note||!promo)return;
    const isPromo=mode==='promo';note.classList.toggle('ec28-preview-hidden',isPromo);promo.classList.toggle('ec28-preview-hidden',!isPromo);noteBtn?.classList.toggle('active',!isPromo);promoBtn?.classList.toggle('active',isPromo);if(isPromo)renderPromoPreview();
  }
  function ensurePromoPreview(previewCard){
    const head=previewCard.querySelector('.section-head');if(head&&!q('#ecDesignPreviewModes')){const modes=document.createElement('div');modes.id='ecDesignPreviewModes';modes.className='ec-preview-modes';modes.innerHTML='<button id="ecPreviewModeNote" class="dark compact active" type="button">Nota</button><button id="ecPreviewModeYoutube" class="dark compact" type="button">Promo YouTube</button>';const badge=q('#designFormatBadge');badge?.insertAdjacentElement('beforebegin',modes);q('#ecPreviewModeNote').onclick=()=>previewMode('note');q('#ecPreviewModeYoutube').onclick=()=>previewMode('promo');}
    const host=previewCard.querySelector('.preview-host.design-host')||previewCard.querySelector('.preview-host');if(host&&!q('#ecYoutubePromoPreview')){const p=document.createElement('div');p.id='ecYoutubePromoPreview';p.className='ec-youtube-design-preview ec28-preview-hidden format-16-9';p.innerHTML='<div class="ec-youtube-design-video"></div><div class="ec-youtube-design-card"><div class="ec-youtube-design-thumb"></div><div class="ec-youtube-design-copy"><div class="ec-youtube-design-cta">Puedes ver el video aquí:</div><div class="ec-youtube-design-title">Título del video vinculado en YouTube</div><div class="ec-youtube-design-channel">EL COMERCIO</div></div></div>';host.appendChild(p);}
  }
  function renderPromoPreview(){
    const root=normalizePromoRoot(),key=currentPromoFormat(),d=root.formats[key],preview=q('#ecYoutubePromoPreview'),card=q('#ecYoutubePromoPreview .ec-youtube-design-card');if(!preview||!card)return;
    preview.classList.toggle('format-9-16',key==='9:16');preview.classList.toggle('format-16-9',key!=='9:16');card.dataset.position=d.position;card.style.setProperty('--preview-x',`${d.xPercent}%`);card.style.setProperty('--preview-y',`${d.yPercent}%`);card.style.setProperty('--preview-scale',String(d.scale));card.style.setProperty('--preview-bg',String(d.backgroundOpacity));card.style.setProperty('--preview-radius',`${d.borderRadius}px`);const thumb=card.querySelector('.ec-youtube-design-thumb');if(thumb)thumb.style.flexBasis=`${Math.max(22,Math.min(48,32*d.thumbnailScale))}%`;const cta=card.querySelector('.ec-youtube-design-cta'),title=card.querySelector('.ec-youtube-design-title'),channel=card.querySelector('.ec-youtube-design-channel');if(cta){cta.textContent=root.ctaText;cta.style.fontSize=`${d.ctaFontSize}px`;cta.classList.toggle('hidden',!root.ctaText.trim());}if(title){title.style.fontSize=`${d.titleFontSize}px`;title.style.webkitLineClamp=String(d.titleMaxLines);}if(channel)channel.style.fontSize=`${d.channelFontSize}px`;
  }

  function promoFieldValue(id,value){const el=q('#'+id);if(el&&document.activeElement!==el)el.value=String(value);}
  function hydratePromoControls(){
    const root=normalizePromoRoot(),d=root.formats[currentPromoFormat()];promoFieldValue('ecYoutubePromoCtaTextLab28',root.ctaText);promoFieldValue('ecYoutubePromoPositionLab29',d.position);promoFieldValue('ecYoutubePromoScaleLab29',d.scale);promoFieldValue('ecYoutubePromoXLab29',d.xPercent);promoFieldValue('ecYoutubePromoYLab29',d.yPercent);promoFieldValue('ecYoutubePromoCtaSizeLab29',d.ctaFontSize);promoFieldValue('ecYoutubePromoTitleSizeLab29',d.titleFontSize);promoFieldValue('ecYoutubePromoChannelSizeLab29',d.channelFontSize);promoFieldValue('ecYoutubePromoOpacityLab29',Math.round(d.backgroundOpacity*100));promoFieldValue('ecYoutubePromoThumbScaleLab29',d.thumbnailScale);promoFieldValue('ecYoutubePromoRadiusLab29',d.borderRadius);promoFieldValue('ecYoutubePromoLinesLab29',d.titleMaxLines);renderPromoPreview();
  }
  function readPromoControls(){
    const root=normalizePromoRoot(),key=currentPromoFormat(),old=root.formats[key];root.ctaText=String(q('#ecYoutubePromoCtaTextLab28')?.value??root.ctaText).slice(0,140);root.formats[key]={position:POSITIONS.has(String(q('#ecYoutubePromoPositionLab29')?.value||''))?String(q('#ecYoutubePromoPositionLab29').value):old.position,xPercent:clamp(q('#ecYoutubePromoXLab29')?.value,0,40,old.xPercent),yPercent:clamp(q('#ecYoutubePromoYLab29')?.value,0,40,old.yPercent),scale:clamp(q('#ecYoutubePromoScaleLab29')?.value,.55,1.5,old.scale),ctaFontSize:clamp(q('#ecYoutubePromoCtaSizeLab29')?.value,10,72,old.ctaFontSize),titleFontSize:clamp(q('#ecYoutubePromoTitleSizeLab29')?.value,10,72,old.titleFontSize),channelFontSize:clamp(q('#ecYoutubePromoChannelSizeLab29')?.value,10,72,old.channelFontSize),backgroundOpacity:clamp(Number(q('#ecYoutubePromoOpacityLab29')?.value)/100,.35,1,old.backgroundOpacity),thumbnailScale:clamp(q('#ecYoutubePromoThumbScaleLab29')?.value,.6,1.6,old.thumbnailScale),borderRadius:clamp(q('#ecYoutubePromoRadiusLab29')?.value,0,40,old.borderRadius),titleMaxLines:Math.round(clamp(q('#ecYoutubePromoLinesLab29')?.value,1,4,old.titleMaxLines))};return root;
  }
  function updatePromoLocal(){const root=readPromoControls(),out=ensureVisual();out.youtubePromoDesign=root;out.youtubePromoCtaText=root.ctaText;renderPromoPreview();previewMode('promo');}
  function persistPromoDesign(){
    const desired=clone(readPromoControls());promoPersistTail=promoPersistTail.catch(()=>{}).then(async()=>{const fresh=await window.ECAPI.getSettings();fresh.visual=fresh.visual||{};fresh.visual.output=fresh.visual.output||{};fresh.visual.output.youtubePromoDesign=desired;fresh.visual.output.youtubePromoCtaText=desired.ctaText;await window.ECAPI.saveSettings(fresh);settings.visual=settings.visual||{};settings.visual.output={...settings.visual.output,...fresh.visual.output};if(typeof status==='function')status('Diseño de Promo YouTube guardado para este perfil.');}).catch(e=>{if(typeof status==='function')status(`Promo YouTube: no se pudo guardar · ${e?.message||e}`);});return promoPersistTail;
  }
  function injectPromoDesign(){
    const host=q('#ecDesignLeft')||q('#tab-emission .cols > div:first-child');if(!host)return;
    let card=q('#ecYoutubePromoDesignLab28');if(!card){card=document.createElement('div');card.id='ecYoutubePromoDesignLab28';card.className='card top-gap ec-lab28-promo-design';card.innerHTML=`<div class="section-head"><div><h3>Promo de YouTube</h3><p class="note">Diseña la tarjeta que aparece al final de los contenidos vinculados. La activación y los vínculos se gestionan en Contenidos / Anuncios.</p></div><span class="mini-pill">CONTENIDOS</span></div><label>Texto de llamada<input id="ecYoutubePromoCtaTextLab28" type="text" maxlength="140" placeholder="Puedes ver el video aquí:"></label><div class="ec-promo-grid"><label>Posición<select id="ecYoutubePromoPositionLab29"><option value="bottom-left">Inferior izquierda</option><option value="bottom-right">Inferior derecha</option><option value="top-left">Superior izquierda</option><option value="top-right">Superior derecha</option></select></label><label>Escala de tarjeta<input id="ecYoutubePromoScaleLab29" type="number" min="0.55" max="1.5" step="0.05"></label><label>Posición X (%)<input id="ecYoutubePromoXLab29" type="number" min="0" max="40" step="1"></label><label>Posición Y (%)<input id="ecYoutubePromoYLab29" type="number" min="0" max="40" step="1"></label><label>Tamaño CTA<input id="ecYoutubePromoCtaSizeLab29" type="number" min="10" max="72" step="1"></label><label>Tamaño título<input id="ecYoutubePromoTitleSizeLab29" type="number" min="10" max="72" step="1"></label><label>Tamaño canal<input id="ecYoutubePromoChannelSizeLab29" type="number" min="10" max="72" step="1"></label></div><details class="ec-promo-advanced"><summary>Opciones avanzadas</summary><div class="ec-promo-grid"><label>Opacidad del fondo (%)<input id="ecYoutubePromoOpacityLab29" type="number" min="35" max="100" step="1"></label><label>Tamaño de miniatura<input id="ecYoutubePromoThumbScaleLab29" type="number" min="0.6" max="1.6" step="0.05"></label><label>Radio de esquinas<input id="ecYoutubePromoRadiusLab29" type="number" min="0" max="40" step="1"></label><label>Máximo de líneas<input id="ecYoutubePromoLinesLab29" type="number" min="1" max="4" step="1"></label></div></details><p class="note ec-lab28-field-help">El diseño se guarda por perfil y de forma independiente para 16:9 y 9:16.</p>`;host.appendChild(card);for(const el of card.querySelectorAll('input,select')){el.addEventListener('input',updatePromoLocal);el.addEventListener('change',()=>{updatePromoLocal();persistPromoDesign();});}card.addEventListener('focusin',()=>previewMode('promo'));}
    hydratePromoControls();
  }

  function safeResetDesign(){
    if(!confirm('¿Restaurar el diseño visual predeterminado?'))return;
    const current={...ensureVisual()},keep={standbyVideo:current.standbyVideo||'',standbyVideoUrl:current.standbyVideoUrl||'',verticalVideoBackground:current.verticalVideoBackground||'',verticalVideoBackgroundUrl:current.verticalVideoBackgroundUrl||'',musicFile:current.musicFile||'',musicUrl:current.musicUrl||''};
    const defaults={format:'16:9',fontFamily:'Arial',dateFontFamily:'Arial',animation:'auto',motionSpeed:'normal',tiktokSafe:true,showSafeGuides:true,titleFontFamily:'Arial',titleFontVariant:'black',titleFontSize:70,titleUppercase:false,titleColor:'#FFFFFF',summaryFontFamily:'Arial',summaryFontVariant:'regular',summaryFontSize:34,summaryUppercase:false,summaryColor:'#F3F3F3',categoryFontFamily:'Arial',categoryFontVariant:'black',categoryFontSize:28,categoryUppercase:true,categoryTextColor:'#000000',dateFontVariant:'medium',dateFontSize:27,dateUppercase:true,dateColor:'#F3F3F3',exclusiveFontFamily:'Arial',exclusiveFontVariant:'extrabold',exclusiveFontSize:24,exclusiveUppercase:true,exclusiveTextColor:'#000000',categoryBgColor:'#F7C600',categoryBgOpacity:1,categoryRadius:0,exclusiveBgColor:'#F7C600',exclusiveBgOpacity:1,exclusiveRadius:5,lowerBgColor:'#000000',lowerOpacity:.88,youtubePromoDesign:clone(DEFAULT_PROMO),youtubePromoCtaText:DEFAULT_CTA};
    settings.visual.output={...current,...defaults,...keep};if(typeof setDesignControls==='function')setDesignControls(settings.visual.output);if(typeof refreshPreview==='function')refreshPreview();hydratePromoControls();previewMode('note');try{window.ECAPI.previewOutputDesign(settings.visual.output);}catch{}if(typeof status==='function')status('Diseño restaurado. Pulsa Guardar diseño para conservarlo.');
  }
  function installSafeReset(){const b=q('#resetDesign');if(!b||b.dataset.ecSafeReset==='1')return;b.dataset.ecSafeReset='1';b.onclick=safeResetDesign;}

  function bindPreviewIntent(){
    const editor=q('#ec0325DesignEditor');if(editor&&editor.dataset.ecPreviewIntent!=='1'){editor.dataset.ecPreviewIntent='1';editor.addEventListener('focusin',()=>previewMode('note'));editor.addEventListener('pointerdown',()=>previewMode('note'));}
    const format=q('#outputFormat');if(format&&format.dataset.ecPromoFormat!=='1'){format.dataset.ecPromoFormat='1';format.addEventListener('change',()=>{hydratePromoControls();previewMode('note');});}
  }

  function compactAutomaticLayout(){
    const tabAuto=q('#tab-auto');if(!tabAuto)return;tabAuto.classList.add('lab28-auto-compact');
    const left=tabAuto.querySelector('.auto-cols > div:first-child');if(!left)return;
    for(const card of left.querySelectorAll(':scope > .card')){const title=String(card.querySelector('h3')?.textContent||'');if(title.includes('Preparación'))card.classList.add('lab28-preparation-card');if(title.includes('Emisión automática'))card.classList.add('lab28-emission-card');}
    q('#exclusiveSchedule0324')?.classList.add('lab28-exclusive-card');
  }

  function enforceOptimizationBadge(){
    const badge=q('#ecOptimizeState0321');if(!badge||!optimizationState)return;
    const valid=optimizationState.compatible===true&&!!optimizationState.profile&&optimizationState.profileMatch?.ok!==false;
    const text=valid?'OPTIMIZADA ✓':'SIN OPTIMIZAR',resolved=valid?'valid':'invalid';
    if(badge.textContent!==text)badge.textContent=text;
    if(badge.getAttribute('data-lab28-resolved')!==resolved)badge.setAttribute('data-lab28-resolved',resolved);
    const profile=optimizationState.profile,root=q('#ecOptimizer0321');
    if(root&&profile){const note=root.querySelector('.ec-opt-result .note, .ec-opt-grid p.note[data-profile-status]');if(note&&note.dataset.profileScoped!=='true')note.dataset.profileScoped='true';}
  }
  async function refreshOptimization(){if(optimizationBusy||typeof window.ECAPI.optimizationV2Status!=='function')return;optimizationBusy=true;try{optimizationState=await window.ECAPI.optimizationV2Status();enforceOptimizationBadge();}catch{}finally{optimizationBusy=false;}}
  const optObserver=new MutationObserver(()=>enforceOptimizationBadge());
  function watchOptimization(){const badge=q('#ecOptimizeState0321');if(badge)optObserver.observe(badge,{childList:true,characterData:true,subtree:true});refreshOptimization();}

  function enhanceNetworkPermissionFeedback(){
    const button=q('#ecNetworkPermissionsConfigure');if(!button||button.dataset.lab28Feedback)return;button.dataset.lab28Feedback='1';
    button.addEventListener('click',()=>{
      const badge=q('#ecNetworkPermissionsState'),info=q('#ecNetworkPermissionsInfo');
      if(badge){badge.textContent='SOLICITANDO';badge.className='status-pill ok';}
      if(info)info.textContent='Solicitando autorización de administrador a Windows… Si tu organización bloquea UAC, GEC mostrará el motivo al finalizar.';
      button.dataset.originalLabel=button.dataset.originalLabel||button.textContent;button.textContent='Esperando a Windows…';
      const restore=()=>{if(!button.disabled)button.textContent=button.dataset.originalLabel||'Configurar permisos de red';};setTimeout(restore,1200);setTimeout(restore,8000);
    },true);
  }

  async function hydrateProfileUi(){
    try{const s=await window.ECAPI.getSettings();if(s&&typeof s==='object'){if(s.visual)settings.visual=s.visual;}ensureEmissionLayout();relocateOutputCards();hydratePromoControls();bindPreviewIntent();compactAutomaticLayout();refreshOutputSummary();refreshOptimization();}catch{}
  }

  ensureOutputTab();ensureEmissionLayout();relocateOutputCards();compactAutomaticLayout();watchOptimization();enhanceNetworkPermissionFeedback();bindPreviewIntent();refreshOutputSummary();
  window.ECAPI.on?.('profile:changed',()=>setTimeout(hydrateProfileUi,180));
  window.ECAPI.on?.('tts-lab:event',()=>setTimeout(refreshOptimization,180));
  window.ECAPI.on?.('output:state',s=>refreshOutputSummary(s));window.ECAPI.on?.('output:lanState',()=>refreshOutputSummary());window.ECAPI.on?.('output:ndiState',()=>refreshOutputSummary());
  setInterval(()=>{ensureOutputTab();ensureEmissionLayout();relocateOutputCards();compactAutomaticLayout();enhanceNetworkPermissionFeedback();bindPreviewIntent();if(!document.hidden){refreshOptimization();refreshOutputSummary();}},2500);
})();
