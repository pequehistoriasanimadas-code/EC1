'use strict';
const fs=require('fs');
const path=require('path');
const {app,BrowserWindow}=require('electron');
let installed=false;

function injectFile(win,file,kind='js'){
  try{
    const full=path.join(__dirname,'..',file);
    if(!fs.existsSync(full)||!win||win.isDestroyed())return;
    if(kind==='css'){win.webContents.insertCSS(fs.readFileSync(full,'utf8')).catch(()=>{});return;}
    const code=fs.readFileSync(full,'utf8');
    win.webContents.executeJavaScript(`(()=>{${code}\n})()`,true).catch(()=>{});
  }catch{}
}
function injectAutoNowGuard(win){
  if(!win||win.isDestroyed())return;
  const code=`(()=>{
    if(window.__ecAutoNowGuardLab29)return;window.__ecAutoNowGuardLab29=true;
    const q=s=>document.querySelector(s),move=(n,h)=>{if(n&&h&&n.parentElement!==h)h.appendChild(n);return n;};
    const fmt=v=>{const n=Math.max(0,Math.round(Number(v)||0)),m=Math.floor(n/60),s=n%60;return m+':'+String(s).padStart(2,'0');};
    let last=null,tries=0,timer=null;
    function ensure(){
      const host=q('#ecAutoNowBody');if(!host)return false;
      let panel=q('#ec28EmissionPanel');
      if(!panel){panel=document.createElement('div');panel.id='ec28EmissionPanel';panel.className='ec28-player';panel.innerHTML='<div class="ec28-player-top"><div><span id="ec28NowType" class="mini-pill">SIN EMISIÓN</span><strong id="ec28NowTitle">Nada al aire</strong></div><div id="ec28Time">0:00 / 0:00</div></div><div class="ec28-progress"><div id="ec28ProgressBar"></div></div><div class="ec28-next"><span>Siguiente</span><b id="ec28NextTitle">Esperando cola</b></div>';}
      move(panel,host);
      let next=q('#ec28EmissionNext');
      if(!next){next=document.createElement('button');next.id='ec28EmissionNext';next.className='dark';next.textContent='Siguiente';next.title='Omite el elemento actual y continúa con el siguiente válido de la cola';const controls=q('#ecAutoMonitorControls');if(controls)controls.appendChild(next);else q('#emissionResume')?.insertAdjacentElement('afterend',next);}
      if(next&&!next.dataset.ecNowBound&&!next.onclick){next.dataset.ecNowBound='1';next.addEventListener('click',async()=>{next.disabled=true;try{const s=await window.ECAPI?.emissionNext?.();if(s)render(s);}catch{}finally{setTimeout(()=>{if(next.isConnected)next.disabled=false;},250);}});}
      window.__ecAutoNowGuardLab29Ready=true;return true;
    }
    function render(s){if(!s)return;last=s;ensure();const e=s.emission||{},p=e.progress||{},kind=String(e.currentKind||'none'),src=String(e.currentSourceType||''),dur=Math.max(0,Number(p.durationSec)||0),at=Math.max(0,Number(p.currentSec)||0),pct=dur?Math.max(0,Math.min(100,at/dur*100)):0,labels={news:src==='generated'?'NOTA GENERADA':'NOTICIA',canned:'CONTENIDO',ad:'ANUNCIO',none:'SIN EMISIÓN'};if(q('#ec28NowType'))q('#ec28NowType').textContent=labels[kind]||kind.toUpperCase();if(q('#ec28NowTitle'))q('#ec28NowTitle').textContent=String(e.currentTitle||'')||((e.running&&!e.paused)?'Esperando el siguiente elemento':'Nada al aire');if(q('#ec28Time'))q('#ec28Time').textContent=fmt(at)+' / '+(dur?fmt(dur):'--:--');if(q('#ec28ProgressBar'))q('#ec28ProgressBar').style.width=pct+'%';if(q('#ec28NextTitle'))q('#ec28NextTitle').textContent=e.next?.title||'Esperando cola';const n=q('#ec28EmissionNext');if(n)n.disabled=!e.running||kind==='none';}
    async function hydrate(){try{const s=await window.ECAPI?.automationStatus?.();if(s)render(s);}catch{}}
    function retry(){
      clearTimeout(timer);
      if(ensure()){if(last)render(last);hydrate();return;}
      if(tries++<120)timer=setTimeout(retry,100);
    }
    window.ECAPI?.on?.('automation:state',render);
    window.ECAPI?.on?.('profile:changed',()=>setTimeout(()=>{ensure();hydrate();},220));
    retry();
  })()`;
  win.webContents.executeJavaScript(code,true).catch(()=>{});
}
function injectWindow(win){
  if(!win||win.isDestroyed())return;
  const run=()=>{
    if(!win||win.isDestroyed())return;
    const url=String(win.webContents.getURL()||'');if(!/control\.html(?:[?#]|$)/i.test(url))return;
    injectFile(win,'control-emission-design-repair-lab29.css','css');
    injectFile(win,'control-audio-repair-lab29.css','css');
    injectFile(win,'control-ux-cleanup-lab29.css','css');
    injectFile(win,'control-auto-operator-compact-lab29.css','css');
    injectFile(win,'renderer-emission-design-repair-lab29.js','js');
    injectFile(win,'renderer-ux-cleanup-lab29.js','js');
    injectFile(win,'renderer-audio-profile-sync-lab29.js','js');
    injectAutoNowGuard(win);
  };
  win.webContents.on('did-finish-load',run);setTimeout(run,0);
}
function installReleaseV2UxRepairLab29(){
  if(installed)return;installed=true;
  app.on('browser-window-created',(_,win)=>injectWindow(win));
  for(const win of BrowserWindow.getAllWindows())injectWindow(win);
}
module.exports={installReleaseV2UxRepairLab29};
