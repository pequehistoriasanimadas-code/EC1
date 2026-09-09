'use strict';
(function installLanOutputUi(){
  if(!window.ECAPI||!document.querySelector('#tab-auto')||!document.querySelector('#tab-emission')){setTimeout(installLanOutputUi,120);return;}
  if(window.__ecLanOutputUiInstalled)return;window.__ecLanOutputUiInstalled=true;
  const q=s=>document.querySelector(s);let lanState=null,lastMonitorUrl='',lastFormat='16:9',pollTimer=null,monitorReady=false,monitorAttemptAt=0,monitorRecoveryAt=0;

  function injectMonitor(){
    const grid=q('#tab-auto .auto-cols'),queue=grid?.querySelector('.queue-card');if(!grid||!queue||q('#ecLanMonitorCard'))return;
    let right=q('#ecAutoRightColumn');if(!right){right=document.createElement('div');right.id='ecAutoRightColumn';right.className='ec-auto-right-column';queue.replaceWith(right);right.appendChild(queue);}
    const card=document.createElement('div');card.id='ecLanMonitorCard';card.className='card ec-lan-monitor-card';card.innerHTML=`
      <div class="section-head"><div><h3>Monitor de emisión</h3><p class="note">Refleja la misma señal del Output. El audio del monitor inicia apagado y se activa dentro del visor.</p></div><span id="ecMonitorState" class="status-pill neutral">STANDBY</span></div>
      <div id="ecMonitorFrameHost" class="ec-monitor-frame-host format-16-9"><iframe id="ecMonitorFrame" title="Monitor de emisión" allow="autoplay" referrerpolicy="no-referrer"></iframe><div id="ecMonitorEmpty" class="ec-monitor-empty">Iniciando monitor…</div></div>
      <div class="ec-monitor-footer"><span id="ecMonitorLanHint">Monitor local · no controla la cola</span><span id="ecMonitorClients">LAN: 0 conexiones</span></div>`;
    right.insertBefore(card,queue);
    const emission=[...q('#tab-auto .auto-cols > div:first-child')?.querySelectorAll('.card')||[]].find(x=>/Emisión automática|Control de emisión/i.test(x.textContent||''));const note=emission?.querySelector('p.note');if(note)note.textContent='El Output maestro se abre automáticamente al iniciar la emisión. Ocultar la ventana Output no detiene el monitor ni la salida LAN.';
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

  injectMonitor();injectLanSettings();installOutputButtonGuard();refreshLan();window.ECAPI.outputStatus().then(renderOutputState).catch(()=>{});
  window.ECAPI.on('output:lanState',s=>renderLan(s));window.ECAPI.on('output:state',s=>renderOutputState(s));window.ECAPI.on('profile:changed',async()=>{lastMonitorUrl='';monitorReady=false;monitorAttemptAt=0;try{if(window.ECAPI.outputLanEnsure)renderLan(await window.ECAPI.outputLanEnsure());}catch{}refreshLan();});
  pollTimer=setInterval(()=>{if(!document.hidden)refreshLan();},2500);
  window.addEventListener('beforeunload',()=>clearInterval(pollTimer),{once:true});
})();