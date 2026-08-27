'use strict';

(function installGec0323Ui(){
  if(!window.__ec0322UiInstalled||!window.ECAPI||typeof $!=='function'){setTimeout(installGec0323Ui,120);return;}
  if(window.__ec0323UiInstalled)return;window.__ec0323UiInstalled=true;

  const style=document.createElement('style');style.textContent=`
    #ec0323LearningManager{margin-top:12px;min-width:0}#ec0323LearningControls{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:10px}#ec0323LearningSearch{flex:1 1 280px;min-width:180px}.ec0323-show-nochange{display:flex;align-items:center;gap:7px;margin:0;font-size:12px;color:#bbb}.ec0323-show-nochange input{width:auto;margin:0}#ec0323LearningList{display:flex;flex-direction:column;gap:8px;margin-top:10px;max-height:360px;overflow-y:auto;overflow-x:hidden;padding-right:4px}.ec0323-learning-row{display:grid;grid-template-columns:minmax(145px,1fr) minmax(170px,1.15fr) minmax(90px,120px) minmax(55px,70px) auto;gap:8px;align-items:center;padding:9px;border:1px solid #303030;border-radius:9px;background:#111;min-width:0}.ec0323-learning-term{font-weight:700;color:#f2f2f2;word-break:break-word}.ec0323-learning-meta{font-size:11px;color:#9c9c9c;min-width:0}.ec0323-learning-input{min-width:0;width:100%}.ec0323-learning-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.ec0323-learning-actions button{padding:7px 9px;font-size:12px;white-space:nowrap}.ec0323-tag{font-size:10px;padding:3px 6px;border:1px solid #3c3c3c;border-radius:999px;color:#bbb;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ec0323-tag.manual{color:#a9e8b4;border-color:#386842}.ec0323-clean-note{margin-top:8px;color:#b8b8b8}.ec0323-limit-note{padding:7px 0;color:#aaa;font-size:11px}@media(max-width:1250px){.ec0323-learning-row{grid-template-columns:minmax(120px,1fr) minmax(150px,1.2fr) minmax(90px,110px) auto}.ec0323-learning-uses{display:none}}@media(max-width:850px){.ec0323-learning-row{grid-template-columns:1fr}.ec0323-learning-actions{justify-content:flex-start}.ec0323-tag{width:max-content;max-width:100%}}
  `;document.head.appendChild(style);

  let learningList=[],learningSignature='',pronunciationRefreshSeq=0;
  function setTextStable(el,value){if(el&&el.textContent!==value)el.textContent=value;}
  function ensureLearningManager(){
    if($('#ec0323LearningManager'))return $('#ec0323LearningManager');
    const details=$('#pronunciationLearningCount')?.closest('details.advanced')||$('#pronunciationLearningCount')?.closest('.advanced');if(!details)return null;
    const wrap=document.createElement('div');wrap.id='ec0323LearningManager';wrap.className='subcard';wrap.innerHTML=`
      <div class="section-head"><h3>Gestionar aprendizaje</h3><span id="ec0323LearningSummary" class="mini-pill">Cargando…</span></div>
      <p class="note">GEC separa pronunciación de significado. Las correcciones manuales quedan protegidas y la IA no puede sobrescribirlas. Los términos verificados sin cambio siguen guardados, pero se ocultan para no llenar la pantalla.</p>
      <div id="ec0323LearningControls"><input id="ec0323LearningSearch" placeholder="Buscar término o pronunciación…"><label class="ec0323-show-nochange"><input id="ec0323ShowNoChange" type="checkbox"> Mostrar reglas sin cambio</label></div>
      <div id="ec0323LearningCleanup" class="note ec0323-clean-note"></div>
      <div id="ec0323LearningList"><div class="empty">Cargando aprendizaje…</div></div>`;
    details.appendChild(wrap);$('#ec0323LearningSearch').oninput=renderLearningList;$('#ec0323ShowNoChange').onchange=renderLearningList;return wrap;
  }

  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function key(v){return String(v||'').normalize('NFKC').trim().toLocaleLowerCase('es');}
  function searchKey(v){return key(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
  function ensurePronSettings(){settings.tts=settings.tts||{};if(!settings.tts.manualPronunciations||typeof settings.tts.manualPronunciations!=='object')settings.tts.manualPronunciations={};if(!Array.isArray(settings.tts.pronunciationBlockedTerms))settings.tts.pronunciationBlockedTerms=[];}
  async function persistPronunciationSettings(){ensurePronSettings();const r=await window.ECAPI.saveSettings(settings);if(settings.ai){settings.ai.hasClaudeKey=!!r.hasClaudeKey;settings.ai.hasGeminiKey=!!r.hasGeminiKey;}return r;}

  async function freshClaudeFlag(){try{const fresh=await window.ECAPI.getSettings();if(settings?.ai&&fresh?.ai)settings.ai.hasClaudeKey=!!fresh.ai.hasClaudeKey;return!!fresh?.ai?.hasClaudeKey;}catch{return!!settings?.ai?.hasClaudeKey;}}

  async function refreshPronunciation0323(){
    ensureLearningManager();const seq=++pronunciationRefreshSeq;
    try{
      const [p,hasKey]=await Promise.all([window.ECAPI.pronunciationStatus(),freshClaudeFlag()]);if(seq!==pronunciationRefreshSeq)return;
      const count=Number(p?.learningEntries||0),repl=Number(p?.replacementEntries||0),neg=Number(p?.negativeEntries||0),manual=Number(p?.manualEntries||0),toggle=$('#pronunciationClaudeVerify')?.checked!==false;
      const infoText=`Pronunciación automática activa ✓ · ${count} términos conocidos · ${repl} con ajuste · ${neg} sin cambio · local ${p?.model?'activo ✓':'no descargado'} · ${!toggle?'Claude verificador desactivado':hasKey?'Claude verificador activo ✓':'Claude verificador sin API Key'}`;
      const badgeText=`${repl} ajuste${repl===1?'':'s'} · ${neg} verificadas`,summaryText=`${repl} ajustes · ${manual} manual${manual===1?'':'es'} · ${neg} verificadas`;
      setTextStable($('#pronunciationInfo'),infoText);setTextStable($('#pronunciationLearningCount'),badgeText);setTextStable($('#ec0323LearningSummary'),summaryText);
      const migration=p?.migration0323,clean=$('#ec0323LearningCleanup');if(clean&&migration&&!window.__ec0323MigrationShown){window.__ec0323MigrationShown=true;const removed=(Number(migration.removedSemantic)||0)+(Number(migration.removedTrivial)||0);clean.textContent=removed?`Limpieza automática 0.3.23: ${removed} regla${removed===1?'':'s'} retirada${removed===1?'':'s'} (${migration.removedSemantic||0} semántica${Number(migration.removedSemantic)===1?'':'s'} · ${migration.removedTrivial||0} trivial${Number(migration.removedTrivial)===1?'':'es'}). Se conservó una copia de seguridad.`:'Base de pronunciación revisada por 0.3.23 ✓';}
      const nextList=Array.isArray(p?.learningList)?p.learningList:[],nextSignature=JSON.stringify(nextList.map(x=>[x.term,x.pronunciation,x.source,!!x.manual,!!x.needsReplacement,Number(x.uses||0)]));learningList=nextList;if(nextSignature!==learningSignature){learningSignature=nextSignature;renderLearningList();}
    }catch(e){if(seq!==pronunciationRefreshSeq)return;const box=$('#ec0323LearningList');if(box&&box.querySelector('.empty')?.textContent?.startsWith('No se pudo leer')!==true)box.innerHTML=`<div class="empty">No se pudo leer el aprendizaje: ${esc(e?.message||e)}</div>`;}
  }

  function renderLearningList(){
    const box=$('#ec0323LearningList');if(!box)return;const q=searchKey($('#ec0323LearningSearch')?.value||''),showNoChange=$('#ec0323ShowNoChange')?.checked===true;
    const filtered=learningList.filter(x=>{const hit=!q||searchKey(`${x.term||''} ${x.pronunciation||''} ${x.source||''}`).includes(q);if(!hit)return false;if(q)return true;return!!x.needsReplacement||showNoChange;});
    if(!filtered.length){const text=q?'No hay reglas que coincidan con la búsqueda.':showNoChange?'Todavía no hay pronunciaciones aprendidas.':'No hay ajustes de pronunciación que requieran atención.';if(box.children.length!==1||box.firstElementChild?.className!=='empty'||box.firstElementChild?.textContent!==text)box.innerHTML=`<div class="empty">${text}</div>`;return;}
    const shown=filtered.slice(0,150),html=shown.map((x,i)=>{const value=x.needsReplacement?x.pronunciation:'',source=x.manual?'Manual':String(x.source||'IA').replace('qwen+claude','Qwen + Claude').replace('qwen','Qwen').replace('claude','Claude'),meta=x.manual?(x.needsReplacement?'Manual · Con ajuste':'Manual · Sin cambio'):(x.needsReplacement?'Con ajuste fonético':'No requiere cambio');return`<div class="ec0323-learning-row" data-learning-i="${i}" data-term="${esc(x.term)}"><div><div class="ec0323-learning-term">${esc(x.term)}</div><div class="ec0323-learning-meta">${esc(meta)}</div></div><input class="ec0323-learning-input" value="${esc(value)}" placeholder="Sin cambio"><span class="ec0323-tag ${x.manual?'manual':''}">${esc(source)}</span><span class="ec0323-learning-meta ec0323-learning-uses">${Number(x.uses||0)} uso${Number(x.uses||0)===1?'':'s'}</span><div class="ec0323-learning-actions"><button class="ec0323-save-learning">Guardar como manual</button><button class="ec0323-delete-learning dark">Borrar</button></div></div>`;}).join('')+(filtered.length>shown.length?`<div class="ec0323-limit-note">Mostrando ${shown.length} de ${filtered.length} reglas. Usa el buscador para localizar una concreta.</div>`:'');if(box.dataset.rendered!==html){box.dataset.rendered=html;box.innerHTML=html;}
    $$('.ec0323-save-learning').forEach(btn=>btn.onclick=async e=>{const row=e.currentTarget.closest('.ec0323-learning-row'),term=row?.dataset.term||'',input=row?.querySelector('.ec0323-learning-input'),pron=String(input?.value||'').trim();if(!term)return;ensurePronSettings();settings.tts.pronunciationBlockedTerms=settings.tts.pronunciationBlockedTerms.filter(x=>key(x)!==key(term));settings.tts.manualPronunciations[term]={pronunciation:pron,needsReplacement:!!pron};try{await persistPronunciationSettings();status(`Pronunciación manual protegida: ${term}${pron?` → ${pron}`:' → sin cambio'}.`);await refreshPronunciation0323();}catch(err){status(`Pronunciación: ${humanError(err)}`);}});
    $$('.ec0323-delete-learning').forEach(btn=>btn.onclick=async e=>{const row=e.currentTarget.closest('.ec0323-learning-row'),term=row?.dataset.term||'';if(!term||!confirm(`¿Borrar la regla de pronunciación para “${term}”?`))return;ensurePronSettings();for(const k of Object.keys(settings.tts.manualPronunciations))if(key(k)===key(term))delete settings.tts.manualPronunciations[k];if(!settings.tts.pronunciationBlockedTerms.some(x=>key(x)===key(term)))settings.tts.pronunciationBlockedTerms.push(term);try{await persistPronunciationSettings();status(`Regla eliminada: ${term}.`);await refreshPronunciation0323();}catch(err){status(`Pronunciación: ${humanError(err)}`);}});
  }

  ensureLearningManager();
  const baseRefresh=typeof refreshPronunciationStatus==='function'?refreshPronunciationStatus:null;if(baseRefresh){refreshPronunciationStatus=async function(){await baseRefresh();await refreshPronunciation0323();};}
  const testClaude=$('#testClaude');if(testClaude){const observer=new MutationObserver(()=>{const txt=String($('#claudeStatus')?.textContent||'');if(/correcta|guardada/i.test(txt))refreshPronunciation0323();});const target=$('#claudeStatus');if(target)observer.observe(target,{childList:true,subtree:true,characterData:true});testClaude.addEventListener('click',()=>setTimeout(refreshPronunciation0323,1200));}
  const toggle=$('#pronunciationClaudeVerify');if(toggle)toggle.addEventListener('change',()=>setTimeout(refreshPronunciation0323,120));

  const clear=$('#clearPronunciationLearning');if(clear)clear.onclick=async()=>{if(!confirm('¿Borrar todo el aprendizaje automático y manual de pronunciación?'))return;try{await window.ECAPI.clearPronunciationLearning();ensurePronSettings();settings.tts.manualPronunciations={};settings.tts.pronunciationBlockedTerms=[];await persistPronunciationSettings();$('#pronunciationLearningInfo').textContent='Aprendizaje borrado.';status('Aprendizaje de pronunciación borrado.');await refreshPronunciation0323();}catch(e){status(`Pronunciación: ${humanError(e)}`);}};

  setTimeout(refreshPronunciation0323,300);
})();
