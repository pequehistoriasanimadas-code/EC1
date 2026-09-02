'use strict';
(function installPronunciationNotice0329(){
  if(window.__ec0329PronunciationNoticeInstalled)return;
  if(!window.ECAPI){setTimeout(installPronunciationNotice0329,120);return;}
  window.__ec0329PronunciationNoticeInstalled=true;
  const render=async()=>{
    let p;try{p=await window.ECAPI.pronunciationStatus?.();}catch{return;}
    const r=p?.migrationInfo;if(!r)return;
    const parts=[
      'Aprendizaje de pronunciación actualizado.',
      `${Number(r.found)||0} pronunciaciones encontradas.`,
      `${Number(r.manualProtected)||0} ajustes protegidos como manuales.`,
      `${Number(r.removed)||0} reglas automáticas problemáticas retiradas del aprendizaje activo.`
    ];
    if(r.backup)parts.push('Se creó una copia de seguridad antes de la migración.');
    if(r.error)parts.push(`Aviso: ${r.error}`);
    const text=parts.join(' ');
    window.__ec0329PronunciationMigrationInfo=text;
    const target=document.querySelector('#pronunciationLearningInfo')||document.querySelector('#ec28LearningMessage')||document.querySelector('#ec0323LearningCleanup');
    if(target)target.textContent=text;
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(render,0),{once:true});else setTimeout(render,0);
})();
