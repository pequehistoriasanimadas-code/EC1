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
const chatterboxPerfLab29=read('src/services/releaseV2ChatterboxPerformanceLab29.js');
const ttsLabRuntime=read('src/services/ttsLabRuntime.js');
const v2Lab=read('src/services/releaseV2Lab.js');
const audioUx=read('src/renderer-audio-ux-lab29.js');

// 1. Contadores de sesión: incrementan en motor y el renderer final los refresca aunque falle una capa legacy.
assert(automation.includes('this.newsEmitted=0')&&auto25.includes('this.newsEmitted++'),'contador de noticias emitidas debe existir e incrementarse al terminar cada noticia');
assert(automation.includes('this.cannedPlayed=0')&&automation.includes('this.adsPlayed=0'),'contadores de contenido/anuncio deben existir');
assert(r32.includes('syncSessionCounters(snapshot)')&&r32.includes('lastAutomationStateAt')&&r32.includes('sessionPollTimer'),'renderer final debe actualizar/pollear contadores de sesión');
assert(!rel30.includes("this.__ec0330ContentAnchorNews=0;return baseReset.call(this)")&&!rel31.includes("this.__ec0331MediaPlan=null;this.__ec0331SkippedContent=false;return baseReset.call(this)")&&!rel32.includes("this.__ec0332PlanRegistry=new Map();this.__ec0332PlanContext='';\n    return baseReset.call(this)"),'Reiniciar contadores visibles no debe alterar frecuencia, selección ni identidad de contenidos programados');

// 2. Exclusivas: la preparación debe respetar la frecuencia, no esperar a llenar todo con públicas.
assert(auto25.includes('processingSchedulerState(settings')&&auto25.includes('sched=this.processingSchedulerState(s)'),'productor debe proyectar la cadencia de exclusivas sobre la cola en preparación');
assert(auto25.includes("const selectionMode=needDueExclusive?{exclusiveOnly:true}:{publicOnly:true}"),'el turno exclusivo debe reservar el slot de preparación correspondiente');
assert(r32.includes('<span class="queue-exclusive">EXCLUSIVO</span>'),'la cola final debe identificar exclusivas visiblemente');

// 3. Standby: URL recalculada desde ruta real, loop, retorno y autorrecuperación si el decoder deja de avanzar.
assert(main.includes('standbyVideoUrl:fileUrl(raw.standbyVideo)')&&main.includes('delete incomingOutput.standbyVideoUrl'),'standby no debe depender de una URL sintética persistida');
assert(out31.includes('video.loop=true')&&out31.includes("if(a==='stop')setTimeout(()=>showStandby"),'standby debe hacer loop y regresar al detener');
assert(out31.includes('function startStandbyVideoWatchdog'),'standby debe tener un watchdog independiente de progreso de video');
assert(out31.includes('function recoverStandbyVideo'),'standby congelado debe disponer de una rutina de recuperación controlada');
assert(out31.includes('lastStandbyProgressAt')&&out31.includes('lastStandbyCurrentTime'),'watchdog debe comprobar avance real de currentTime, no solo paused/ended');
assert(out31.includes("video.addEventListener('stalled'")&&out31.includes("video.addEventListener('waiting'"),'eventos stalled/waiting deben alimentar la recuperación del standby');

// 4. Música: jamás sobre contenido/anuncio, incluido el primer contenido tras standby.
assert(out.includes('await stopMusicForCanned();if(serial!==contentSerial)return;const previous=activeKind'),'contenido debe cortar música antes de evaluar transición de origen');
assert(out31.includes("(outputMode==='content'||outputMode==='ad')")&&out31.includes('musicEl.pause()'),'watchdog no puede reactivar música durante contenido/anuncio');
assert(out.includes("music.loop=design.musicLoop!==false"),'música debe conservar loop configurado durante noticias y continuidad desde standby');

// 5. Monitor Lab.28: una sola captura directa del Output a 15 FPS, sin iframe ni segundo loop, y con prioridad para IA/TTS/GPU.
assert(main.includes("ipcMain.handle('output:monitorFrame'")&&main.includes('captureOutputMonitorFrame')&&main.includes('capturePage()'),'monitor debe capturar el Output directamente');
assert(preload.includes('outputMonitorFrame')&&rLan.includes('outputMonitorFrame()')&&rLan.includes('ecMonitorImage'),'bridge/UI del monitor directo faltante');
assert(!rLan.includes('function ensureMonitorFrame()'),'monitor interno no debe volver a depender de iframe/localhost');
assert(preload.includes('outputMonitorAudio')&&main.includes("ipcMain.handle('output:monitorAudio'")&&rLan.includes('Audio monitor: OFF'),'monitor debe conservar audio local opcional sin iframe');
assert(/MONITOR_FPS\s*=\s*15/.test(rLan)&&/MONITOR_FRAME_MS\s*=\s*Math\.round\(1000\/MONITOR_FPS\)/.test(rLan)&&rLan.includes('productionGpuBusy()'),'Lab.28 debe usar un único monitor a 15 FPS conservando prioridad IA/TTS/GPU');
assert(!monitorLab27.includes('setInterval')&&!monitorLab27.includes('outputMonitorFrame()'),'Lab.28 debe neutralizar el segundo loop de captura heredado de Lab.27');
assert(youtubeRelease.includes("injectFile(win,'renderer-monitor-live-lab27.js','js')"),'el asset de compatibilidad Lab.27 debe seguir cargando sin crear un segundo capturador');

// 6. Optimización: Chatterbox/Qwen deben medirse con renderizadores secundarios liberados.
assert(optimizer.includes('outputBenchmarkQuiesce')&&optimizer.includes('outputBenchmarkRestore'),'optimizador debe aislar Output/monitor/NDI');
assert(main.includes('quiesceOutputForBenchmark')&&main.includes('destroyNdiWindow()'),'main debe liberar renderizadores secundarios durante benchmark');
assert(main.includes("autoState?.emission?.running")&&main.includes("outputState.source==='manual'"),'optimizador no debe destruir una emisión real para hacer benchmark');

// 7. Contenidos/anuncios: identidad real, selección manual y promo YouTube propagada solo al contenido.
assert(rel31.includes('scheduleSpecificContent')&&rel31.includes('mediaByPath(this.canned,folder,wanted)'),'programar contenido específico debe conservarse');
assert(rel31.includes('await this.playAdAfterCanned'),'anuncio posterior a contenido debe conservarse');
assert(rel32.includes("sourceType:'content'")&&rel32.includes("sourceType:'ad'")&&rel32.includes('plan.content.name')&&rel32.includes('plan.ad.name'),'cola debe mostrar nombres reales de contenido/anuncio');
assert(youtubeRelease.includes('installAutomationSnapshot')&&youtubeRelease.includes("String(payload?.mediaRole||'')==='content'")&&youtubeRelease.includes('this.currentCanned?.youtubePromo')&&youtubeRelease.includes("String(payload?.mediaRole||'')==='ad'")&&youtubeRelease.includes('youtubePromo:null'),'el snapshot YouTube del contenido debe viajar al Output y nunca aplicarse al anuncio posterior');

// 8. Output local/LAN: ocultar no mata la emisión y servidor LAN sigue expuesto a la red cuando está activo.
assert(main.includes("outputWindow.on('close',e=>{if(!controlledShutdown()){e.preventDefault();outputWindow.hide()"),'cerrar Output debe ocultar, no destruir durante operación');
assert(lanServer.includes("this.config.enabled?'0.0.0.0':'127.0.0.1'")&&lanServer.includes('server.listen(port,host'),'Output LAN debe escuchar en 0.0.0.0 cuando LAN está activo');

// 9. NDI: señal continua, reconexión a programa actual y sin coste de transporte si no hay receptor.
const ndi=read('src/services/outputNdi.js');
assert(main.includes('startNdiFrameClock')&&main.includes('seedNdiProgram')&&main.includes('currentOutputProgram'),'NDI debe mantener frames constantes y recuperar el programa actual al reiniciar');
assert(ndi.includes('this.connections>0')&&ndi.includes('this.connections<1'),'NDI no debe copiar frames/audio crudos si no hay receptores');

// 10. Chatterbox A/B: recuperar el benchmark base de Lab25 sin quitar el batching GPU SWAP de Lab29.
const installerMatch=chatterboxPerfLab29.match(/function\s+installReleaseV2ChatterboxPerformanceLab29\s*\(\)\s*\{([^}]*)\}/);
assert(installerMatch,'debe existir installReleaseV2ChatterboxPerformanceLab29');
const installerBody=installerMatch[1];
assert(!installerBody.includes('installBenchmarkPolicy('),'Lab29 A/B no debe instalar pre-warmups extra de Chatterbox');
assert(installerBody.includes('installGpuSwapBatching('),'Lab29 A/B debe conservar el batching GPU SWAP');
assert(chatterboxPerfLab29.includes('const GPU_SWAP_BATCH_SIZE=4'),'Lab29 A/B debe conservar bloques GPU SWAP de 4 etapas');
assert(ttsLabRuntime.includes("const warm=await this.generate(id,text,options)")&&ttsLabRuntime.includes("const runs=[],stableRuns=id==='qwen3tts'?5:3"),'Chatterbox debe volver al warmup + 3 corridas estables del benchmark base');

// 11. Motor TTS seleccionado: nunca cambiar silenciosamente Chatterbox/Qwen por Kokoro durante una noticia.
assert(v2Lab.includes("if(engine==='kokoro')return baseGenerate"),'Kokoro seleccionado explícitamente debe conservar su ruta nativa');
assert(!v2Lab.includes('fallbackExplicit:true')&&!v2Lab.includes('fallbackFrom:engine'),'un fallo de Chatterbox/Qwen no puede producir un WAV Kokoro silencioso');
assert(v2Lab.includes('TTS_PRIMARY_ENGINE_FAILED'),'el error del motor primario debe conservar una identidad diagnóstica para que el pipeline pueda reintentar o marcar error');
assert(auto25.includes("'TTS_PRIMARY_ENGINE_FAILED'")||auto25.includes('TTS_WORKER_EXIT'),'pipeline debe mantener una ruta de recuperación/reintento sin cambiar la identidad de voz');

// 12. Audio de referencia: un solo control Play/Stop, limpieza segura y sin audios de preview solapados.
assert(audioUx.includes("stop:'<svg"),'el control de referencia debe disponer de icono Stop');
assert(audioUx.includes('function stopReferenceAudio'),'debe existir una única rutina para detener y limpiar la referencia activa');
assert(audioUx.includes('referenceAudioId===id'),'volver a pulsar la referencia activa debe detenerla en lugar de reiniciarla');
assert(audioUx.includes('referenceAudio.onended')&&audioUx.includes('referenceAudio.onerror'),'fin o error del audio debe restaurar automáticamente el botón Play');
assert(audioUx.includes("q('#v2VoicePreview')?.addEventListener('play',stopReferenceAudio)"),'Probar voz debe detener cualquier referencia para evitar previews simultáneos');
assert(audioUx.includes("window.ECAPI.on?.('profile:changed',stopReferenceAudio)"),'cambiar de perfil debe detener la referencia activa');
assert(audioUx.includes("q('#v2TtsEngine')?.addEventListener('change',()=>{stopReferenceAudio();"),'cambiar de motor debe detener la referencia activa');
assert(audioUx.includes("q('#v2ReferenceVoice')?.addEventListener('change',()=>{stopReferenceAudio();"),'cambiar de voz de referencia debe detener el audio anterior');
assert(audioUx.includes('if(referenceAudioId===id)stopReferenceAudio()'),'eliminar la referencia que suena debe detenerla antes de borrarla');

console.log('check-v2lab-regression-matrix: OK · counters · P/P/P/E · standby watchdog · music · monitor 15 FPS/audio · optimization · content/ad + YouTube promo · LAN · NDI · Chatterbox base benchmark A/B · TTS primary lock · reference audio Play/Stop');
