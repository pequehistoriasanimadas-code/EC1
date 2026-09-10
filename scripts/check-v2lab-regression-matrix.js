'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');

const main=read('src/main.js');
const preload=read('src/preload.js');
const automation=read('src/services/automation.js');
const auto25=read('src/services/automation0325.js');
const rel30=read('src/services/release0330.js');
const rel31=read('src/services/release0331.js');
const rel32=read('src/services/release0332.js');
const out=read('src/output.js');
const out31=read('src/output-0331.js');
const r31=read('src/renderer-0331.js');
const r32=read('src/renderer-0332.js');
const rLan=read('src/renderer-lan-output.js');
const monitorLab27=read('src/renderer-monitor-live-lab27.js');
const youtubeRelease=read('src/services/releaseV2YoutubePromo.js');
const optimizer=read('src/renderer-0321.js');
const lanServer=read('src/services/outputLanServer.js');

// 1. Contadores de sesión: incrementan en motor y el renderer final los refresca aunque falle una capa legacy.
assert(automation.includes('this.newsEmitted=0')&&auto25.includes('this.newsEmitted++'),'contador de noticias emitidas debe existir e incrementarse al terminar cada noticia');
assert(automation.includes('this.cannedPlayed=0')&&automation.includes('this.adsPlayed=0'),'contadores de contenido/anuncio deben existir');
assert(r32.includes('syncSessionCounters(snapshot)')&&r32.includes('lastAutomationStateAt')&&r32.includes('sessionPollTimer'),'renderer final debe actualizar/pollear contadores de sesión');
assert(!rel30.includes("this.__ec0330ContentAnchorNews=0;return baseReset.call(this)")&&!rel31.includes("this.__ec0331MediaPlan=null;this.__ec0331SkippedContent=false;return baseReset.call(this)")&&!rel32.includes("this.__ec0332PlanRegistry=new Map();this.__ec0332PlanContext='';\n    return baseReset.call(this)"),'Reiniciar contadores visibles no debe alterar frecuencia, selección ni identidad de contenidos programados');

// 2. Exclusivas: la preparación debe respetar la frecuencia, no esperar a llenar todo con públicas.
assert(auto25.includes('processingSchedulerState(settings')&&auto25.includes('sched=this.processingSchedulerState(s)'),'productor debe proyectar la cadencia de exclusivas sobre la cola en preparación');
assert(auto25.includes("const selectionMode=needDueExclusive?{exclusiveOnly:true}:{publicOnly:true}"),'el turno exclusivo debe reservar el slot de preparación correspondiente');
assert(r32.includes('<span class="queue-exclusive">EXCLUSIVO</span>'),'la cola final debe identificar exclusivas visiblemente');

// 3. Standby: URL recalculada desde ruta real, loop y retorno al standby.
assert(main.includes('standbyVideoUrl:fileUrl(raw.standbyVideo)')&&main.includes('delete incomingOutput.standbyVideoUrl'),'standby no debe depender de una URL sintética persistida');
assert(out31.includes('video.loop=true')&&out31.includes("if(a==='stop')setTimeout(()=>showStandby"),'standby debe hacer loop y regresar al detener');

// 4. Música: jamás sobre contenido/anuncio, incluido el primer contenido tras standby.
assert(out.includes('await stopMusicForCanned();if(serial!==contentSerial)return;const previous=activeKind'),'contenido debe cortar música antes de evaluar transición de origen');
assert(out31.includes("(outputMode==='content'||outputMode==='ad')")&&out31.includes('musicEl.pause()'),'watchdog no puede reactivar música durante contenido/anuncio');
assert(out.includes("music.loop=design.musicLoop!==false"),'música debe conservar loop configurado durante noticias y continuidad desde standby');

// 5. Monitor: captura directa del Output, no localhost/iframe, y debe seguir refrescando durante IA/TTS normal.
assert(main.includes("ipcMain.handle('output:monitorFrame'")&&main.includes('captureOutputMonitorFrame')&&main.includes('capturePage()'),'monitor debe capturar el Output directamente');
assert(preload.includes('outputMonitorFrame')&&rLan.includes('outputMonitorFrame()')&&rLan.includes('ecMonitorImage'),'bridge/UI del monitor directo faltante');
assert(!rLan.includes('function ensureMonitorFrame()'),'monitor interno no debe volver a depender de iframe/localhost');
assert(preload.includes('outputMonitorAudio')&&main.includes("ipcMain.handle('output:monitorAudio'")&&rLan.includes('Audio monitor: OFF'),'monitor debe conservar audio local opcional sin iframe');
assert(monitorLab27.includes('refreshDuringProduction')&&monitorLab27.includes('productionBusy()')&&monitorLab27.includes('outputMonitorFrame()'),'Lab.27 debe suplir la captura mientras IA/TTS ocupa GPU para evitar congelar el monitor');
assert(monitorLab27.includes('optimizerActiveLab27()')&&youtubeRelease.includes("injectFile(win,'renderer-monitor-live-lab27.js','js')"),'la corrección del monitor debe cargarse y seguir respetando la pausa explícita de optimización/benchmark');

// 6. Optimización: Chatterbox/Qwen deben medirse con renderizadores secundarios liberados.
assert(optimizer.includes('outputBenchmarkQuiesce')&&optimizer.includes('outputBenchmarkRestore'),'optimizador debe aislar Output/monitor/NDI');
assert(main.includes('quiesceOutputForBenchmark')&&main.includes('destroyNdiWindow()'),'main debe liberar renderizadores secundarios durante benchmark');
assert(main.includes("autoState?.emission?.running")&&main.includes("outputState.source==='manual'"),'optimizador no debe destruir una emisión real para hacer benchmark');

// 7. Contenidos/anuncios: identidad real, selección manual y promo YouTube propagada solo al contenido.
assert(rel31.includes('scheduleSpecificContent')&&rel31.includes('mediaByPath(this.canned,folder,wanted)'),'programar contenido específico debe conservarse');
assert(rel31.includes('await this.playAdAfterCanned'),'anuncio posterior a contenido debe conservarse');
assert(rel32.includes("sourceType:'content'")&&rel32.includes("sourceType:'ad'")&&rel32.includes('plan.content.name')&&rel32.includes('plan.ad.name'),'cola debe mostrar nombres reales de contenido/anuncio');
assert(youtubeRelease.includes('installAutomationPromoForwarding')&&youtubeRelease.includes("payload?.mediaRole==='content'")&&youtubeRelease.includes('youtubePromo:promo'),'el snapshot YouTube del contenido debe viajar al Output y nunca aplicarse al anuncio posterior');

// 8. Output local/LAN: ocultar no mata la emisión y servidor LAN sigue expuesto a la red cuando está activo.
assert(main.includes("outputWindow.on('close',e=>{if(!controlledShutdown()){e.preventDefault();outputWindow.hide()"),'cerrar Output debe ocultar, no destruir durante operación');
assert(lanServer.includes("this.config.enabled?'0.0.0.0':'127.0.0.1'")&&lanServer.includes('server.listen(port,host'),'Output LAN debe escuchar en 0.0.0.0 cuando LAN está activo');

// 9. NDI: señal continua, reconexión a programa actual y sin coste de transporte si no hay receptor.
const ndi=read('src/services/outputNdi.js');
assert(main.includes('startNdiFrameClock')&&main.includes('seedNdiProgram')&&main.includes('currentOutputProgram'),'NDI debe mantener frames constantes y recuperar el programa actual al reiniciar');
assert(ndi.includes('this.connections>0')&&ndi.includes('this.connections<1'),'NDI no debe copiar frames/audio crudos si no hay receptores');

console.log('check-v2lab-regression-matrix: OK · counters · P/P/P/E · standby · music · monitor-live/audio · optimization · content/ad + YouTube promo · LAN · NDI');
