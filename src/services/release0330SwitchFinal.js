'use strict';

const {ipcMain,BrowserWindow}=require('electron');
const profilePolicy=require('./profilePolicy0329');
const release=require('./release0330');

const wait=ms=>new Promise(r=>setTimeout(r,ms));
let switching=null;

function manager(){
  return global.__ec0329ProfileManager||profilePolicy.manager?.()||null;
}

function outputWindows(){
  return BrowserWindow.getAllWindows().filter(w=>
    !w.isDestroyed()&&(
      /OUTPUT/i.test(w.getTitle?.()||'')||
      /output\.html/i.test(w.webContents?.getURL?.()||'')
    )
  );
}

function controlWindow(){
  return BrowserWindow.getAllWindows().find(w=>
    !w.isDestroyed()&&!/OUTPUT/i.test(w.getTitle?.()||'')
  )||null;
}

function discardPendingDocuments(engine){
  if(!engine)return;
  try{engine.__ec0329DiscardSessionDocuments?.();}catch{}
  for(const item of [...(engine.queue||[])]){
    if(item?.sourceType!=='generated'||item.status!=='PENDIENTE')continue;
    try{engine.removeItem?.(item);}
    catch{engine.queue=engine.queue.filter(x=>x!==item);}
  }
}

function activeWork(engine){
  if(!engine)return[];
  const out=[];
  if(engine.inFlight?.size)out.push(`${engine.inFlight.size} noticia(s) IA/TTS`);
  if(engine.documentWorkerRunning)out.push('Generador de Notas');
  if(engine.aiStageBusy)out.push('IA local');
  if(engine.voiceStageBusy)out.push('voz');
  if(engine.localHeavyRunning)out.push('proceso local pesado');
  if(engine.providers?.localRuntime?.generationActive)out.push('Qwen activo');
  if(engine.currentKind&&engine.currentKind!=='none')out.push('reproducción actual');
  return[...new Set(out)];
}

async function quiet(engine,timeout){
  const end=Date.now()+timeout;
  while(Date.now()<end){
    if(!activeWork(engine).length)return true;
    await wait(100);
  }
  return !activeWork(engine).length;
}

async function hardStop(engine){
  try{engine?.providers?.cancelActiveRequests?.('cambio de perfil');}catch{}
  try{
    engine.processingRunning=false;
    engine.processingPaused=false;
    engine.emissionRunning=false;
    engine.emissionPaused=false;
    engine.processingEpoch=(Number(engine.processingEpoch)||0)+1;
    engine.emissionEpoch=(Number(engine.emissionEpoch)||0)+1;
  }catch{}
  try{engine?.finishPlayback?.('profile-switch-force');}catch{}
  try{
    await Promise.race([
      Promise.resolve(engine?.kokoro?.stopAndWait?.('profile-switch-force')),
      wait(1800)
    ]);
  }catch{}
  try{engine?.pronunciation?.stop?.('profile-switch-force');}catch{}
  try{engine?.providers?.localRuntime?.stop?.('profile-switch-force');}catch{}
}

async function switchProfile(id){
  if(switching){
    const e=new Error('Ya hay un cambio de perfil en curso');
    e.code='PROFILE_SWITCH_BUSY';
    throw e;
  }

  const task=(async()=>{
    const m=manager();
    if(!m)throw new Error('Gestor de perfiles no disponible');
    if(id===m.activeId())return{ok:true,unchanged:true,profile:m.active()};
    if(!m.list().some(x=>x.id===id))throw new Error('Perfil no encontrado');

    const engine=global.__ec0329AutomationRef||global.__ec0328AutomationRef;
    let hardUsed=false;
    if(engine)engine.__ec0329Switching=true;

    try{
      try{engine?.stopEmission?.();}catch{}
      try{engine?.stopProcessing?.();}catch{}
      for(const w of outputWindows()){
        try{w.close();}catch{}
      }

      // Los documentos que todavía no comenzaron no deben impedir que el
      // pipeline alcance quiescencia durante el cambio de perfil.
      discardPendingDocuments(engine);

      let done=await quiet(engine,2500);
      if(!done){
        hardUsed=true;
        await hardStop(engine);
        done=await quiet(engine,5500);
      }

      if(!done){
        const e=new Error(
          `Todavía no se pudo detener: ${activeWork(engine).join(', ')||'un proceso activo'}. `+
          'Reinicia GEC para cambiar de perfil de forma segura.'
        );
        e.code='PROFILE_SWITCH_RESTART_REQUIRED';
        throw e;
      }

      // Los tails solo se reconstruyen después de confirmar quiescencia.
      if(engine){
        release.resetPipeline(engine);
        profilePolicy.resetEngineSession(engine);
      }

      m.activate(id);

      if(engine){
        profilePolicy.resetEngineSession(engine);
        release.resetPipeline(engine);
        try{
          if(engine.canned)engine.canned.__ec0329Role='content';
          if(engine.ads)engine.ads.__ec0329Role='ad';
        }catch{}
      }

      try{controlWindow()?.webContents.send('profile:changed',m.status());}catch{}
      return{ok:true,profile:m.active(),forced:hardUsed};
    }finally{
      if(engine)engine.__ec0329Switching=false;
    }
  })();

  switching=task;
  try{return await task;}
  finally{if(switching===task)switching=null;}
}

function installRelease0330SwitchFinal(){
  try{ipcMain.removeHandler('profiles:switch');}catch{}
  ipcMain.handle('profiles:switch',(_,p={})=>switchProfile(String(p.id||'')));
}

module.exports={
  installRelease0330SwitchFinal,
  switchProfile,
  discardPendingDocuments,
  activeWork,
  quiet
};
