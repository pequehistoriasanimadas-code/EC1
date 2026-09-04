'use strict';
(function installRenderer0331(){
  if(window.__ec0331RendererInstalled)return;
  if(!window.ECAPI||typeof settings==='undefined'||!settings||typeof renderQueue!=='function'){setTimeout(installRenderer0331,120);return;}
  window.__ec0331RendererInstalled=true;
  const q=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const qAll=s=>[...document.querySelectorAll(s)];
  let lastSnapshot=null;

  function ensureStandbyCard(){
    if(q('#ec0331StandbyCard'))return;const transition=q('#transitionType')?.closest('.card');const host=transition?.parentElement||q('#tab-emission > .cols > div:first-child')||q('#tab-emission');if(!host)return;
    const card=document.createElement('div');card.id='ec0331StandbyCard';card.className='card top-gap';card.innerHTML=`<div class="section-head"><div><h3>Video de espera del Output</h3><p class="note">Se reproduce automáticamente en loop mientras el Output está abierto y no hay una emisión al aire.</p></div><span id="ec0331StandbyState" class="mini-pill">SIN VIDEO</span></div><div class="buttons"><button id="ec0331PickStandby">Seleccionar video</button><button id="ec0331ClearStandby" class="dark">Quitar</button></div><div id="ec0331StandbyInfo" class="note">Sin video de espera configurado · se mostrará negro.</div><p class="note">Usa la misma transición configurada en Transiciones. La música de fondo también se reproduce durante la espera y continúa al entrar una noticia.</p>`;
    if(transition)transition.insertAdjacentElement('beforebegin',card);else host.appendChild(card);
    q('#ec0331PickStandby').onclick=async()=>{try{const r=await window.ECAPI.pickStandbyVideo();if(!r?.ok)return;settings.visual=settings.visual||{};settings.visual.output=settings.visual.output||{};settings.visual.output.standbyVideo=r.path||'';settings.visual.output.standbyVideoUrl=r.url||'';await window.ECAPI.saveSettings(settings);updateStandbyUi();status(`Video de espera seleccionado: ${r.name||'video'}`);}catch(e){status(`No se pudo seleccionar el video de espera: ${e.message||e}`);}};
    q('#ec0331ClearStandby').onclick=async()=>{try{await window.ECAPI.clearStandbyVideo();settings.visual=settings.visual||{};settings.visual.output=settings.visual.output||{};settings.visual.output.standbyVideo='';settings.visual.output.standbyVideoUrl='';await window.ECAPI.saveSettings(settings);updateStandbyUi();status('Video de espera eliminado.');}catch(e){status(`No se pudo quitar el video de espera: ${e.message||e}`);}};
  }
  function updateStandbyUi(){const file=String(settings?.visual?.output?.standbyVideo||''),info=q('#ec0331StandbyInfo'),badge=q('#ec0331StandbyState');if(info)info.textContent=file||'Sin video de espera configurado · se mostrará negro.';if(badge){badge.textContent=file?'CONFIGURADO':'SIN VIDEO';badge.className=`mini-pill ${file?'ok':''}`;}}

  function ensureExclusiveHelp(){const select=q('#exclusiveEveryNews');if(!select)return;const card=select.closest('.card')||select.parentElement;const notes=card?[...card.querySelectorAll('p,.note,small')]:[];for(const n of notes){if(/nunca obliga a insertar una exclusiva|detiene la emisión si solo hay exclusivas/i.test(n.textContent||'')){n.textContent='La selección funciona como separación mínima real. Con “1 cada 4 noticias”, después de una exclusiva deben emitirse 3 noticias no exclusivas antes de habilitar otra. Contenidos y anuncios no cuentan.';break;}}
  }

  async function rebuildCannedList(){
    const box=q('#cannedList');if(!box)return;let r;try{r=await window.ECAPI.cannedList();}catch{return;}if(!r?.files?.length)return;
    box.innerHTML='';for(const x of r.files){const item=document.createElement('div');item.className='media-item ec0331-media-item';item.innerHTML=`<div class="ec0331-media-copy"><div class="media-name">${esc(x.name)}</div><div class="media-meta">${Number(x.sizeMB||0).toFixed(1)} MB${Number(x.durationSec)>0?` · ${Math.round(Number(x.durationSec))} s`:''}</div></div><button class="dark compact ec0331-program-content">Programar como próximo</button>`;item.querySelector('button').onclick=async()=>{try{const st=await window.ECAPI.cannedScheduleSpecific(x.path);lastSnapshot=st;renderQueueDirect(st);updateManualState(st);status(`Programado como próximo: ${x.name}`);}catch(e){status(`No se pudo programar el contenido: ${e.message||e}`);}};box.appendChild(item);}
  }
  function ensureManualState(){const list=q('#cannedList');if(!list||q('#ec0331ManualState'))return;const box=document.createElement('div');box.id='ec0331ManualState';box.className='ec0331-manual-state hidden';box.innerHTML='<div><b>SELECCIÓN MANUAL</b><span id="ec0331ManualName"></span></div><button id="ec0331CancelManual" class="dark compact">Cancelar selección</button>';list.insertAdjacentElement('beforebegin',box);q('#ec0331CancelManual').onclick=async()=>{try{const st=await window.ECAPI.cannedCancelSpecific();lastSnapshot=st;renderQueueDirect(st);updateManualState(st);status('Selección manual cancelada.');}catch(e){status(`No se pudo cancelar: ${e.message||e}`);}};}
  function updateManualState(st=lastSnapshot){ensureManualState();const box=q('#ec0331ManualState'),name=q('#ec0331ManualName'),manual=st?.manualContent;if(!box)return;box.classList.toggle('hidden',!manual);if(name)name.textContent=manual?`Próximo: ${manual.name}`:'';qAll('.ec0331-program-content').forEach(b=>{b.textContent='Programar como próximo';b.disabled=false;});if(manual){qAll('.ec0331-media-item').forEach(item=>{if(item.querySelector('.media-name')?.textContent===manual.name){const b=item.querySelector('.ec0331-program-content');if(b){b.textContent='PROGRAMADO';b.disabled=true;}}});}}

  function rowKind(row){return row?.sourceType==='content'?'content':row?.sourceType==='ad'?'ad':'news';}
  function rowTypeLabel(row){const k=rowKind(row);return k==='content'?'CONTENIDO':k==='ad'?'ANUNCIO':'NOTICIA';}
  function typeColor(row){const colors=settings?.visual?.queueColors||{};const k=rowKind(row);if(k==='content')return colors.content||'#D97706';if(k==='ad')return colors.ad||'#7C3AED';if(String(row?.status||'').toUpperCase()==='ERROR')return colors.error||'#B91C1C';return row?.sourceType==='generated'?(colors.generated||'#2563EB'):(colors.rss||'#2E7D32');}
  function statusClass(row){const s=String(row?.exclusiveBlocked?'ESPERA':row?.status||'').toUpperCase();if(s==='AL AIRE')return'air';if(s==='LISTA')return'ready';if(s==='PROCESANDO'||s==='PENDIENTE'||s==='ESPERA')return'processing';if(s==='ERROR')return'error';if(s==='PROGRAMADO')return'planned';if(s==='EMITIDA'||s==='OMITIDA')return'emitted';return'planned';}
  function statusText(row){return row?.exclusiveBlocked?'ESPERA':String(row?.status||'').toUpperCase()||'LISTA';}
  function seconds(v){const n=Number(v);return Number.isFinite(n)&&n>=0?`${n.toFixed(n<10?1:0)} s`:'';}
  function metaText(row){
    if(row?.planned)return String(row.planText||'Programado');
    const parts=[];if(row?.feedName)parts.push(String(row.feedName));if(row?.category)parts.push(String(row.category));
    const m=row?.metrics||{};const timings=[];
    const text=seconds(m.textElapsedSec??(Number(m.textElapsedMs)>=0?Number(m.textElapsedMs)/1000:NaN));if(text)timings.push(`Texto ${text}`);
    const pron=seconds(m.pronunciationElapsedSec??(Number(m.pronunciationElapsedMs)>=0?Number(m.pronunciationElapsedMs)/1000:NaN));if(pron)timings.push(`Pronunciación ${pron}`);
    const voice=seconds(m.voiceElapsedSec??(Number(m.ttsElapsedMs)>=0?Number(m.ttsElapsedMs)/1000:NaN));if(voice)timings.push(`Voz ${voice}`);
    const audio=seconds(row?.audioDurationSec??m.audioDurationSec??row?.result?.durationSec);if(audio)timings.push(`Audio ${audio}`);
    if(timings.length)parts.push(timings.join(' · '));if(row?.error)parts.push(String(row.error));return parts.join(' · ');
  }
  function technicalHtml(row){const bits=[];if(row?.provider)bits.push(`Proveedor: ${esc(row.provider)}`);if(row?.model)bits.push(`Modelo: ${esc(row.model)}`);if(row?.stage)bits.push(`Etapa: ${esc(row.stage)}`);if(row?.storyUrl)bits.push(`URL: ${esc(row.storyUrl)}`);if(!bits.length)return'';return`<details class="technical-details"><summary>Ver detalles técnicos</summary><div>${bits.join(' · ')}</div></details>`;}
  function renderQueueDirect(snapshot){if(window.__ecQueueRenderOwner==='0332')return;
    const box=q('#queue');if(!box)return;const rows=(snapshot?.queue||[]).filter(Boolean),scroll=box.scrollTop;if(!rows.length){box.innerHTML='<div class="empty">Sin actividad</div>';return;}
    let pos=0,preparingShown=false;const html=[];
    for(const row of rows){
      const preparing=row.queueGroup==='preparing',history=!!row.history;if(preparing&&!preparingShown){preparingShown=true;html.push('<div class="ec0330-preparing-divider"><strong>En preparación</strong><span>Estas noticias todavía no tienen una posición definitiva de emisión.</span></div>');}
      const index=preparing||history?'':`${++pos}.`,exclusive=!!row.isExclusive,planned=!!row.planned,kind=rowKind(row),meta=metaText(row),key=String(row.id||row.renderKey||`${kind}-${pos}-${row.title||''}`);
      const classes=['queue-item',planned?'planned':'',history?'history':'',row.exclusiveBlocked?'ec0331-exclusive-blocked':''].filter(Boolean).join(' ');
      html.push(`<div class="${classes}" data-ec-queue-id="${esc(key)}" data-source-type="${esc(kind)}" style="--type-color:${esc(typeColor(row))}"><div class="queue-main"><div class="queue-index">${esc(index)}</div><div class="queue-text"><div class="queue-headline"><span class="queue-type">${rowTypeLabel(row)}</span>${exclusive?'<span class="queue-exclusive">EXCLUSIVO</span>':''}<span class="queue-title">${esc(row.title||'Sin título')}</span></div>${meta?`<div class="queue-meta">${esc(meta)}</div>`:''}${row.exclusiveBlocked?`<div class="ec0331-wait-note">${esc(row.planText||'En espera de la separación mínima entre exclusivas.')}</div>`:''}${technicalHtml(row)}</div><span class="queue-badge ${statusClass(row)}">${esc(statusText(row))}</span></div></div>`);
    }
    box.innerHTML=html.join('');box.scrollTop=Math.min(scroll,Math.max(0,box.scrollHeight-box.clientHeight));
    window.__ec0331QueueAudit={rows:rows.length,rendered:box.querySelectorAll('.queue-item').length,planned:box.querySelectorAll('.queue-item.planned').length,exclusive:box.querySelectorAll('.queue-exclusive').length,positions:[...box.querySelectorAll('.queue-index')].map(x=>x.textContent.trim()).filter(Boolean)};
  }

  const oldRefresh=typeof refreshCannedList==='function'?refreshCannedList:null;if(oldRefresh){refreshCannedList=async function(){const r=await oldRefresh.apply(this,arguments);ensureManualState();await rebuildCannedList();updateManualState();return r;};}
  renderQueue=function(snapshot){lastSnapshot=snapshot;renderQueueDirect(snapshot);updateManualState(snapshot);};
  window.ECAPI.on('automation:state',s=>{lastSnapshot=s;if(window.__ecQueueRenderOwner!=='0332'){renderQueueDirect(s);updateManualState(s);}});

  ensureStandbyCard();updateStandbyUi();ensureExclusiveHelp();ensureManualState();rebuildCannedList().then(()=>updateManualState()).catch(()=>{});
})();
