'use strict';
const fs=require('fs');
const assert=require('assert');
const read=file=>fs.readFileSync(file,'utf8');

const r27=read('src/renderer-0327.js');
const v2=read('src/renderer-v2lab.js');
const css27=read('src/control-0327.css');
const cssV2=read('src/control-v2lab.css');
const runtime=read('src/services/ttsLabRuntime.js');
const release=read('src/services/releaseV2Lab.js');

// Un solo selector de motor y el reproductor de prueba siguen siendo la autoridad.
assert.strictEqual((v2.match(/id="v2TtsEngine"/g)||[]).length,1,'Audio debe tener un solo selector de motor TTS');
assert(v2.includes('id="v2VoicePreview"')&&v2.includes("const audio=q('#v2VoicePreview')"),'Probar voz debe conservar su reproductor de audio');

// La biblioteca puede tener varias referencias y muestra cuál usa el perfil sin sugerir rotación.
assert(v2.includes('labStatus?.voices||[]'),'La biblioteca de referencias debe renderizar múltiples voces');
assert(v2.includes('v2-reference-active')&&v2.includes('ACTIVA'),'La referencia seleccionada por el perfil debe identificarse como ACTIVA');
assert(!v2.includes('Secundaria'),'No debe existir una etiqueta que sugiera alternancia automática de voces');
assert(v2.includes('data-play-reference')&&runtime.includes('url:pathToFileURL'),'Cada referencia debe poder reproducirse sin cambiar la voz seleccionada');

// Si el archivo seleccionado desaparece, el id del perfil no puede borrarse por un render incidental.
assert(v2.includes('Voz de referencia no disponible')&&v2.includes('selectedMissing'),'Una referencia faltante debe conservar su id y mostrar estado no disponible');

// referenceVoiceId permanece estrictamente dentro de la configuración por perfil.
assert(release.includes("PROFILE_TTS_KEYS=['engine','style','referenceVoiceId'"),'referenceVoiceId debe persistirse en el sidecar TTS del perfil');
assert(release.includes('profileSidecar')&&release.includes('tts-v2.json'),'La selección TTS debe persistirse por perfil');

// Pronunciación + normalización son comunes a todos los motores y el diagnóstico deja de decir Kokoro.
assert(r27.includes('Pronunciación y normalización'),'La preparación de locución debe agrupar pronunciación y normalizador ES-PE');
assert(r27.includes('id="ec27SpeechSlot"')&&r27.indexOf('ec27SpeechSlot')<r27.indexOf('Reglas actualizables'),'Normalizador ES-PE debe quedar en el bloque común de preparación');
assert(r27.includes('Texto enviado al motor TTS')||r27.includes('TEXTO ENVIADO AL MOTOR TTS'),'El diagnóstico debe nombrar el destino genérico TTS');
assert(!r27.includes('ENVIADO REALMENTE A KOKORO'),'La UI no debe afirmar que todo se envía a Kokoro');
assert(r27.includes('ec27DiagnosticDetails'),'Diagnóstico completo debe quedar plegable por defecto');

// La prueba de pronunciación se preserva, pero fuera del flujo principal.
assert(r27.includes('ec27PronTestDetails')&&r27.includes("q('#testPronunciation')"),'Probar pronunciación debe conservarse dentro de un bloque avanzado');

// Filas compactas: iconos accesibles, no botones largos.
assert(r27.includes('aria-label="Guardar corrección"')&&r27.includes('title="Guardar corrección"'),'Guardar corrección debe ser un icono accesible');
assert(r27.includes('aria-label="Eliminar pronunciación"')&&r27.includes('title="Eliminar pronunciación"'),'Eliminar pronunciación debe ser un icono accesible');
assert(css27.includes('.ec27-icon-action'),'CSS debe soportar acciones compactas por icono');

// Última generación queda como texto compacto, no tabla independiente.
assert(v2.includes('v2LastGeneration')&&cssV2.includes('.v2-last-generation'),'La última generación debe mostrarse como una línea compacta');

// Responsive solo por CSS: no reparenting en resize.
assert(css27.includes('@media(max-width:1200px)'),'Audio debe conservar breakpoint CSS');
assert(!/addEventListener\(['"]resize['"][\s\S]{0,500}(appendChild|insertAdjacentElement|replaceChildren)/.test(r27+v2),'Audio no debe mover nodos por resize');

console.log('check-v2lab-audio-ux-lab29: OK · UX compacta + referencias múltiples + voz por perfil + normalizador común');
