'use strict';
const fs=require('fs');
const assert=require('assert');
const read=file=>fs.readFileSync(file,'utf8');

const r27=read('src/renderer-0327.js');
const v2=read('src/renderer-v2lab.js');
const audio=read('src/renderer-audio-ux-lab29.js');
const audioCss=read('src/control-audio-ux-lab29.css');
const audioService=read('src/services/releaseV2AudioUxLab29.js');
const release=read('src/services/releaseV2Lab.js');
const preload=read('src/preload.js');
const boot=read('src/bootstrap-v2lab.js');
const pkg=JSON.parse(read('package.json'));

// Los suplementos nuevos deben ser JavaScript válido.
assert.doesNotThrow(()=>new Function(audio),'renderer-audio-ux-lab29.js debe parsear');
assert.doesNotThrow(()=>new Function(audioService),'releaseV2AudioUxLab29.js debe parsear');

// Un solo selector de motor y el reproductor de prueba existente siguen siendo la autoridad.
assert.strictEqual((v2.match(/id="v2TtsEngine"/g)||[]).length,1,'Audio debe tener un solo selector de motor TTS');
assert(v2.includes('id="v2VoicePreview"')&&v2.includes("const audio=q('#v2VoicePreview')"),'Probar voz debe conservar su reproductor de audio');
assert(!audio.includes('v2TtsEngine"></select>')&&!audio.includes('id="v2TtsEngine"'),'La capa compacta no debe crear otro selector de motor');

// La biblioteca soporta varias referencias; solo una es ACTIVA para el perfil y no existe rotación implícita.
assert(v2.includes('labStatus?.voices||[]'),'La biblioteca base debe renderizar múltiples voces');
assert(audio.includes('v2-reference-active')&&audio.includes("badge.textContent='ACTIVA'"),'La referencia seleccionada por el perfil debe identificarse como ACTIVA');
assert(!audio.includes('Secundaria')&&!v2.includes('Secundaria'),'No debe existir una etiqueta que sugiera alternancia automática de voces');
assert(audio.includes('data-play-reference')||audio.includes('dataset.playReference'),'Cada referencia debe exponer reproducción individual');
assert(audioService.includes('url:v?.path?pathToFileURL(v.path).href'),'El backend debe exponer una URL local segura para reproducir la referencia');

// Si desaparece el archivo elegido, renderizar no puede borrar el referenceVoiceId guardado en el perfil.
assert(audio.includes('Voz de referencia no disponible')&&audio.includes('selectedMissing'),'Una referencia faltante debe mostrarse explícitamente');
assert(audio.includes('sel.value=selected'),'La UI debe conservar el id faltante en el selector para evitar guardados accidentales a vacío');
assert(release.includes("PROFILE_TTS_KEYS=['engine','style','referenceVoiceId'"),'referenceVoiceId debe persistirse en el sidecar TTS del perfil');
assert(release.includes('profileSidecar')&&release.includes('tts-v2.json'),'La selección TTS debe persistirse por perfil');

// Pronunciación + normalización son comunes a todos los motores; diagnóstico ya no es Kokoro-céntrico.
assert(audio.includes('Pronunciación y normalización'),'La preparación de locución debe agrupar pronunciación y normalizador ES-PE');
assert(audio.includes("q('#ec27SpeechSlot')")&&audio.includes('pronCard.appendChild(speechSlot)'),'Debe reutilizarse el normalizador existente, no clonarse');
assert(audio.includes('TEXTO ENVIADO AL MOTOR TTS'),'El diagnóstico debe nombrar el destino genérico TTS');
assert(!audio.includes('ENVIADO REALMENTE A KOKORO'),'La nueva UI no debe afirmar que todo se envía a Kokoro');
assert(audio.includes('ec27DiagnosticDetails'),'Diagnóstico completo debe quedar plegable por defecto');
assert(audio.includes('ec27PronTestDetails')&&r27.includes("q('#testPronunciation')"),'Probar pronunciación debe conservarse dentro de un bloque avanzado');

// Filas compactas: iconos accesibles, sin romper las clases/listeners originales.
assert(audio.includes(".ec27-save")&&audio.includes('aria-label','Guardar corrección'),'Debe conservarse la acción Guardar original');
assert(audio.includes("b.title='Guardar corrección'")&&audio.includes("b.setAttribute('aria-label','Guardar corrección')"),'Guardar corrección debe ser un icono accesible');
assert(audio.includes("b.title='Eliminar pronunciación'")&&audio.includes("b.setAttribute('aria-label','Eliminar pronunciación')"),'Eliminar pronunciación debe ser un icono accesible');
assert(audioCss.includes('.ec27-icon-action'),'CSS debe soportar acciones compactas por icono');

// Última generación queda como texto compacto y el reproductor permanece visible.
assert(audio.includes('v2LastGeneration')&&audioCss.includes('.v2-last-generation'),'La última generación debe mostrarse como una línea compacta');
assert(audioCss.includes('#v2VoicePreview')&&audioCss.includes('display:block!important'),'El reproductor de la prueba de voz no puede desaparecer');

// La capa debe estar realmente cableada y empaquetada.
assert(preload.includes("control-audio-ux-lab29.css")&&preload.includes("renderer-audio-ux-lab29.js"),'Preload debe cargar los suplementos de Audio');
assert(preload.indexOf("renderer-v2lab.js")<preload.indexOf("renderer-audio-ux-lab29.js"),'La capa compacta debe cargarse después del renderer V2 existente');
assert(boot.includes("releaseV2AudioUxLab29")&&boot.includes('installReleaseV2AudioUxLab29'),'Bootstrap debe instalar la URL segura de referencias');
assert((pkg.build.files||[]).includes('src/**/*'),'Los nuevos assets src deben entrar en el Portable');

// Responsive solo por CSS: nunca reparenting provocado por resize.
assert(audioCss.includes('@media(max-width:1200px)'),'Audio debe conservar breakpoint CSS');
assert(!/addEventListener\(['"]resize['"][\s\S]{0,500}(appendChild|insertAdjacentElement|replaceChildren)/.test(audio),'Audio no debe mover nodos por resize');

console.log('check-v2lab-audio-ux-lab29: OK · UX compacta + referencias múltiples + voz por perfil + normalizador común');
