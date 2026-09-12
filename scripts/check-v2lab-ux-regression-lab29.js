'use strict';
const fs=require('fs');
const assert=require('assert');
const read=file=>fs.readFileSync(file,'utf8');

for(const file of [
  'src/renderer-emission-design-repair-lab29.js',
  'src/control-emission-design-repair-lab29.css',
  'src/control-audio-repair-lab29.css',
  'src/control-ux-cleanup-lab29.css',
  'src/renderer-ux-cleanup-lab29.js',
  'src/services/releaseV2UxRepairLab29.js'
])assert(fs.existsSync(file),`Falta ${file}`);

const designRepair=read('src/renderer-emission-design-repair-lab29.js');
const designRepairCss=read('src/control-emission-design-repair-lab29.css');
const outputCss=read('src/output.css');
const audio=read('src/renderer-audio-ux-lab29.js');
const audioRepairCss=read('src/control-audio-repair-lab29.css');
const cleanCss=read('src/control-ux-cleanup-lab29.css');
const cleanUi=read('src/renderer-ux-cleanup-lab29.js');
const autoUi=read('src/renderer-auto-ux-lab29.js');
const autoCss=read('src/control-auto-ux-lab29.css');
const release=read('src/services/releaseV2UxRepairLab29.js');
const boot=read('src/bootstrap-v2lab.js');

for(const js of [designRepair,audio,cleanUi,autoUi,release])assert.doesNotThrow(()=>new Function(js), 'Los suplementos UX deben parsear como JavaScript válido');

// Diseño de Nota: imagen -> degradado fullscreen -> texto. Nunca tarjeta detrás del titular/bajada.
assert(designRepair.includes("img.id='ecV2PreviewImage'")&&designRepair.includes("shade.id='ecV2NoteShade'"),'Repair debe crear imagen real y shade independiente');
assert(designRepair.includes("shade.style.background=`linear-gradient(transparent ${vertical?38:42}%"),'El degradado debe comenzar en 42% horizontal y 38% vertical');
assert(designRepair.includes("np.style.background='transparent'"),'El contenedor de texto Nota debe quedar transparente');
assert(/\.ec-v2-note-shade\{position:absolute;inset:0/.test(designRepairCss),'Shade debe ocupar todo el frame');
assert(/\.ec-v2-note-preview\{[^}]*background:transparent!important/s.test(designRepairCss),'CSS debe impedir que la Nota vuelva a convertirse en tarjeta');
assert(designRepair.includes("w=vertical?1080:1920,h=vertical?1920:1080"),'Preview debe trabajar en geometría real 1920x1080 / 1080x1920 antes de escalar');
assert(designRepair.includes("typeof effectiveImage==='function'")&&designRepair.includes("q('#designPreviewImg')"),'Preview debe reutilizar imagen efectiva/fallback cuando exista');
assert(outputCss.includes('#shade{position:absolute;inset:0;background:linear-gradient(transparent 42%,var(--lower-bg) 100%)'),'Output real debe conservar su degradado fullscreen');
assert(outputCss.includes('transparent 38%,var(--lower-bg) 100%'),'Output vertical debe conservar inicio de degradado 38%');

// Diseño compacto: Editando en cabecera y Transiciones 65/35 en una sola fila.
assert(designRepair.includes('ec-v2-editing-badge'),'Editando 16:9 debe convertirse en badge de cabecera');
assert(designRepair.includes('ec-v2-note-head-compact'),'Ajustes de Nota debe tener cabecera compacta');
assert(designRepair.includes('ec-v2-transition-grid'),'Transiciones debe agrupar sus dos controles en una sola fila');
assert(designRepairCss.includes('.ec-v2-note-head-compact')&&designRepairCss.includes('justify-content:space-between'),'Cabecera de Nota debe alinear título y formato en extremos');
assert(/\.ec-v2-transition-grid\{[^}]*grid-template-columns:minmax\(0,1\.85fr\) minmax\(120px,1fr\)/s.test(designRepairCss),'Transiciones debe usar proporción aproximada 65/35');

// Fondos/casillas: símbolos compactos y valor de opacidad contenido.
for(const symbol of ['■','▢','◐'])assert(designRepair.includes(`'${symbol}'`)||designRepair.includes(`>${symbol}<`),`Fondos y casillas debe restaurar símbolo ${symbol}`);
assert(designRepair.includes('ec-v2-opacity-control')&&designRepair.includes('ec-v2-opacity-value'),'Repair debe marcar el control de opacidad compacto');
assert(/\.ec-v2-opacity-value\{[^}]*white-space:nowrap!important/s.test(designRepairCss),'100% no debe poder partirse/desbordarse');
assert(designRepairCss.includes('grid-template-columns:22px minmax(72px,1fr) 76px'),'Opacidad debe reservar ancho estable para número + %');
assert(designRepair.includes("name.textContent='Degradado inferior'"),'La UI debe llamar Degradado inferior al fondo de Nota');

// Aprendizaje visible ec28: la capa final debe actuar sobre la lista realmente visible, no solo sobre la lista ec27 oculta.
assert(audio.includes("qa('#ec28LearningList .ec28-save')")&&audio.includes("qa('#ec28LearningList .ec28-delete')"),'Audio debe reparar las acciones del gestor ec28 visible');
assert(audio.includes("'Guardar corrección','ec28-icon-action'")&&audio.includes("'Eliminar pronunciación','ec28-icon-action'"),'Guardar/Eliminar visibles deben convertirse en iconos accesibles');
assert(audio.includes("new MutationObserver(compactLearningActions)")&&audio.includes("observe(l28,{childList:true,subtree:true})"),'Iconos deben reaplicarse después de refrescos del aprendizaje');
assert(audioRepairCss.includes('.ec28-icon-action')&&audioRepairCss.includes('font-size:0!important'),'CSS debe mostrar solo el símbolo en las acciones ec28');
assert(audio.includes("iconify(clear,'trash','Borrar aprendizaje'"),'Borrar aprendizaje debe ser una acción secundaria por papelera');

// Normalización común y controles específicos de motor.
assert(audio.includes('Prepara cifras, monedas, porcentajes, horas y puntuación antes de enviarlas al motor TTS activo.'),'La ayuda visible del normalizador debe ser neutral al motor');
assert(audio.includes('syncEngineSpecificControls'),'Audio UX debe controlar la visibilidad de opciones específicas del motor');
assert(audio.includes("showKokoro=engine==='kokoro'")&&audio.includes('initialAttackProtection'),'Protección de ataque debe mostrarse solo con Kokoro');
assert(audioRepairCss.includes('.ec29-engine-specific-hidden')&&audioRepairCss.includes('display:none!important'),'Controles específicos deben ocultarse realmente');
assert(audio.includes('Probar locución procesada'),'La prueba plegable debe describir el pipeline completo');
assert(audio.includes('TEXTO ENVIADO AL MOTOR TTS'),'Diagnóstico final debe ser genérico');
assert(audio.includes('speechDiagnostic0326')&&audio.includes('ec29-legacy-speech-diag-hidden'),'Diagnóstico Kokoro heredado debe quedar fuera de la UI final');
assert(audioRepairCss.includes('#speech0326.ec29-speech-flat'),'Locución ES-PE heredada debe integrarse sin tarjeta anidada');

// Jerarquía global y Contenidos/Anuncios en columnas independientes.
assert(cleanCss.includes('.tab>h1')&&cleanCss.includes('display:none!important'),'Los H1 redundantes deben ocultarse visualmente de forma global');
assert(cleanUi.includes("document.querySelectorAll('.tab>h1')")&&cleanUi.includes("style.setProperty('display','none','important')"),'La limpieza debe ocultar H1 también desde DOM para no depender solo de CSS inyectado');
assert(cleanCss.includes('.ec29-audio-subtitle')&&cleanCss.includes('display:none!important'),'Bajada genérica de Audio no debe consumir altura');
assert(cleanUi.includes('ec29CannedLeft')&&cleanUi.includes('ec29CannedRight'),'Contenidos debe crear dos pilas independientes');
assert(cleanUi.includes("const ads=q('#adsLibraryCard')")&&cleanUi.includes('move(ads,right)'),'Anuncios debe colocarse debajo de Contenidos disponibles en la derecha');
assert(cleanCss.includes('.ec29-canned-workspace')&&cleanCss.includes('grid-template-columns:minmax(0,1fr) minmax(0,1fr)'),'Contenidos debe usar dos columnas independientes en escritorio');
assert(cleanCss.includes('#cannedList')&&cleanCss.includes('#adsList')&&cleanCss.includes('overflow:auto'),'Bibliotecas deben usar scroll interno');
assert(cleanCss.includes('@media(max-width:1180px)'),'Layout Contenidos debe colapsar por CSS');
assert(!/addEventListener\(['"]resize['"][\s\S]{0,600}(appendChild|insertAdjacentElement|replaceChildren)/.test(cleanUi),'Limpieza UX no debe reparentar nodos al redimensionar');

// Automático: monitor limpio con controles existentes integrados; sin segunda autoridad.
assert(autoUi.includes('ecAutoMonitorControls'),'Automático debe crear una barra de control dentro del monitor');
for(const id of ['emissionStart','emissionPause','emissionResume','ec28EmissionNext','emissionStop'])assert(autoUi.includes(`q('#${id}')`),`Automático debe reutilizar ${id}`);
assert(autoUi.includes('syncEmissionControlState'),'Pausar/Reanudar deben alternarse según el estado real de emisión');
assert(autoUi.includes("pause.classList.toggle('hidden'")&&autoUi.includes("resume.classList.toggle('hidden'"),'Pausar/Reanudar deben ocupar el mismo espacio de forma contextual');
assert(!autoUi.includes("q('#emissionStart').onclick")&&!autoUi.includes("q('#emissionPause').onclick")&&!autoUi.includes("q('#emissionResume').onclick")&&!autoUi.includes("q('#ec28EmissionNext').onclick")&&!autoUi.includes("q('#emissionStop').onclick"),'Auto UX debe mover los botones existentes sin reemplazar sus listeners');
assert(autoCss.includes('.ec-auto-monitor-controls'),'Monitor debe tener estilos compactos para la botonera integrada');
assert(autoCss.includes('.ec-auto-emission-card-absorbed')&&autoCss.includes('display:none!important'),'La tarjeta Control de emisión separada debe desaparecer tras mover sus controles');
assert(autoCss.includes('.ec-auto-monitor-legacy-copy')&&autoCss.includes('display:none!important'),'Título/descripción redundantes del monitor deben quedar fuera de la vista');
assert(autoCss.includes('.ec-auto-icon-action'),'Pausar/Reanudar/Siguiente/Detener deben presentarse como controles por símbolo');

// Orden de carga: base de Diseño primero, reparaciones después; assets incluidos por src/**/*.
assert(boot.includes('releaseV2UxRepairLab29')&&boot.includes('installReleaseV2UxRepairLab29'),'Bootstrap debe instalar la capa de reparación');
assert(boot.indexOf('installReleaseV2EmissionDesign')<boot.indexOf('installReleaseV2UxRepairLab29'),'Repair debe instalarse después del renderer de Diseño V2');
for(const file of ['control-emission-design-repair-lab29.css','control-audio-repair-lab29.css','control-ux-cleanup-lab29.css','renderer-emission-design-repair-lab29.js','renderer-ux-cleanup-lab29.js'])assert(release.includes(file),`Release debe inyectar ${file}`);

console.log('check-v2lab-ux-regression-lab29: OK · Diseño compacto + degradado/WYSIWYG + Audio final + Contenidos columnas + títulos globales + monitor operativo');
