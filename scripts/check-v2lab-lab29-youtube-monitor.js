'use strict';
const fs=require('fs');
const assert=require('assert');

const promo=fs.readFileSync('src/services/releaseV2YoutubePromo.js','utf8');
const promoUi=fs.readFileSync('src/renderer-youtube-promo.js','utf8');
const monitor=fs.readFileSync('src/renderer-lan-output.js','utf8');

// YouTube state must be owned by the dedicated YouTube path, not overwritten by stale generic settings saves.
assert(/preserveYoutubePromoState|protectedYoutubePromo|youtubePromoProtected/i.test(promo),
  'Lab.29 debe proteger el estado YouTube frente a saveSettings genérico');
assert(/baseLoad\.call\(this\)|baseLoad\.apply\(this/.test(promo),
  'La protección debe releer el estado persistido antes de guardar ajustes genéricos');
assert(/action==='configure'/.test(promo),
  'La activación y leadSeconds de Promo YouTube deben guardarse por comando dedicado');
assert(/command\(['"]configure['"]/.test(promoUi),
  'La UI no debe guardar enabled/leadSeconds mediante un saveSettings genérico');
assert(!/async function saveGlobal\(\)[\s\S]{0,900}saveSettings\(s\)/.test(promoUi),
  'saveGlobal no debe poder sobrescribir links/videos con una copia stale');
assert(/Object\.values\(promo\.links|promo\.links\[contentKey\]/.test(promo),
  'Debe preservarse el modelo varios contenidos -> mismo videoId');

// Monitor: single controller, 15 FPS normally and reduced-but-live while AI/TTS/GPU is busy.
assert(/MONITOR_FPS\s*=\s*15/.test(monitor),'Monitor normal debe permanecer a 15 FPS');
assert(/MONITOR_BUSY_FPS\s*=\s*5/.test(monitor),'Monitor debe mantenerse vivo a 5 FPS durante carga IA/TTS/GPU');
assert(!/if\(productionGpuBusy\(\)\)\{[\s\S]{0,350}return;\}/.test(monitor),
  'La carga de IA/TTS no debe congelar completamente el monitor');
assert(/monitorCaptureInterval|effectiveMonitorInterval|busyFrameMs/i.test(monitor),
  'El controlador debe elegir una cadencia efectiva según carga');
assert(/__ecMonitorRuntimeDiagnostics/.test(monitor),
  'Lab.29 debe exponer diagnóstico mínimo de cadencia del monitor');

console.log('Lab.29 YouTube persistence + monitor adaptive cadence checks: OK');
