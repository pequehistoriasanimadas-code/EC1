'use strict';
(function installLanOutputUi(){
  if(!window.ECAPI||!document.querySelector('#tab-auto')||!document.querySelector('#tab-emission')){setTimeout(installLanOutputUi,120);return;}
  if(window.__ecLanOutputUiInstalled)return;window.__ecLanOutputUiInstalled=true;
  const q=s=>document.querySelector(s);let lanState=null,ndiState=null,networkPermissionState=null,networkPermissionBusy=false,lastFormat='16:9',pollTimer=null,monitorReady=false,monitorBusy=false,monitorAudioEnabled=false,lastLanPollAt=0;

  function injectMonitor(){
    const grid=q('#tab-auto .auto-cols'),queue=grid?.querySelector('.queue-card');if(!grid||!queue||q('#ecLanMonitorCard'))return;
    let right=q('#ecAutoRightColumn');if(!right){right=document.createElement('div');right.id='ecAutoRightColumn';right.className='ec-auto-right-column';queue.replaceWith(right);right.appendChild(queue);}
    const card=document.createElement('div');card.id='ecLanMonitorCard';card.className='card ec-lan-monitor-card';card.innerHTML=`
      <div class="section-head"><div><h3>Monitor de emisión</h3><p class="note">Vista local directa del Output. No depende del enlace LAN, del navegador ni de permisos de administrador.</p></div><span id="ecMonitorState" class="status-pill neutral">STANDBY</span></div>
      <div id="ecMonitorFrameHost" class="ec-monitor-frame-host format-16-9"><img id="ecMonitorImage" class="ec-monitor-image hidden" alt="Monitor de emisión"><div id="ecMonitorEmpty" class="ec-monitor-empty">Iniciando monitor…</div></div>
      <div class="ec-monitor-footer"><span id="ecMonitorLanHint">Monitor local · no controla la cola</span><button id="ecMonitorAudio" class="dark compact" type="button">Audio monitor: OFF</button><span id="ecMonitorClients">LAN: 0 conexiones</span></div>`;
    right.insertBefore(card,queue);const audioBtn=q('#ecMonitorAudio');if(audioBtn)audioBtn.onclick=async()=>{try{const r=await window.ECAPI.outputMonitorAudio(!monitorAudioEnabled);monitorAudioEnabled=!!r.enabled;audioBtn.textContent=`Audio monitor: ${monitorAudioEnabled?'ON':'OFF'}`;if(typeof status==='function')status(monitorAudioEnabled?'Audio del monitor activado.':'Audio del monitor desactivado.');}catch(e){if(typeof status==='function')status(`Monitor: ${e.message||e}`);}};
    const left=q('#tab-auto .auto-cols > div:first-child'),emission=[...(left?.querySelectorAll('.card')||[])].find(x=>/Emisión automática|Control de emisión/i.test(x.textContent||''));const note=emission?.querySelector('p.note');if(note)note.textContent='El Output maestro se abre automáticamente al iniciar la emisión. Ocultar la ventana Output no detiene el monitor ni la salida LAN.';
  }

  function injectNetworkPermissionsSettings(){
    const left=q('#tab-emission .cols > div:first-child');if(!left||q('#ecNetworkPermissionsCard'))return;
    const card=document.createElement('div');card.id='ecNetworkPermissionsCard';card.className='card top-gap ec-network-permissions';card.innerHTML=`
      <div class="section-head"><div><h3>Permisos de red</h3><p class="note">Autoriza NDI y Output LAN para que otros equipos de tu red puedan conectarse a GEC.</p></div><span id="ecNetworkPermissionsState" class="status-pill neutral">COMPROBANDO</span></div>
      <div class="ec-network-permissions-grid">
        <div><span>NDI</span><b id="ecNetworkNdiPermission">Comprobando…</b></div>
        <div><span>Output LAN</span><b id="ecNetworkLanPermission">Comprobando…</b></div>
      </div>
      <div class="buttons"><button id="ecNetworkPermissionsConfigure" type="button">Configurar permisos de red</button></div>
      <p id="ecNetworkPermissionsInfo" class="note">GEC permanece como usuario normal. Windows solicitará autorización UAC solo si necesita crear o reparar estas reglas.</p>`;
    left.appendChild(card);
    q('#ecNetworkPermissionsConfigure').onclick=configureNetworkPermissions;
  }

  function permissionLabel(ok){return ok?'Permitido ✓':'Pendiente';}
  function renderNetworkPermissions(st){
    if(!st)return;networkPermissionState=st;
    const ndi=q('#ecNetworkNdiPermission'),lan=q('#ecNetworkLanPermission'),pill=q('#ecNetworkPermissionsState'),info=q('#ecNetworkPermissionsInfo'),btn=q('#ecNetworkPermissionsConfigure');
    if(ndi){ndi.textContent=st.supported===false?'No disponible':permissionLabel(st.ndiConfigured===true);ndi.className=st.ndiConfigured===true?'is-ok':'is-pending';}
    if(lan){lan.textContent=st.supported===false?'No disponible':permissionLabel(st.lanConfigured===true);lan.className=st.lanConfigured===true?'is-ok':'is-pending';}
    if(pill){
      if(st.configured===true){pill.textContent='PERMITIDO';pill.className='status-pill live';}
      else if(st.policyManaged){pill.textContent='POLÍTICA';pill.className='status-pill error';}
      else if(st.supported===false){pill.textContent='NO DISPONIBLE';pill.className='status-pill neutral';}
      else if(st.error&&!st.cancelled){pill.textContent='REVISAR';pill.className='status-pill error';}
      else{pill.textContent='PENDIENTE';pill.className='status-pill ok';}
    }
    if(btn){btn.disabled=networkPermissionBusy||st.supported===false||st.configured===true;btn.textContent=st.configured===true?'Permisos configurados ✓':'Configurar permisos de red';}
    if(info){
      if(st.configured===true)info.textContent=`NDI y Output LAN (TCP ${st.lanPort||8787}) están autorizados para la red local en perfiles Dominio/Privado.`;
      else if(st.cancelled)info.textContent='Autorización cancelada. GEC continúa funcionando; las salidas locales no se ven afectadas.';
      else if(st.policyManaged)info.textContent=st.error||'La política de seguridad de la organización no permitió activar estas reglas. Solicita autorización a Sistemas.';
      else if(st.error)info.textContent=st.error;
      else if(st.supported===false)info.textContent=st.message||'La configuración automática de firewall está disponible en Windows.';
      else info.textContent='Pulsa una sola vez para autorizar NDI y Output LAN. La ventana segura de Windows gestiona la autorización; GEC no recibe las credenciales.';
    }
  }

  async function refreshNetworkPermissions(){
    if(!window.ECAPI.outputNetworkPermissionsStatus)return;
    try{renderNetworkPermissions(await window.ECAPI.outputNetworkPermissionsStatus());}catch(e){renderNetworkPermissions({supported:true,configured:false,ndiConfigured:false,lanConfigured:false,error:`No se pudo comprobar Windows Firewall: ${e.message||e}`});}
  }

  async function configureNetworkPermissions(){
    if(networkPermissionBusy||!window.ECAPI.configureOutputNetworkPermissions)return;
    networkPermissionBusy=true;const btn=q('#ecNetworkPermissionsConfigure'),info=q('#ecNetworkPermissionsInfo');if(btn)btn.disabled=true;if(info)info.textContent='Esperando autorización de Windows…';
    try{
      const r=await window.ECAPI.configureOutputNetworkPermissions();renderNetworkPermissions(r);
      if(typeof status==='function')status(r?.configured?'Permisos de red configurados ✓':r?.cancelled?'Autorización de red cancelada.':`Permisos de red: ${r?.error||'pendientes'}`);
    }catch(e){renderNetworkPermissions({...(networkPermissionState||{}),supported:true,configured:false,error:e.message||String(e)});if(typeof status==='function')status(`Permisos de red: ${e.message||e}`);}
    finally{networkPermissionBusy=false;if(btn)btn.disabled=networkPermissionState?.configured===true;}
  }

  function injectLanSettings(){
    const left=q('#tab-emission .cols > div:first-child');if(!left||q('#ecLanOutputCard'))return;
    const card=document.createElement('div');card.id='ecLanOutputCard';card.className='card top-gap ec-lan-output-card';card.innerHTML=`
      <div class="section-head"><div><h3>Output por red local</h3><p class="note">Envía la misma imagen y audio a otra computadora de la red. En OBS agrega una Fuente de navegador con este único enlace.</p></div><span id="ecLanState" class="status-pill neutral">LOCAL</span></div>
      <label class="switch-row"><span><b>Activar Output LAN</b><small>Para acceso desde otra PC usa el botón único “Configurar permisos de red”.</small></span><input id="ecLanEnabled" type="checkbox"><span class="switch-ui"></span></label>
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
    try{lanState=await window.ECAPI.outputLanConfigure({enabled,port});renderLan(lanState);await refreshNetworkPermissions();if(typeof status==='function')status(lanState.error?`Output LAN: ${lanState.error}`:(enabled?'Output LAN activado.':'Output LAN desactivado; monitor local disponible.'));}
    catch(e){if(typeof status==='function')status(`Output LAN: ${e.message||e}`);}finally{if(btn)btn.disabled=false;}
  }

  function renderLan(s){
    if(!s)return;lanState=s;const enabled=q('#ecLanEnabled'),port=q('#ecLanPort'),url=q('#ecLanUrl'),clients=q('#ecLanClientsField'),pill=q('#ecLanState'),info=q('#ecLanInfo');
    if(enabled&&document.activeElement!==enabled)enabled.checked=!!s.enabled;if(port&&document.activeElement!==port)port.value=String(s.port||8787);if(url)url.value=s.lanUrl||'';if(clients)clients.value=String(Number(s.clients)||0);
    if(pill){if(s.error){pill.textContent='ERROR';pill.className='status-pill error';}else if(s.enabled&&s.lanUrl){pill.textContent='LAN ACTIVO';pill.className='status-pill live';}else{pill.textContent='SOLO LOCAL';pill.className='status-pill neutral';}}
    if(info)info.textContent=s.error?`${s.error} El programa y el monitor local continúan funcionando.`:s.lastClientError?`Aviso de cliente LAN: ${s.lastClientError}. La cola no fue afectada.`:s.enabled&&s.lanUrl?`Salida disponible en ${s.ip}:${s.actualPort}. Audio LAN activado.`:'El monitor interno permanece disponible. Activa LAN solo cuando necesites enviar la señal a otra PC.';
    const monClients=q('#ecMonitorClients');if(monClients)monClients.textContent=`LAN: ${Number(s.clients)||0} conexión${Number(s.clients)===1?'':'es'}`;
  }

  function monitorActive(){const tab=q('#tab-auto');return!!(tab?.classList.contains('show')&&!document.hidden);}
  function optimizerActive(){const box=q('#ecOptimizeResult0321');return!!box?.dataset?.live;}
  function productionGpuBusy(){try{const p=typeof automationState!=='undefined'?automationState?.processing:null;return!!(p?.gpuStageBusy||p?.voiceBusy||p?.aiBusy);}catch{return false;}}
  async function refreshMonitor(){
    if(!monitorActive()||monitorBusy)return;
    const img=q('#ecMonitorImage'),empty=q('#ecMonitorEmpty');if(!img||!empty)return;
    if(optimizerActive()){empty.classList.remove('hidden');empty.textContent='Monitor pausado durante la optimización…';img.classList.add('hidden');return;}
    if(productionGpuBusy()){if(!monitorReady){empty.classList.remove('hidden');empty.textContent='Priorizando IA/TTS · el monitor retomará al liberar GPU…';}return;}
    monitorBusy=true;
    try{
      const r=await window.ECAPI.outputMonitorFrame();
      if(r?.suspended){empty.classList.remove('hidden');empty.textContent='Monitor pausado durante la optimización…';img.classList.add('hidden');return;}
      if(!r?.ok||!r.dataUrl){if(!monitorReady){empty.classList.remove('hidden');empty.textContent=r?.error||'Preparando vista local del Output…';}return;}
      applyFormat(r.format||r.state?.format||lastFormat);if(r.state)renderOutputState(r.state);
      img.src=r.dataUrl;img.classList.remove('hidden');empty.classList.add('hidden');monitorReady=true;
    }catch(e){if(!monitorReady){empty.classList.remove('hidden');empty.textContent='Monitor local: reintentando…';}}
    finally{monitorBusy=false;}
  }
  async function refreshLan(){try{let s=await window.ECAPI.outputLanStatus();if(!s?.localUrl&&window.ECAPI.outputLanEnsure)s=await window.ECAPI.outputLanEnsure();renderLan(s);}catch{}}
  function applyFormat(format){lastFormat=format==='9:16'?'9:16':'16:9';const host=q('#ecMonitorFrameHost');if(host){host.classList.toggle('format-9-16',lastFormat==='9:16');host.classList.toggle('format-16-9',lastFormat!=='9:16');}}
  function renderOutputState(s){if(!s)return;if(s.monitorAudio!=null){monitorAudioEnabled=!!s.monitorAudio;const ab=q('#ecMonitorAudio');if(ab)ab.textContent=`Audio monitor: ${monitorAudioEnabled?'ON':'OFF'}`;}applyFormat(s.format);const pill=q('#ecMonitorState');if(pill){const k=s.kind==='ad'?'ANUNCIO':s.kind==='canned'?'CONTENIDO':s.source==='automatic'||s.source==='manual'?'AL AIRE':'STANDBY';pill.textContent=k;pill.className=`status-pill ${k==='STANDBY'?'neutral':'live'}`;}setTimeout(()=>{const top=q('#outputStatus'),btn=q('#openOutput');if(top&&s.open&&!s.visible){const res=s.resolution||(s.format==='9:16'?'1080×1920':'1920×1080');top.textContent=`OUTPUT · ${res} · oculto${s.source==='automatic'?' · Automático':''}`;top.className=`status-pill ${s.source==='automatic'?'live':'ok'}`;if(btn)btn.textContent='Abrir Output';}else if(btn&&s.open&&s.visible)btn.textContent='Ocultar Output';},0);}

  function installOutputButtonGuard(){
    const btn=q('#openOutput');if(!btn||btn.dataset.ecLanGuard)return;btn.dataset.ecLanGuard='1';btn.addEventListener('click',async e=>{e.preventDefault();e.stopImmediatePropagation();try{const s=await window.ECAPI.outputStatus();if(s?.visible){const r=await window.ECAPI.closeOutput();renderOutputState(r.state||await window.ECAPI.outputStatus());if(typeof status==='function')status('Ventana Output oculta. La emisión, el monitor y LAN continúan.');}else{const r=await window.ECAPI.openOutput();renderOutputState(r.state||await window.ECAPI.outputStatus());if(typeof status==='function')status('Ventana Output visible.');}}catch(err){if(typeof status==='function')status(`Output: ${err.message||err}`);}},true);
  }

  injectMonitor();injectNetworkPermissionsSettings();injectLanSettings();injectNdiSettings();installOutputButtonGuard();window.ECAPI.outputStatus().then(renderOutputState).catch(()=>{});refreshNetworkPermissions();refreshNdi();
  window.ECAPI.on('output:lanState',s=>renderLan(s));window.ECAPI.on('output:ndiState',s=>renderNdi(s));window.ECAPI.on('output:state',s=>renderOutputState(s));window.ECAPI.on('profile:changed',async()=>{monitorReady=false;const img=q('#ecMonitorImage');if(img){img.removeAttribute('src');img.classList.add('hidden');}try{if(window.ECAPI.outputLanEnsure)renderLan(await window.ECAPI.outputLanEnsure());}catch{}refreshLan();refreshNdi();refreshNetworkPermissions();refreshMonitor();});
  const startMonitorRuntime=()=>{refreshMonitor();refreshLan();refreshNdi();if(!pollTimer)pollTimer=setInterval(()=>{if(!document.hidden){refreshMonitor();const now=Date.now();if(now-lastLanPollAt>2400){lastLanPollAt=now;refreshLan();refreshNdi();}}},900);};
  if(document.readyState==='complete')setTimeout(startMonitorRuntime,0);else window.addEventListener('load',()=>setTimeout(startMonitorRuntime,0),{once:true});
  window.addEventListener('beforeunload',()=>clearInterval(pollTimer),{once:true});
})();
