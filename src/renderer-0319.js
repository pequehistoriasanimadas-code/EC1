'use strict';

(function installEc0319Ui(){
  if(!window.__ec0318UiInstalled||typeof renderNews!=='function'||typeof openStory!=='function'||typeof refreshAutomation!=='function'||!document.querySelector('#newsList')){setTimeout(installEc0319Ui,100);return;}
  if(window.__ec0319UiInstalled)return;window.__ec0319UiInstalled=true;

  const style=document.createElement('style');style.textContent=`
    #newsViewer0319{margin-top:16px}.news-view-grid{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(260px,.5fr);gap:18px}.news-view-body{white-space:pre-wrap;line-height:1.55;max-height:520px;overflow:auto;padding-right:8px}.news-view-image{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:10px;background:#111}.news-view-meta{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 14px}.news-source-link{display:inline-flex;align-items:center;justify-content:center;text-decoration:none}.gpu-advanced-wrap>.subcard{margin-top:10px}.queue-stat.omitted b{color:#e5b84b}@media(max-width:900px){.news-view-grid{grid-template-columns:1fr}}
  `;document.head.appendChild(style);

  function ensureViewer(){
    let box=$('#newsViewer0319');if(box)return box;box=document.createElement('div');box.id='newsViewer0319';box.className='card hidden';box.innerHTML=`<div class="section-head"><div><h3 id="newsViewerTitle">Ver noticia</h3><p id="newsViewerSubtitle" class="note"></p></div><button id="closeNewsViewer0319" class="dark compact">Cerrar</button></div><div class="news-view-grid"><div><div id="newsViewerMeta" class="news-view-meta"></div><div id="newsViewerBody" class="news-view-body"></div></div><div><img id="newsViewerImage" class="news-view-image" alt=""><div class="buttons top-gap"><a id="newsViewerSource" class="news-source-link" target="_blank" rel="noreferrer">Abrir fuente original</a></div></div></div>`;
    $('#newsList').insertAdjacentElement('afterend',box);$('#closeNewsViewer0319').onclick=()=>box.classList.add('hidden');return box;
  }
  ensureViewer();

  renderNews=function(){
    const q=($('#search')?.value||'').toLowerCase(),ff=$('#feedFilter')?.value||'',list=$('#newsList');if(!list)return;list.innerHTML='';stories.filter(s=>(!ff||s.feedId===ff)&&(!q||`${s.title} ${s.description}`.toLowerCase().includes(q))).forEach(s=>{const el=document.createElement('div');el.className='newsItem';el.innerHTML=`<div class="thumb" style="background-image:url('${escapeHtml((s.image||'').replace(/'/g,'%27'))}')"></div><div class="meta"><h3>${escapeHtml(s.title)}</h3><p>${escapeHtml(s.feedName)} · ${escapeHtml(s.category||'Actualidad')}</p><p>${escapeHtml(s.description||'')}</p></div><button class="edit">Ver noticia</button>`;el.querySelector('.edit').onclick=()=>openStory(s);list.appendChild(el);});if(!list.children.length)list.innerHTML='<div class="empty">No hay noticias que coincidan con la búsqueda.</div>';
  };
  openStory=async function(s){
    currentStory=s;status('Cargando noticia…');let article=null;try{article=await window.ECAPI.fetchArticle(s.link);}catch{article={title:s.title,description:s.description,body:s.description,image:s.image||''};}currentArticle=article;const box=ensureViewer(),body=String(article?.body||article?.description||s.description||'').trim();$('#newsViewerTitle').textContent=article?.title||s.title||'Noticia';$('#newsViewerSubtitle').textContent=`${s.feedName||'Fuente'}${s.category?` · ${s.category}`:''}${s.pubDate?` · ${formatPubDate(s.pubDate)}`:''}`;$('#newsViewerMeta').innerHTML=`<span class="mini-pill">${escapeHtml(s.feedName||'RSS')}</span>${s.category?`<span class="mini-pill">${escapeHtml(s.category)}</span>`:''}`;$('#newsViewerBody').textContent=body||'La fuente no devolvió texto adicional. Puedes abrir la publicación original.';const img=article?.image||s.image||settings?.visual?.fallbackImageUrl||'',imgEl=$('#newsViewerImage');imgEl.src=img||'';imgEl.classList.toggle('hidden',!img);const link=$('#newsViewerSource');link.href=s.link||'#';link.classList.toggle('hidden',!s.link);box.classList.remove('hidden');box.scrollIntoView({behavior:'smooth',block:'start'});status('Noticia cargada. La generación automática se realiza desde Automático.');
  };
  renderNews();

  const baseRefreshAutomation=refreshAutomation;
  refreshAutomation=function(s){
    baseRefreshAutomation(s);const overlap=s?.processing?.pipelineOverlap,detail=$('#processingDetail');if(overlap&&detail&&s?.processing?.running){const extra=overlap.active?'Solapamiento activo: IA local prepara la siguiente nota mientras Kokoro genera voz.':`Solapamiento en modo seguro: ${overlap.reason||'secuencial'}.`;if(!detail.textContent.includes('Solapamiento'))detail.textContent=`${detail.textContent} · ${extra}`;}
    const omitted=Number(s?.counts?.omitted)||0,summary=$('#queueSummary');if(summary&&omitted){const stat=document.createElement('div');stat.className='queue-stat omitted';stat.innerHTML=`<b>${omitted}</b><span>OMITIDAS</span>`;summary.appendChild(stat);}
  };

  function wrapGpuAdvanced(){const card=$('#gpuTtsCard');if(!card||card.closest('.gpu-advanced-wrap'))return false;const details=document.createElement('details');details.className='advanced gpu-advanced-wrap';details.innerHTML='<summary>Aceleración NVIDIA de Kokoro · Opcional</summary><p class="note">CPU es la ruta preferida cuando la IA local es principal, para evitar competencia por GPU/VRAM. Esta prueba queda disponible como diagnóstico avanzado.</p>';card.parentNode.insertBefore(details,card);details.appendChild(card);const note=card.querySelector('p.note');if(note)note.textContent='Compara CPU y NVIDIA de forma opcional. Con IA local como principal, EC conserva CPU para Kokoro y reserva la GPU para Qwen/Vulkan.';return true;}
  if(!wrapGpuAdvanced()){let tries=0;const t=setInterval(()=>{if(wrapGpuAdvanced()||++tries>80)clearInterval(t);},150);}

  const optimize=$('#optimizeTts');if(optimize)optimize.onclick=async()=>{
    const btn=optimize,box=$('#ttsBenchmarkResult');btn.disabled=true;box.textContent='Probando Kokoro con texto corto, medio y largo. Cada configuración hace warm-up y tres mediciones reales; puede tardar varios minutos…';status('Buscando una configuración estable de Kokoro para producción…');
    try{
      const voice=$('#voice')?.value;if(voice)settings.tts.voice=voice;settings.tts.speed=Math.max(.7,Math.min(1.4,Number($('#voiceSpeed')?.value)||1));settings.tts.persistent=true;settings.tts.persistentIdleMinutes=5;await window.ECAPI.saveSettings(settings);const r=await window.ECAPI.benchmarkTts();if(!r?.ok)throw new Error(r?.error||'No se pudo completar la prueba de Kokoro');settings=await window.ECAPI.getSettings();$('#ttsPerformanceProfile').value='performance';const rows=(r.results||[]).map((x,i)=>x.error?`<div style="margin-top:6px"><b>${i+1}. ${escapeHtml(x.label||x.id||'Configuración')}</b> · DESCARTADA · ${escapeHtml(x.error)}</div>`:`<div style="margin-top:6px"><b>${i+1}. ${escapeHtml(x.label||x.id||'Configuración')}</b> · mediana RTF ${Number(x.medianRealtimeFactor||x.realtimeFactor||0).toFixed(2)}× · peor ${Number(x.worstRealtimeFactor||x.realtimeFactor||0).toFixed(2)}× · CPU ${Number(x.cpuAverage||0).toFixed(0)}%</div>`).join('');box.innerHTML=`<div><b>Optimización de producción completada ✓</b></div><div><b>Recomendada:</b> ${escapeHtml(r.recommendedLabel||'Rápido')} · mediana RTF ${Number(r.bestRealtimeFactor||0).toFixed(2)}× · peor caso ${Number(r.worstRealtimeFactor||0).toFixed(2)}×</div>${rows}`;$('#ttsPerformanceHint').textContent=`Configuración activa: ${r.recommendedLabel||'Rápido'} · validada con corto/medio/largo.`;status(`Kokoro optimizado · mediana RTF ${Number(r.bestRealtimeFactor||0).toFixed(2)}× · peor ${Number(r.worstRealtimeFactor||0).toFixed(2)}×.`);await refreshRuntimeStatus();
    }catch(e){box.textContent=`No se pudo completar la optimización: ${humanError(e)}`;status(`Voz: ${humanError(e)}`);}finally{btn.disabled=false;}
  };
})();
