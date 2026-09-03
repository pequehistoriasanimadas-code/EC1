'use strict';
const fs=require('fs'),path=require('path'),os=require('os');
const {app,BrowserWindow,ipcMain}=require('electron');
app.commandLine.appendSwitch('disable-gpu');process.env.ELECTRON_DISABLE_SECURITY_WARNINGS='true';
const resourcesDir=path.resolve(process.argv[2]||path.join('dist','win-unpacked','resources')),appRoot=path.join(resourcesDir,'app.asar'),preload=path.join(appRoot,'src','preload.js'),output=path.join(appRoot,'src','output.html'),assert=(v,m)=>{if(!v)throw new Error(m);},wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(win,expr,timeout=8000){const end=Date.now()+timeout;while(Date.now()<end){try{const v=await win.webContents.executeJavaScript(expr,true);if(v)return v;}catch{}await wait(100);}throw new Error(`UI timeout: ${expr}`);}
app.whenReady().then(async()=>{let win,tmp='';try{
  tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gec0331-ui-'));const fakeVideo=path.join(tmp,'standby.mp4');fs.writeFileSync(fakeVideo,'not-a-real-video');const fakeUrl='file:///'+fakeVideo.replace(/\\/g,'/');
  ipcMain.handle('settings:get',()=>({visual:{output:{format:'16:9',transitionEnabled:false,transitionType:'none',transitionDuration:.7,standbyVideo:fakeVideo,standbyVideoUrl:fakeUrl,musicEnabled:false,musicLoop:true,musicVolume:20,musicUrl:''}}}));
  win=new BrowserWindow({show:false,width:960,height:540,webPreferences:{preload,contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});await win.loadFile(output);await until(win,"window.__ec0331OutputInstalled===true");await until(win,"!!document.querySelector('#standbyLayer')");
  const initial=await win.webContents.executeJavaScript("(()=>{const l=document.querySelector('#standbyLayer'),v=document.querySelector('#standbyVideo');return{visible:!l.classList.contains('hidden-layer'),loop:v.loop,src:v.getAttribute('src')||''};})()",true);assert(initial.visible,'Standby no aparece al abrir Output');assert(initial.loop,'Standby no quedó en loop');assert(initial.src.includes('standby.mp4'),'Standby no usa el video configurado');
  win.webContents.send('output:story',{source:'automatic',kind:'news',title:'Smoke',category:'ACTUALIDAD',summary:'Smoke',script:'',image:'',audioUrl:'',audioDurationSec:1});await wait(250);const hidden=await win.webContents.executeJavaScript("document.querySelector('#standbyLayer').classList.contains('hidden-layer')",true);assert(hidden,'Standby no sale al entrar una noticia');
  win.webContents.send('output:control','stop');await wait(250);const returned=await win.webContents.executeJavaScript("!document.querySelector('#standbyLayer').classList.contains('hidden-layer')",true);assert(returned,'Output no vuelve a standby al detener/terminar emisión');
  win.destroy();fs.rmSync(tmp,{recursive:true,force:true});console.log('PACKAGED UI 0.3.31 OK · standby open → news → standby');app.exit(0);
}catch(e){console.error(e.stack||e);try{win?.destroy();}catch{}try{if(tmp)fs.rmSync(tmp,{recursive:true,force:true});}catch{}app.exit(1);}});
