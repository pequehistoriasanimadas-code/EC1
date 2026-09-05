'use strict';
(function installRenderer0332(){
  if(window.__ec0332RendererInstalled)return;
  if(!window.ECAPI||typeof settings==='undefined'||!settings||typeof renderQueue!=='function'||!window.__ec0331RendererInstalled){setTimeout(installRenderer0332,80);return;}
  window.__ec0332RendererInstalled=true;
  window.__ecQueueRenderOwner='0332';

  const q=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  let latest=null,raf=0,rendering=false;

  function rowKind(row){return row?.sourceType==='content'?'content':row?.sourceType==='ad'?'ad':'news';}
  function rowTypeLabel(row){const k=rowKind(row);return k==='content'?'CONTENIDO':k==='ad'?'ANUNCIO':'NOTICIA';}
  function typeColor(row){const colors=settings?.visual?.queueColors||{};const k=rowKind(row);if(k==='content')return colors.content||'#D97706';if(k==='ad')return colors.ad||'#7C3AED';if(String(row?.status||'').toUpperCase()==='ERROR')return colors.error||'#B91C1C';if(row?.isExclusive)return colors.exclusive||'#D4A514';return row?.sourceType==='generated'?(colors.generated||'#2563EB'):(colors.rss||'#2E7D32');}
  function statusClass(row){const s=String(row?.exclusiveBlocked?'ESPERA':row?.status||'').toUpperCase();if(s==='AL AIRE')return'air';if(s==='LISTA')return'ready';if(s==='PROCESANDO'||s==='PENDIENTE'||s==='ESPERA')return'processing';if(s==='ERROR')return'error';if(s==='PROGRAMADO')return'planned';if(s==='EMITIDA'||s==='OMITIDA')return'emitted';return'planned';}
  function statusText(row){return row?.exclusiveBlocked?'ESPERA':String(row?.status||'').toUpperCase()||'LISTA';}
  function seconds(v){const n=Number(v);return Number.isFinite(n)&&n>=0?`${n.toFixed(n<10?1:0)} s`:'';}
  function metaText(row){
    if(row?.planned)return String(row.planText||'Programado');
    const parts=[];if(row?.feedName)parts.push(String(row.feedName));if(row?.category)parts.push(String(row.category));
    const m=row?.metrics||{},timings=[];
    const text=seconds(m.textElapsedSec??(Number(m.textElapsedMs)>=0?Number(m.textElapsedMs)/1000:NaN));if(text)timings.push(`Texto ${text}`);
    const pron=seconds(m.pronunciationElapsedSec??(Number(m.pronunciationElapsedMs)>=0?Number(m.pronunciationElapsedMs)/1000:NaN));if(pron)timings.push(`Pronunciación ${pron}`);
    const voice=seconds(m.voiceElapsedSec??(Number(m.ttsElapsedMs)>=0?Number(m.ttsElapsedMs)/1000:NaN));if(voice)timings.push(`Voz ${voice}`);
    const audio=seconds(row?.audioDurationSec??m.audioDurationSec??row?.result?.durationSec);if(audio)timings.push(`Audio ${audio}`);
    if(timings.length)parts.push(timings.join(' · '));if(row?.error)parts.push(String(row.error));return parts.join(' · ');
  }
  function technicalHtml(row){const bits=[];if(row?.provider)bits.push(`Proveedor: ${esc(row.provider)}`);if(row?.model)bits.push(`Modelo: ${esc(row.model)}`);if(row?.stage)bits.push(`Etapa: ${esc(row.stage)}`);if(row?.storyUrl)bits.push(`URL: ${esc(row.storyUrl)}`);if(!bits.length)return'';return`<details class="technical-details"><summary>Ver detalles técnicos</summary><div>${bits.join(' · ')}</div></details>`;}
  function keyFor(row,i){if(row?.id)return String(row.id);if(row?.renderKey)return String(row.renderKey);if(row?.planKey)return `plan-${row.sourceType}-${row.planKey}`;return`${row?.sourceType||'row'}-${row?.displayPosition||i}-${row?.title||''}`;}
  function signature(row,index){
    const m=row?.metrics||{};
    return JSON.stringify([row?.displayPosition,index,row?.title,row?.status,row?.sourceType,!!row?.isExclusive,!!row?.exclusiveBlocked,row?.planText,row?.feedName,row?.category,row?.error,row?.stage,row?.provider,row?.model,m.textElapsedMs,m.pronunciationElapsedMs,m.ttsElapsedMs,m.audioDurationSec,typeColor(row)]);
  }
  function updateCard(node,row,index,key){
    const sig=signature(row,index);if(node.dataset.ecSignature===sig)return;
    const detailsOpen=!!node.querySelector('details[open]'),preparing=row.queueGroup==='preparing',history=!!row.history,display=Number(row.displayPosition)>0?`${Number(row.displayPosition)}.`:'',meta=metaText(row),exclusive=!!row.isExclusive,planned=!!row.planned;
    node.className=['queue-item',planned?'planned':'',history?'history':'',row.exclusiveBlocked?'ec0331-exclusive-blocked':''].filter(Boolean).join(' ');
    node.dataset.ecQueueId=key;node.dataset.sourceType=rowKind(row);node.style.setProperty('--type-color',typeColor(row));
    node.innerHTML=`<div class="queue-main"><div class="queue-index">${esc(display)}</div><div class="queue-text"><div class="queue-headline"><span class="queue-type">${rowTypeLabel(row)}</span>${exclusive?'<span class="queue-exclusive">EXCLUSIVO</span>':''}<span class="queue-title">${esc(row.title||'Sin título')}</span></div>${meta?`<div class="queue-meta">${esc(meta)}</div>`:''}${row.exclusiveBlocked?`<div class="ec0331-wait-note">${esc(row.planText||'En espera de la separación mínima entre exclusivas.')}</div>`:''}${technicalHtml(row)}</div><span class="queue-badge ${statusClass(row)}">${esc(statusText(row))}</span></div>`;
    if(detailsOpen)node.querySelector('details')?.setAttribute('open','');
    node.dataset.ecSignature=sig;
  }
  function renderStable(snapshot){
    const box=q('#queue');if(!box||!snapshot)return;const rows=(snapshot.queue||[]).filter(Boolean),scroll=box.scrollTop;
    if(!rows.length){if(box.dataset.ecEmpty!=='1'){box.replaceChildren(Object.assign(document.createElement('div'),{className:'empty',textContent:'Sin actividad'}));box.dataset.ecEmpty='1';}return;}
    box.dataset.ecEmpty='0';rendering=true;
    try{
      const existing=new Map([...box.querySelectorAll(':scope > .queue-item')].map(n=>[n.dataset.ecQueueId,n]).filter(x=>x[0]));
      const wanted=new Set(),ordered=[];let dividerNeeded=false,divider=box.querySelector(':scope > .ec0332-preparing-divider');
      rows.forEach((row,i)=>{
        if(row.queueGroup==='preparing'&&!dividerNeeded){dividerNeeded=true;if(!divider){divider=document.createElement('div');divider.className='ec0330-preparing-divider ec0332-preparing-divider';divider.innerHTML='<strong>En preparación</strong><span>Estas noticias todavía no tienen una posición definitiva de emisión.</span>';}}
        const key=keyFor(row,i);wanted.add(key);let node=existing.get(key);if(!node){node=document.createElement('div');node.className='queue-item';}
        updateCard(node,row,i,key);
        if(row.queueGroup==='preparing'&&dividerNeeded&&ordered.at(-1)!==divider&& !ordered.includes(divider))ordered.push(divider);
        ordered.push(node);
      });
      for(const [key,node] of existing)if(!wanted.has(key))node.remove();
      if(!dividerNeeded&&divider)divider.remove();
      let cursor=box.firstChild;
      for(const node of ordered){if(node!==cursor)box.insertBefore(node,cursor);cursor=node.nextSibling;}
      const allowed=new Set(ordered);[...box.children].forEach(n=>{if(!allowed.has(n))n.remove();});
      box.scrollTop=Math.min(scroll,Math.max(0,box.scrollHeight-box.clientHeight));
      window.__ec0332QueueAudit={rows:rows.length,rendered:box.querySelectorAll(':scope > .queue-item').length,planned:box.querySelectorAll(':scope > .queue-item.planned').length,exclusive:box.querySelectorAll('.queue-exclusive').length,positions:[...box.querySelectorAll(':scope > .queue-item .queue-index')].map(x=>x.textContent.trim()).filter(Boolean),owner:window.__ecQueueRenderOwner};
    }finally{rendering=false;}
  }
  function schedule(snapshot){latest=snapshot||latest;if(!latest||raf)return;raf=requestAnimationFrame(()=>{raf=0;renderStable(latest);});}

  renderQueue=function(snapshot){schedule(snapshot);};
  const refreshBase=typeof refreshAutomation==='function'?refreshAutomation:null;
  if(refreshBase)refreshAutomation=function(s){const r=refreshBase(s);schedule(s);return r;};

  window.ECAPI.on('automation:state',s=>schedule(s));
  window.ECAPI.automationStatus?.().then(s=>schedule(s)).catch(()=>{});
})();
