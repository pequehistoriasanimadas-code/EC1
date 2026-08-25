'use strict';
(function installLocalModelUiFix0324(){
  if(!window.ECAPI||!window.__ec0324Installed||typeof settings==='undefined'||typeof status!=='function'||!document.querySelector('#localInfo')){setTimeout(installLocalModelUiFix0324,100);return;}
  if(window.__ecLocalModelUiFix0324)return;window.__ecLocalModelUiFix0324=true;

  const $q=s=>document.querySelector(s);
  const usesLocal=()=>[settings?.ai?.primary,settings?.ai?.backup1,settings?.ai?.backup2].filter(Boolean).includes('local');
  function setBackupVisibility(){
    const primary=settings?.ai?.primary||$q('#primary')?.value||'';
    const backupModeLabel=$q('#localBackupMode')?.closest('label');
    if(backupModeLabel)backupModeLabel.classList.toggle('hidden',primary==='local');
    const idle=$q('#localIdleRow');if(idle)idle.classList.toggle('hidden',primary==='local'||($q('#localBackupMode')?.value||'on_demand')!=='on_demand');
  }
  async function syncLocalModelUi(opts={}){
    let st=null;try{st=await window.ECAPI.localStatus();}catch{return null;}
    const progress=$q('#downloadProgress'),bar=progress?.querySelector('div'),downloadBtn=$q('#downloadModel'),info=$q('#localInfo'),optBtn=$q('#optimizeEc0321'),optBox=$q('#ecOptimizeResult0321');
    if(progress)progress.classList.toggle('hidden',!st.downloading);
    if(!st.downloading&&bar)bar.style.width='0%';
    if(downloadBtn&&!st.downloading)downloadBtn.textContent='Descargar IA local (~5 GB)';
    if(info&&!opts.keepInfo){
      if(st.model)info.textContent=st.running?'IA local instalada, verificada y activa ✓':'IA local instalada y verificada ✓ · se activará automáticamente cuando sea necesaria.';
      else if(st.downloading)info.textContent='Descargando IA local… todavía no está disponible para optimización.';
      else info.textContent='IA local no descargada o no validada. Descárgala antes de usarla u optimizar GEC.';
    }
    const needsLocal=usesLocal();
    if(optBtn&&!optBox?.dataset.live)optBtn.disabled=!!(needsLocal&&(!st.model||st.downloading));
    if(optBox&&!optBox.dataset.live&&needsLocal&&!st.model&&!opts.keepOptimizationMessage){
      optBox.innerHTML='<span class="benchmark-warn"><b>Optimización pendiente:</b> GEC no detecta todavía un modelo Qwen válido. La barra de descarga por sí sola no confirma la instalación.</span>';
    }
    const policy=$q('#localPolicyInfo');
    if(policy&&settings?.ai?.primary==='local')policy.textContent=st.model?'La IA local es el servicio principal y está instalada ✓. Se activará automáticamente cuando sea necesaria.':'⚠ La IA local está seleccionada como principal, pero el modelo Qwen todavía no está instalado o validado.';
    setBackupVisibility();return st;
  }

  const downloadBtn=$q('#downloadModel');
  if(downloadBtn?.onclick){
    const baseDownload=downloadBtn.onclick;
    downloadBtn.onclick=async function(e){
      const r=await baseDownload.call(this,e);const st=await syncLocalModelUi({keepOptimizationMessage:false});
      if(st&&!st.model&&!st.downloading){
        const info=$q('#localInfo');if(info)info.textContent='La descarga no quedó instalada como un modelo Qwen válido. Vuelve a descargarla; GEC no iniciará la optimización hasta verificar el archivo.';
        status('IA local: la descarga terminó sin un modelo Qwen válido.');
      }
      return r;
    };
  }

  window.ECAPI.on('local:event',e=>{
    const type=String(e?.type||''),progress=$q('#downloadProgress'),bar=progress?.querySelector('div'),btn=$q('#downloadModel');
    if(type==='model-download'||type==='download-progress'){
      if(progress)progress.classList.remove('hidden');const pct=Math.max(0,Math.min(100,Number(e.percent)||0));if(bar)bar.style.width=`${pct}%`;if(btn)btn.textContent=`Descargando IA local… ${Math.round(pct)}%`;
    }else if(type==='model-downloaded'){
      if(bar)bar.style.width='100%';setTimeout(()=>syncLocalModelUi(),150);
    }else if(type==='model-download-error'){
      if(bar)bar.style.width='0%';if(progress)progress.classList.add('hidden');if(btn)btn.textContent='Descargar IA local (~5 GB)';setTimeout(async()=>{await syncLocalModelUi({keepInfo:true});const info=$q('#localInfo');if(info)info.textContent=`Error al instalar la IA local: ${String(e?.message||'la descarga no pudo validarse')}`;},50);
    }
  });

  for(const id of ['primary','backup1','backup2','localBackupMode'])$q('#'+id)?.addEventListener('change',()=>setTimeout(()=>syncLocalModelUi(),0));
  syncLocalModelUi().catch(()=>{});
})();
