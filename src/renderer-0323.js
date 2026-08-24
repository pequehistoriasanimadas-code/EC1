'use strict';

(function installGec0323Ui(){
  if(!window.__ec0322UiInstalled||!window.ECAPI||typeof $!=='function'){setTimeout(installGec0323Ui,120);return;}
  if(window.__ec0323UiInstalled)return;window.__ec0323UiInstalled=true;

  const style=document.createElement('style');style.textContent=`
    #ec0323LearningManager{margin-top:12px}#ec0323LearningList{display:flex;flex-direction:column;gap:8px;margin-top:10px;max-height:360px;overflow:auto;padding-right:4px}.ec0323-learning-row{display:grid;grid-template-columns:minmax(130px,1fr) minmax(180px,1.2fr) 120px 70px auto;gap:8px;align-items:center;padding:9px;border:1px solid #303030;border-radius:9px;background:#111}.ec0323-learning-term{font-weight:700;color:#f2f2f2;word-break:break-word}.ec0323-learning-meta{font-size:11px;color:#9c9c9c}.ec0323-learning-input{min-width:0}.ec0323-learning-actions{display:flex;gap:6px}.ec0323-learning-actions button{padding:7px 9px;font-size:12px}.ec0323-tag{font-size:10px;padding:3px 6px;border:1px solid #3c3c3c;border-radius:999px;color:#bbb;white-space:nowrap}.ec0323-tag.manual{color:#a9e8b4;border-color:#386842}.ec0323-clean-note{margin-top:8px;color:#b8b8b8}@media(max-width:1250px){.ec0323-learning-row{grid-template-columns:1fr 1.2fr 100px auto}.ec0323-learning-uses{display:none}}
  `;document.head.appendChild(style);

  function ensureLearningManager(){
    if($('#ec0323LearningManager'))return $('#ec0323LearningManager');
    const details=$('#pronunciationLearningCount')?.closest('details.advanced')||$('#pronunciationLearningCount')?.closest('.advanced');if(!details)return null;
    const wrap=document.createElement('div');wrap.id='ec0323LearningManager';wrap.className='subcard';wrap.innerHTML=`
      <div class="section-head"><h3>Gestionar aprendizaje</h3><span id="ec0323LearningSummary" class="mini-pill">Cargando…</span></div>
      <p class="note">GEC separa pronunciación de significado. Las correcciones manuales quedan protegidas y la IA no puede sobrescribirlas.</p>
      <div id="ec0323LearningCleanup" class="note ec0323-clean-note"></div>
      <div id="ec0323LearningList"><div class="empty">Cargando aprendizaje…</div></div>`;
    details.appendChild(wrap);return wrap;
  }

  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function key(v){return String(v||'').normalize('NFKC').trim().toLocaleLowerCase('es');}
  function ensurePronSettings(){settings.tts=settings.tts||{};if(!settings.tts.manualPronunciations||typeof settings.tts.manualPronunciations!=='object')settings.tts.manualPronunciations={};if(!Array.isArray(settings.tts.pronunciationBlockedTerms))settings.tts.pronunciationBlockedTerms=[];}
  async function persistPronunciationSettings(){ensurePronSettings();const r=await window.ECAPI.saveSettings(settings);if(settings.ai){settings.ai.hasClaudeKey=!!r.hasClaudeKey;settings.ai.hasGeminiKey=!!r.hasGeminiKey;}return r;}

  async function freshClaudeFlag(){
    try{const fresh=await window.ECAPI.getSettings();if(settings?.ai&&fresh?.ai)settings.ai.hasClaudeKey=!!fresh.ai.hasClaudeKey;return!!fresh?.ai?.hasClaudeKey;}catch{return!!settings?.ai?.hasClaudeKey;}
  }

  async function refreshPronunciation0323(){
    ensureLearningManager();
    try{
      const [p,hasKey]=await Promise.all([window.ECAPI.pronunciationStatus(),freshClaudeFlag()]),count=Number(p?.learningEntries||0),repl=Number(p?.replacementEntries||0),neg=Number(p?.negativeEntries||0),manual=Number(p?.manualEntries||0),toggle=$('#pronunciationClaudeVerify')?.checked!==false;
      const info=$('#pronunciationInfo');if(info)info.textContent=`Pronunciación automática activa ✓ · ${count} términos conocidos · ${repl} con ajuste · ${neg} sin cambio · local ${p?.model?'activo ✓':'no descargado'} · ${!toggle?'Claude verificador desactivado':hasKey?'Claude verificador activo ✓':'Claude verificador sin API Key'}`;
      const badge=$('#pronunciationLearningCount');if(badge)badge.textContent=`${repl} pronunciación${repl===1?'':'es'}`;
      const sum=$('#ec0323LearningSummary');if(sum)sum.textContent=`${repl} ajustes · ${manual} manual${manual===1?'':'es'}`;
      const migration=p?.migration0323,clean=$('#ec0323LearningCleanup');if(clean&&migration&&!window.__ec0323MigrationShown){window.__ec0323MigrationShown=true;const removed=(Number(migration.removedSemantic)||0)+(Number(migration.removedTrivial)||0);clean.textContent=removed?`Limpieza automática 0.3.23: ${removed} regla${removed===1?'':'s'} retirada${removed===1?'':'s'} (${migration.removedSemantic||0} semántica${Number(migration.removedSemantic)===1?'':'s'} · ${migration.removedTrivial||0} trivial${Number(migration.removedTrivial)===1?'':'es'}). Se conservó una copia de seguridad.`:'Base de pronunciación revisada por 0.3.23 ✓';}
      renderLearningList(p?.learningList||[]);
    }catch(e){const box=$('#ec0323LearningList');if(box)box.innerHTML=`<div class="empty">No se pudo leer el aprendizaje: ${esc(e?.message||e)}</div>`;}
  }

  function renderLearningList(list){
    const box=$('#ec0323LearningList');if(!box)return;if(!list.length){box.innerHTML='<div class="empty">Todavía no hay pronunciaciones aprendidas.</div>';return;}
    box.innerHTML=list.map((x,i)=>{const value=x.needsReplacement?x.pronunciation:'',source=x.manual?'Manual':String(x.source||'IA').replace('qwen+claude','Qwen + Claude').replace('qwen','Qwen').replace('claude','Claude');return`<div class="ec0323-learning-row" data-learning-i="${i}" data-term="${esc(x.term)}"><div><div class="ec0323-learning-term">${esc(x.term)}</div><div class="ec0323-learning-meta">${x.needsReplacement?'Con ajuste fonético':'No requiere cambio'}</div></div><input class="ec0323-learning-input" value="${esc(value)}" placeholder="Sin cambio"><span class="ec0323-tag ${x.manual?'manual':''}">${esc(source)}</span><span class="ec0323-learning-meta ec0323-learning-uses">${Number(x.uses||0)} uso${Number(x.uses||0)===1?'':'s'}</span><div class="ec0323-learning-actions"><button class="ec0323-save-learning">Guardar</button><button class="ec0323-delete-learning dark">Borrar</button></div></div>`;}).join('');
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
