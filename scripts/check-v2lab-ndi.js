'use strict';
const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {OutputNdi,cleanName,packet}=require('../src/services/outputNdi');

const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

(async()=>{
  assert.strictEqual(cleanName('  GEC:/OUTPUT*TEST?  '),'GEC OUTPUT TEST','El nombre NDI debe ser seguro para descubrimiento en red');
  const video=Buffer.alloc(64,7),p=packet(1,4,4,30,video);
  assert.strictEqual(p.header.length,28);
  assert.strictEqual(p.header.toString('ascii',0,4),'GECN');
  assert.strictEqual(p.header.readUInt32LE(4),1);
  assert.strictEqual(p.header.readUInt32LE(8),1);
  assert.strictEqual(p.header.readUInt32LE(12),4);
  assert.strictEqual(p.header.readUInt32LE(16),4);
  assert.strictEqual(p.header.readUInt32LE(20),30);
  assert.strictEqual(p.header.readUInt32LE(24),64);

  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'gec-lab25-ndi-'));
  try{
    const svc=new OutputNdi({dataDir:temp,resourcesDir:temp});
    let st=svc.status();
    assert.strictEqual(st.enabled,false);
    assert.strictEqual(st.running,false);
    assert.strictEqual(st.name,'GEC Automatic News - OUTPUT');
    assert.strictEqual(st.fps,30);
    assert.strictEqual(st.audio,true);
    assert.strictEqual(st.bridgeAvailable,false);
    st=await svc.configure({enabled:true,name:'GEC NDI Test',fps:25,audio:false});
    assert.strictEqual(st.enabled,true);
    assert.strictEqual(st.running,false);
    assert.match(st.error,/Bridge NDI no incluido/i,'La falta del bridge debe ser un error no fatal y explícito');
    const persisted=JSON.parse(fs.readFileSync(path.join(temp,'global','output-ndi.json'),'utf8'));
    assert.deepStrictEqual(persisted,{enabled:true,name:'GEC NDI Test',fps:25,audio:false});
    await svc.stop(false);
  }finally{fs.rmSync(temp,{recursive:true,force:true});}

  const main=read('src/main.js'),preload=read('src/preload.js'),audio=read('src/output-ndi-audio.js'),ui=read('src/renderer-lan-output.js'),cpp=read('src/native/ndi_bridge.cpp'),html=read('src/output.html');
  assert(main.includes('offscreen:true')&&main.includes("webContents.on('paint'")&&main.includes('toBitmap()'),'NDI debe capturar el Output completo mediante una ventana offscreen aislada');
  assert(main.includes("ipcMain.handle('output:ndiStatus'")&&main.includes("ipcMain.handle('output:ndiConfigure'")&&main.includes("ipcMain.on('output:ndiAudio'"),'Main debe exponer estado/configuración y transportar audio NDI');
  assert(main.includes("ndiWindow.webContents.send('output:story'")&&main.includes("ndiWindow.webContents.send('output:control'"),'NDI debe reflejar la misma historia y controles del Output maestro');
  assert(preload.includes("if(!isNdiMirror)ipcRenderer.send('output:playback'"),'El espejo NDI no debe duplicar eventos de fin/progreso hacia automatización');
  assert(preload.includes("if(isNdiMirror)ipcRenderer.send('output:ndiAudio'"),'Solo el espejo NDI puede enviar muestras de audio');
  assert(audio.includes("window.__GEC_NDI_AUDIO_TAP__='lab25'")&&audio.includes('createMediaElementSource')&&audio.includes('createScriptProcessor'),'El espejo NDI debe mezclar el audio real de los elementos multimedia');
  assert(html.includes('output-ndi-audio.js'),'Output local debe cargar el tap NDI en modo no-op y activarlo solo con ?ndi=1');
  assert(ui.includes('Salida NDI®')&&ui.includes('outputNdiConfigure')&&ui.includes('outputNdiStatus'),'La UI debe permitir activar y diagnosticar NDI');
  assert(ui.includes('NDI® is a registered trademark of Vizrt NDI AB')&&ui.includes('openNdiWebsite'),'La UI debe conservar atribución y enlace oficial NDI');
  assert(cpp.includes('LoadLibraryExW')&&cpp.includes('Processing.NDI.Lib.x64.dll')&&cpp.includes('NDIlib_send_send_video_v2')&&cpp.includes('NDIlib_send_send_audio_v3'),'Bridge debe cargar el runtime instalado dinámicamente y enviar video/audio');
  assert(cpp.includes('--self-test')&&cpp.includes('NDI_BGRA')&&cpp.includes('NDI_FLTP'),'Bridge debe incluir smoke autónomo y formatos High Bandwidth esperados');
  assert(!main.includes('require(\'Processing.NDI.Lib.x64.dll\')'),'GEC no debe depender de una DLL NDI cargada dentro de Electron');

  console.log('check-v2lab-ndi: OK · sender aislado · BGRA + audio 48k · runtime dinámico · UI + fallback no fatal');
})().catch(e=>{console.error(e.stack||e);process.exit(1);});
