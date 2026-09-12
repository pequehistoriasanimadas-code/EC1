'use strict';
const fs=require('fs');
const assert=require('assert');
const read=file=>fs.readFileSync(file,'utf8');

const designUi=read('src/renderer-emission-design-v2.js');
const designCss=read('src/control-emission-design-v2.css');
const outputCss=read('src/output.css');
const r26=read('src/renderer-0326.js');
const r28=read('src/renderer-0328.js');
const audio=read('src/renderer-audio-ux-lab29.js');
const audioCss=read('src/control-audio-ux-lab29.css');
const preload=read('src/preload.js');

// Diseño de Nota: imagen -> degradado fullscreen -> texto. Nunca tarjeta detrás del titular/bajada.
assert(designUi.includes('id="ecV2PreviewImage"'),'Preview V2 debe usar una imagen real/fallback');
assert(designUi.includes('id="ecV2NoteShade"'),'Preview V2 debe tener una capa de degradado independiente');
assert(designUi.includes("q('#ecV2NoteShade')"),'Renderer debe controlar la capa de degradado');
assert(designUi.includes('transparent ${format===\'9:16\'?38:42}%'),'El degradado debe comenzar en 42% horizontal y 38% vertical');
assert(!designUi.includes('np.style.background=rgba(n.lowerBgColor'),'El fondo inferior no puede aplicarse al contenedor de texto');
assert(/\.ec-v2-note-shade\s*\{[^}]*position:absolute[^}]*inset:0/s.test(designCss),'Shade V2 debe ocupar todo el frame');
assert(/\.ec-v2-note-preview\s*\{[^}]*background:transparent/s.test(designCss),'Contenedor de texto Nota debe ser transparente');
assert(outputCss.includes('#shade{position:absolute;inset:0;background:linear-gradient(transparent 42%,var(--lower-bg) 100%)'),'Output real debe conservar su degradado fullscreen');
assert(outputCss.includes('transparent 38%,var(--lower-bg) 100%'),'Output vertical debe conservar inicio de degradado 38%');

// Fondos/casillas: símbolos compactos y valor de opacidad contenido.
for(const symbol of ['■','▢','◐'])assert(designUi.includes(symbol),`Fondos y casillas debe restaurar símbolo ${symbol}`);
assert(designUi.includes('ec-v2-opacity-control')&&designUi.includes('ec-v2-opacity-value'),'Opacidad debe tener control compacto propio');
assert(/\.ec-v2-opacity-value\s*\{[^}]*white-space:nowrap/s.test(designCss),'100% no debe poder partirse/desbordarse');
assert(!/\.ec-v2-bg-item\{[^}]*minmax\(180px,1\.6fr\)/s.test(designCss),'Fondos/casillas no debe forzar un grid anidado demasiado ancho');

// Aprendizaje visible (ec28): iconos directos, no transformación tardía de botones de texto.
assert(r28.includes('aria-label="Guardar corrección"')&&r28.includes('title="Guardar corrección"'),'Fila visible ec28 debe crear Guardar como icono accesible');
assert(r28.includes('aria-label="Eliminar pronunciación"')&&r28.includes('title="Eliminar pronunciación"'),'Fila visible ec28 debe crear Eliminar como icono accesible');
assert(r28.includes('ec28-icon-action'),'Renderer visible debe usar clase de acción por icono');
assert(!r28.includes('class="ec28-save" ${draft.dirty?\'\':\'disabled\'}>Guardar corrección</button>'),'Guardar visible no puede nacer como botón de texto');
assert(!r28.includes('class="ec28-delete dark">Eliminar</button>'),'Eliminar visible no puede nacer como botón de texto');
assert(audioCss.includes('.ec28-icon-action'),'CSS Audio debe estilizar los iconos ec28 directamente');

// Normalización común y controles específicos de motor.
assert(!r26.includes('solo para Kokoro'),'La ayuda del normalizador debe ser neutral al motor TTS');
assert(audio.includes('syncEngineSpecificControls'),'Audio UX debe controlar la visibilidad de opciones específicas del motor');
assert(audio.includes("engine==='kokoro'")&&audio.includes('initialAttackProtection'),'Protección de ataque debe mostrarse solo con Kokoro');
assert(audio.includes('Probar locución procesada'),'La prueba plegable debe describir el pipeline completo');
assert(audio.includes('TEXTO ENVIADO AL MOTOR TTS'),'Diagnóstico final debe ser genérico');

// Jerarquía global y Contenidos/Anuncios en columnas independientes.
for(const file of ['src/control-ux-cleanup-lab29.css','src/renderer-ux-cleanup-lab29.js'])assert(fs.existsSync(file),`Falta ${file}`);
const cleanCss=fs.existsSync('src/control-ux-cleanup-lab29.css')?read('src/control-ux-cleanup-lab29.css'):'';
const cleanUi=fs.existsSync('src/renderer-ux-cleanup-lab29.js')?read('src/renderer-ux-cleanup-lab29.js'):'';
assert(cleanCss.includes('.tab>h1')&&cleanCss.includes('display:none'),'Los H1 redundantes deben ocultarse visualmente de forma global');
assert(cleanUi.includes('ec29CannedLeft')&&cleanUi.includes('ec29CannedRight'),'Contenidos debe crear dos pilas independientes');
assert(cleanUi.includes("q('#adsLibraryCard')")&&cleanUi.includes('right.appendChild'),'Anuncios debe colocarse debajo de Contenidos disponibles en la derecha');
assert(cleanCss.includes('.ec29-canned-workspace')&&cleanCss.includes('grid-template-columns:minmax(0,1fr) minmax(0,1fr)'),'Contenidos debe usar dos columnas independientes en escritorio');
assert(cleanCss.includes('#cannedList')&&cleanCss.includes('#adsList')&&cleanCss.includes('overflow:auto'),'Bibliotecas deben usar scroll interno');
assert(cleanCss.includes('@media(max-width:1180px)'),'Layout Contenidos debe colapsar por CSS');
assert(preload.includes('control-ux-cleanup-lab29.css')&&preload.includes('renderer-ux-cleanup-lab29.js'),'Preload debe cargar la limpieza UX global');
assert(!/addEventListener\(['"]resize['"][\s\S]{0,600}(appendChild|insertAdjacentElement|replaceChildren)/.test(cleanUi),'Limpieza UX no debe reparentar nodos al redimensionar');

console.log('check-v2lab-ux-regression-lab29: OK · degradado/WYSIWYG + controles compactos + Audio final + Contenidos columnas + títulos globales');
