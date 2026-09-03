'use strict';
(function installRenderer0331(){
  if(window.__ec0331RendererInstalled)return;
  if(!window.ECAPI||typeof settings==='undefined'||!settings||typeof renderQueue!=='function'){setTimeout(installRenderer0331,120);return;}
  window.__ec0331RendererInstalled=true;
  const q=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const qAll=s=>[...document.querySelectorAll(s)];
  const norm=s=>String(s??'').normalize('NFKC').replace(/\s+/g,' ').trim().toLocaleLowerCase('es');
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
    box.innerHTML='';for(const x of r.files){const item=document.createElement('div');item.className='media-item ec0331-media-item';item.innerHTML=`<div class="ec0331-media-copy"><div class="media-name">${esc(x.name)}</div><div class="media-meta">${Number(x.sizeMB||0).toFixed(1)} MB${Number(x.durationSec)>0?` · ${Math.round(Number(x.durationSec))} s`:''}</div></div><button class="dark compact ec0331-program-content">Programar como próximo</button>`;item.querySelector('button').onclick=async()=>{try{const st=await window.ECAPI.cannedScheduleSpecific(x.path);lastSnapshot=st;updateManualState(st);status(`Programado como próximo: ${x.name}`);}catch(e){status(`No se pudo programar el contenido: ${e.message||e}`);}};box.appendChild(item);}
  }
  function ensureManualState(){const list=q('#cannedList');if(!list||q('#ec0331ManualState'))return;const box=document.createElement('div');box.id='ec0331ManualState';box.className='ec0331-manual-state hidden';box.innerHTML='<div><b>SELECCIÓN MANUAL</b><span id="ec0331ManualName"></span></div><button id="ec0331CancelManual" class="dark compact">Cancelar selección</button>';list.insertAdjacentElement('beforebegin',box);q('#ec0331CancelManual').onclick=async()=>{try{const st=await window.ECAPI.cannedCancelSpecific();lastSnapshot=st;updateManualState(st);status('Selección manual cancelada.');}catch(e){status(`No se pudo cancelar: ${e.message||e}`);}};}
  function updateManualState(st=lastSnapshot){ensureManualState();const box=q('#ec0331ManualState'),name=q('#ec0331ManualName'),manual=st?.manualContent;if(!box)return;box.classList.toggle('hidden',!manual);if(name)name.textContent=manual?`Próximo: ${manual.name}`:'';qAll('.ec0331-program-content').forEach(b=>{b.textContent='Programar como próximo';b.disabled=false;});if(manual){qAll('.ec0331-media-item').forEach(item=>{if(item.querySelector('.media-name')?.textContent===manual.name){const b=item.querySelector('.ec0331-program-content');if(b){b.textContent='PROGRAMADO';b.disabled=true;}}});}}

  function rowKind(row){return row?.sourceType==='content'?'content':row?.sourceType==='ad'?'ad':'news';}
  function cardKind(card){const t=(card?.textContent||'').toUpperCase();if(t.includes('CONTENIDO'))return'content';if(t.includes('ANUNCIO'))return'ad';return'news';}
  function cardTitle(card){const el=card.querySelector('.queue-title')||card.querySelector('.queue-headline');if(!el)return'';const clone=el.cloneNode(true);clone.querySelectorAll('.queue-exclusive').forEach(x=>x.remove());return norm(clone.textContent||'');}
  function matchCards(snapshot){
    const rows=(snapshot?.queue||[]).filter(Boolean),cards=qAll('#queue .queue-item'),used=new Set(),pairs=[];
    for(const card of cards){
      let row=null;const saved=String(card.dataset.ecQueueId||'');if(saved)row=rows.find(x=>String(x.id||'')===saved&&!used.has(x));
      const title=cardTitle(card),kind=cardKind(card);
      if(!row&&title)row=rows.find(x=>!used.has(x)&&rowKind(x)===kind&&norm(x.title)===title);
      if(!row&&title)row=rows.find(x=>!used.has(x)&&rowKind(x)===kind&&(norm(x.title).startsWith(title)||title.startsWith(norm(x.title))));
      if(!row)row=rows.find(x=>!used.has(x)&&rowKind(x)===kind);
      if(!row)continue;used.add(row);card.dataset.ecQueueId=String(row.id||row.renderKey||'');pairs.push({card,row});
    }
    return pairs;
  }
  function restoreStatus(card,row){
    const state=card.querySelector('.queue-status,.status-pill');if(!state)return;
    const value=String(row.status||'').toUpperCase();state.classList.remove('ok','live','pause','neutral');
    if(row.exclusiveBlocked){state.textContent='ESPERA';state.classList.add('neutral');return;}
    if(value)state.textContent=value;if(value==='AL AIRE')state.classList.add('live');else if(value==='LISTA')state.classList.add('ok');else state.classList.add('neutral');
  }
  function reconcileQueue(snapshot){
    const box=q('#queue');if(!box)return;const pairs=matchCards(snapshot);if(!pairs.length)return;
    qAll('#queue .queue-exclusive').forEach(x=>x.remove());qAll('#queue .ec0331-wait-note').forEach(x=>x.remove());qAll('#queue .ec0330-preparing-divider').forEach(x=>x.remove());
    let pos=0,firstPreparing=null;
    for(const {card,row} of pairs){
      const preparing=row.queueGroup==='preparing';const index=card.querySelector('.queue-index');if(index)index.textContent=preparing?'':`${++pos}.`;if(preparing&&!firstPreparing)firstPreparing=card;
      card.classList.toggle('ec0331-exclusive-blocked',!!row.exclusiveBlocked);
      if(row.isExclusive){const head=card.querySelector('.queue-headline')||card.querySelector('.queue-title');if(head){const badge=document.createElement('span');badge.className='queue-exclusive';badge.textContent='EXCLUSIVO';const title=head.querySelector?.('.queue-title');if(title&&title!==head)head.insertBefore(badge,title);else head.insertAdjacentElement('afterbegin',badge);}}
      if(row.exclusiveBlocked){const note=document.createElement('div');note.className='ec0331-wait-note';note.textContent=row.planText||'En espera de la separación mínima entre exclusivas.';card.appendChild(note);}restoreStatus(card,row);
    }
    if(firstPreparing){const divider=document.createElement('div');divider.className='ec0330-preparing-divider';divider.innerHTML='<strong>En preparación</strong><span>Estas noticias todavía no tienen una posición definitiva de emisión.</span>';box.insertBefore(divider,firstPreparing);}
  }

  const oldRefresh=typeof refreshCannedList==='function'?refreshCannedList:null;if(oldRefresh){refreshCannedList=async function(){const r=await oldRefresh.apply(this,arguments);ensureManualState();await rebuildCannedList();updateManualState();return r;};}
  const baseRender=renderQueue;renderQueue=function(snapshot){lastSnapshot=snapshot;baseRender(snapshot);reconcileQueue(snapshot);setTimeout(()=>reconcileQueue(snapshot),0);setTimeout(()=>reconcileQueue(snapshot),40);updateManualState(snapshot);};
  window.ECAPI.on('automation:state',s=>{lastSnapshot=s;setTimeout(()=>updateManualState(s),0);});

  ensureStandbyCard();updateStandbyUi();ensureExclusiveHelp();ensureManualState();rebuildCannedList().then(()=>updateManualState()).catch(()=>{});
})();
