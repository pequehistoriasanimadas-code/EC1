'use strict';
(function installStartupGuard0329(){
  if(window.__ec0329StartupGuardInstalled)return;
  window.__ec0329StartupGuardInstalled=true;
  const nativeAlert=typeof window.alert==='function'?window.alert.bind(window):null;
  const pronunciationMigration=/Aprendizaje de pronunciaci[oó]n actualizado|pronunciaciones encontradas|ajustes? protegidos? como manual|reglas? autom[aá]ticas? problem[aá]ticas?/i;
  function publishNonBlocking(text){
    const summary=String(text||'').replace(/\s+/g,' ').trim();
    const apply=()=>{
      const target=document.querySelector('#pronunciationLearningInfo')||document.querySelector('#ec28LearningMessage')||document.querySelector('#ec0323LearningCleanup');
      if(target)target.textContent=summary;
      window.__ec0329SuppressedPronunciationNotice=summary;
    };
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});else apply();
  }
  window.alert=function(message){
    const text=String(message??'');
    if(pronunciationMigration.test(text)){publishNonBlocking(text);return;}
    return nativeAlert?nativeAlert(message):undefined;
  };
})();
