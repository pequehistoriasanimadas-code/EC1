'use strict';
(function installLanOutputUi(){
  if(!window.ECAPI||!document.querySelector('#tab-auto')||!document.querySelector('#tab-emission')){setTimeout(installLanOutputUi,120);return;}
  if(window.__ecLanOutputUiInstalled)return;window.__ecLanOutputUiInstalled=true;
  const q=s=>document.querySelector(s);let lanState=null,ndiState=null,lastMonitorUrl='',lastFormat='16:9',pollTimer=null,monitorReady=false,monitorAttemptAt=0,monitorRecoveryAt=0;

  function injectMonitor(){
    const grid=q('#tab-auto .auto-cols'),queue=grid?.querySelector('.queue-card');if(!grid||!queue||q('#ecLanMonitorCard'))return;
    let right=q('#ecAutoRightColumn');if(!right){right=document.createElement('div');right.id='ecAutoRightColumn';right.className='ec-auto-right-column';queue.replaceWith(right);right.appendChild(queue);}
    const card=document.createElement('div');card.id='ecLanMonitorCard';card.className='card ec-lan-monitor-card';card.innerHTML=`
      <div class="section-head"><div><h3>Monitor de emisión</h3><p class="note">Refleja la misma señal del Output. El audio del monitor inicia apagado y se activa dentro del visor.</p></div><span id="ecMonitorState" class="status-pill neutral">STANDBY</span></div>
      <div id="ecMonitorFrameHost" class="ec-monitor-frame-host format-16-9"><div id="ecMonitorEmpty" class="ec-monitor-empty">Iniciando monitor…</div></div>
      <div class="ec-monitor-footer"><span id="ecMonitorLanHint">Monitor local · no controla la cola</span><span id="ecMonitorClients">LAN: 0 conexiones</span></div>`;
    right.insertBefore(card,queue);
    const left=q('#tab-auto .auto-cols > div:first-child'),emission=[...(left?.querySelectorAll('.card')||[])].find(x=>/Emisión automática|Control de emisión/i.test(x.textContent||''));const note=emission?.querySelector('p.note');if(note)note.textContent='El Output maestro se abre automáticamente al iniciar la emisión. Ocultar la ventana Output no detiene el monitor ni la salida LAN.';
  }

  function ensureMonitorFrame(){
    let frame=q('#ecMonitorFrame');if(frame)return frame;
    const host=q('#ecMonitorFrameHost'),empty=q('#ecMonitorEmpty');if(!host)return null;
    frame=document.createElement('iframe');frame.id='ecMonitorFrame';frame.title='Monitor de emisión';frame.setAttribute('allow','autoplay');frame.setAttribute('referrerpolicy','no-referrer');
    host.insertBefore(frame,empty||null);
    return frame;
  }

  function injectLanSettings(){
    const left=q('#tab-emission .cols > div:first-child');if(!left||q('#ecLanOutputCard'))return;
    const card=document.createElement('div');card.id='ecLanOutputCard';card.className='card top-gap ec-lan-output-card';card.innerHTML=`
      <div class="section-head"><div><h3>Output por red local</h3><p class="note">Envía la misma imagen y audio a otra computadora de la red. En OBS agrega una Fuente de navegador con este único enlace.</p></div><span id="ecLanState" class="status-pill neutral">LOCAL</span></div>
      <label class="switch-row"><span><b>Activar Output LAN</b><small>Al activarlo Windows puede solicitar permiso para redes privadas.</small></span><input id="ecLanEnabled" type="checkbox"><span class="switch-ui"></span></label>
      <div class="form-grid two"><label>Puerto<input id="ecLanPort" type="number" min="1024" max="65535" value="8787"></label><label>Conexiones OBS / navegador<input id="ecLanClientsField" type="text" value="0" readonly></label></div>
      <label>Enlace para la otra computadora</label><div class="ec-lan-url-row"><input id="ecLanUrl" type="text" readonly placeholder="Activa Output LAN para obtener el enlace"><button id="ecLanCopy" class="dark compact">Copiar enlace</button></div>
      <div class="buttons"><button id="ecLanApply">Aplicar</button></div>
      <p id="ecLanInfo" class="note">El monitor interno funciona aunque Output LAN esté desactivado.</p>`;
    left.appendChild(card);
    q('#ecLanApply').onclick=applyLan;q('#ecLanEnabled').onchange=()=>applyLan();q('#ecLanCopy').onclick=copyLanUrl;
  }

  function injectNdiSettings(){
    const left=q('#tab-emission .cols > div:first-child');if(!left||q('#ecNdiOutputCard'))return;
    const card=document.createElement('div');card.id='ecNdiOutputCard';card.className='card top-gap ec-ndi-output-card';card.innerHTML=`
      <div class="section-head"><div><h3>Salida NDI®</h3><p class="note">Publica la misma señal del Output como fuente NDI High Bandwidth para OBS, vMix u otros equipos de producción de la red.</p></div><span id="ecNdiState" class="status-pill neutral">DESACTIVADO</span></div>
      <label class="switch-row"><span><b>Activar salida NDI</b><small>Funciona en segundo plano y no reemplaza el Output local ni el Output LAN.</small></span><input id="ecNdiEnabled" type="checkbox"><span class="switch-ui"></span></label>
      <div class="form-grid two">
        <label>Nombre de la fuente<input id="ecNdiName" type="text" maxlength="180" value="GEC Automatic News - OUTPUT"></label>
        <label>FPS<select id="ecNdiFps"><option value="15">15</option><option value="25">25</option><option value="30" selected>30</option><option value="50">50</option><option value="60">60</option></select></label>
      </div>
      <label class="switch-row compact-row"><span><b>Enviar audio</b><small>Mezcla la voz, música, videos, contenidos y anuncios del Output.</small></span><input id="ecNdiAudio" type="checkbox" checked><span class="switch-ui"></span></label>
      <div class="form-grid two">
        <label>Receptores NDI conectados<input id="ecNdiClients" type="text" value="0" readonly></label>
        <label>Formato<input id="ecNdiFormat" type="text" value="Sigue al Output · 16:9 / 9:16" readonly></label>
      </div>
      <div class="buttons"><button id="ecNdiApply">Aplicar NDI</button></div>
      <p id="ecNdiInfo" class="note">NDI está desactivado. Al activarlo, la fuente aparecerá en los receptores NDI de la red.</p>
      <p class="ec-ndi-attribution">NDI® is a registered trademark of Vizrt NDI AB. <button id="ecNdiWebsite" class="link-button" type="button">ndi.video</button></p>`;
    left.appendChild(card);
    q('#ecNdiApply').onclick=applyNdi;
    q('#ecNdiEnabled').onchange=()=>applyNdi();
    q('#ecNdiWebsite').onclick=()=>window.ECAPI.openNdiWebsite?.().catch(()=>{});
  }

  async function applyNdi(){
    const enabled=!!q('#ecNdiEnabled')?.checked,name=String(q('#ecNdiName')?.value||'GEC Automatic News - OUTPUT').trim(),fps=Number(q('#ecNdiFps')?.value)||30,audio=!!q('#ecNdiAudio')?.checked,btn=q('#ecNdiApply');
    if(btn)btn.disabled=true;
    try{
      ndiState=await window.ECAPI.outputNdiConfigure({enabled,name,fps,audio});
      renderNdi(ndiState);
      if(typeof status==='function')status(ndiState.error?`NDI: ${ndiState.error}`:(ndiState.running?`NDI activo · ${ndiState.name}`:'NDI desactivado.'));
    }catch(e){if(typeof status==='function')status(`NDI: ${e.message||e}`);}
    finally{if(btn)btn.disabled=false;}
  }

  function renderNdi(st){
    if(!st)return;ndiState=st;
    const enabled=q('#ecNdiEnabled'),name=q('#ecNdiName'),fps=q('#ecNdiFps'),audio=q('#ecNdiAudio'),clients=q('#ecNdiClients'),pill=q('#ecNdiState'),info=q('#ecNdiInfo');
    if(enabled&&document.activeElement!==enabled)enabled.checked=!!st.enabled;
    if(name&&document.activeElement!==name)name.value=st.name||'GEC Automatic News - OUTPUT';
    if(fps&&document.activeElement!==fps)fps.value=String(st.fps||30);
    if(audio&&document.activeElement!==audio)audio.checked=st.audio!==false;
    if(clients)clients.value=String(Number(st.connections)||0);
    if(pill){
      if(st.error){pill.textContent='ERROR';pill.className='status-pill error';}
      else if(st.running){pill.textContent='NDI ACTIVO';pill.className='status-pill live';}
      else if(st.starting){pill.textContent='INICIANDO';pill.className='status-pill ok';}
      else{pill.textContent='DESACTIVADO';pill.className='status-pill neutral';}
    }
    if(info){
      if(st.error)info.textContent=`${st.error} GEC, el Output local y la cola continúan funcionando.`;
      else if(!st.bridgeAvailable)info.textContent='El bridge NDI no está incluido en este build. Reinstala una versión de GEC con soporte NDI.';
      else if(st.enabled&&!st.runtimeDetected&&!st.running)info.textContent='NDI Runtime no detectado en esta computadora. Instala NDI Tools/Runtime o usa la instalación NDI existente del equipo.';
      else if(st.running)info.textContent=`Fuente "${st.name}" · ${st.fps} fps · ${st.audio?'audio estéreo 48 kHz':'sin audio'} · ${Number(st.connections)||0} receptor${Number(st.connections)===1?'':'es'} conectado${Number(st.connections)===1?'':'s'}.`;
      else info.textContent='NDI está desactivado. Al activarlo, la fuente aparecerá en los receptores NDI de la red.';
    }
  }

  async function refreshNdi(){try{renderNdi(await window.ECAPI.outputNdiStatus());}catch{}}

  async function copyLanUrl(){
    const value=q('#ecLanUrl')?.value||'';if(!value)return;
    try{await navigator.clipboard.writeText(value);if(typeof status==='function')status('Enlace de Output LAN copiado.');return;}catch{}
    const el=document.createElement('textarea');el.value=value;el.style.position='fixed';el.style.opacity='0';document.body.appendChild(el);el.select();try{document.execCommand('copy');if(typeof status==='function')status('Enlace de Output LAN copiado.');}catch{}el.remove();
  }

  async function applyLan(){
    const enabled=!!q('#ecLanEnabled')?.checked,port=Math.max(1024,Math.min(65535,Math.round(Number(q('#ecLanPort')?.value)||8787)));const btn=q('#ecLanApply');if(btn)btn.disabled=true;
    try{lanState=await window.ECAPI.outputLanConfigure({enabled,port});renderLan(lanState);if(typeof status==='function')status(lanState.error?`Output LAN: ${lanState.error}`:(enabled?'Output LAN activado.':'Output LAN desactivado; monitor local disponible.'));}
    catch(e){if(typeof status==='function')status(`Output LAN: ${e.message||e}`);}finally{if(btn)btn.disabled=false;}
  }

  function renderLan(s){
    if(!s)return;lanState=s;const enabled=q('#ecLanEnabled'),port=q('#ecLanPort'),url=q('#ecLanUrl'),clients=q('#ecLanClientsField'),pill=q('#ecLanState'),info=q('#ecLanInfo');
    if(enabled&&document.activeElement!==enabled)enabled.checked=!!s.enabled;if(port&&document.activeElement!==port)port.value=String(s.port||8787);if(url)url.value=s.lanUrl||'';if(clients)clients.value=String(Number(s.clients)||0);
    if(pill){if(s.error){pill.textContent='ERROR';pill.className='status-pill error';}else if(s.enabled&&s.lanUrl){pill.textContent='LAN ACTIVO';pill.className='status-pill live';}else{pill.textContent='SOLO LOCAL';pill.className='status-pill neutral';}}
    if(info)info.textContent=s.error?`${s.error} El programa y el monitor local continúan funcionando.`:s.lastClientError?`Aviso de cliente LAN: ${s.lastClientError}. La cola no fue afectada.`:s.enabled&&s.lanUrl?`Salida disponible en ${s.ip}:${s.actualPort}. Audio LAN activado.`:'El monitor interno permanece disponible. Activa LAN solo cuando necesites enviar la señal a otra PC.';
    const monClients=q('#ecMonitorClients');if(monClients)monClients.textContent=`LAN: ${Number(s.clients)||0} conexión${Number(s.clients)===1?'':'es'}`;
    if(s.localUrl&&(s.localUrl!==lastMonitorUrl||!monitorReady&&!q('#ecMonitorFrame')?.getAttribute('src')))setMonitorUrl(s.localUrl);
    else if(!s.localUrl){const empty=q('#ecMonitorEmpty');if(empty){empty.classList.remove('hidden');empty.textContent='Monitor local no disponible · reintentando…';}}
  }

  function setMonitorUrl(url,force=false){
    const frame=q('#ecMonitorFrame'),empty=q('#ecMonitorEmpty');if(!frame||!url)return;lastMonitorUrl=url;monitorReady=false;monitorAttemptAt=Date.now();if(empty){empty.classList.remove('hidden');empty.textContent='Iniciando monitor…';}
    frame.onload=()=>{monitorReady=true;if(empty)empty.classList.add('hidden');};
    const target=force?`${url}${url.includes('?')?'&':'?'}reload=${Date.now()}`:url;frame.src=target;
  }
  async function refreshLan(){try{let s=await window.ECAPI.outputLanStatus();if(!s?.localUrl&&window.ECAPI.outputLanEnsure)s=await window.ECAPI.outputLanEnsure();renderLan(s);if(s?.localUrl&&!monitorReady&&monitorAttemptAt&&Date.now()-monitorAttemptAt>5000&&Date.now()-monitorRecoveryAt>8000){monitorRecoveryAt=Date.now();if(window.ECAPI.outputLanEnsure)s=await window.ECAPI.outputLanEnsure();renderLan(s);if(s?.localUrl)setMonitorUrl(s.localUrl,true);}}catch(e){const empty=q('#ecMonitorEmpty');if(empty){empty.classList.remove('hidden');empty.textContent='Monitor local: reintentando conexión…';}}}
  function applyFormat(format){lastFormat=format==='9:16'?'9:16':'16:9';const host=q('#ecMonitorFrameHost');if(host){host.classList.toggle('format-9-16',lastFormat==='9:16');host.classList.toggle('format-16-9',lastFormat!=='9:16');}}
  function renderOutputState(s){if(!s)return;applyFormat(s.format);const pill=q('#ecMonitorState');if(pill){const k=s.kind==='ad'?'ANUNCIO':s.kind==='canned'?'CONTENIDO':s.source==='automatic'||s.source==='manual'?'AL AIRE':'STANDBY';pill.textContent=k;pill.className=`status-pill ${k==='STANDBY'?'neutral':'live'}`;}setTimeout(()=>{const top=q('#outputStatus'),btn=q('#openOutput');if(top&&s.open&&!s.visible){const res=s.resolution||(s.format==='9:16'?'1080×1920':'1920×1080');top.textContent=`OUTPUT · ${res} · oculto${s.source==='automatic'?' · Automático':''}`;top.className=`status-pill ${s.source==='automatic'?'live':'ok'}`;if(btn)btn.textContent='Abrir Output';}else if(btn&&s.open&&s.visible)btn.textContent='Ocultar Output';},0);}

  function installOutputButtonGuard(){
    const btn=q('#openOutput');if(!btn||btn.dataset.ecLanGuard)return;btn.dataset.ecLanGuard='1';btn.addEventListener('click',async e=>{e.preventDefault();e.stopImmediatePropagation();try{const s=await window.ECAPI.outputStatus();if(s?.visible){const r=await window.ECAPI.closeOutput();renderOutputState(r.state||await window.ECAPI.outputStatus());if(typeof status==='function')status('Ventana Output oculta. La emisión, el monitor y LAN continúan.');}else{const r=await window.ECAPI.openOutput();renderOutputState(r.state||await window.ECAPI.outputStatus());if(typeof status==='function')status('Ventana Output visible.');}}catch(err){if(typeof status==='function')status(`Output: ${err.message||err}`);}},true);
  }

  injectMonitor();injectLanSettings();injectNdiSettings();installOutputButtonGuard();window.ECAPI.outputStatus().then(renderOutputState).catch(()=>{});refreshNdi();
  window.ECAPI.on('output:lanState',s=>renderLan(s));window.ECAPI.on('output:ndiState',s=>renderNdi(s));window.ECAPI.on('output:state',s=>renderOutputState(s));window.ECAPI.on('profile:changed',async()=>{lastMonitorUrl='';monitorReady=false;monitorAttemptAt=0;try{if(window.ECAPI.outputLanEnsure)renderLan(await window.ECAPI.outputLanEnsure());}catch{}refreshLan();refreshNdi();});
  const startMonitorRuntime=()=>{ensureMonitorFrame();refreshLan();refreshNdi();if(!pollTimer)pollTimer=setInterval(()=>{if(!document.hidden){refreshLan();refreshNdi();}},2500);};
  if(document.readyState==='complete')setTimeout(startMonitorRuntime,0);else window.addEventListener('load',()=>setTimeout(startMonitorRuntime,0),{once:true});
  window.addEventListener('beforeunload',()=>clearInterval(pollTimer),{once:true});
})();