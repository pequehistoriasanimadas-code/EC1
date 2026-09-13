'use strict';
const fs=require('fs');
const assert=require('assert');
const read=file=>fs.readFileSync(file,'utf8');

const renderer=read('src/renderer-settings-ux-lab29.js');
const css=read('src/control-settings-ux-lab29.css');
const release=read('src/services/releaseV2UxRepairLab29.js');
const finalGate=read('scripts/check-v2lab-final-ui-stability-lab29.js');

assert.doesNotThrow(()=>new Function(renderer),'renderer-settings-ux-lab29.js debe parsear');
assert(renderer.includes('ec29SettingsWorkspace'),'Ajustes debe crear un workspace dedicado');
assert(renderer.includes('ec29SettingsLeft')&&renderer.includes('ec29SettingsRight'),'Ajustes debe mantener dos columnas lógicas');
assert(renderer.includes("q('#feeds')")&&renderer.includes("q('#addFeed')"),'Fuentes debe reutilizar la lista y el botón originales');
assert(renderer.includes("q('#globalPartialClose')")&&renderer.includes("q('#globalExclusiveClose')"),'Fuentes debe conservar ambos cierres');
assert(!renderer.includes("querySelectorAll('.feedrow')"),'La capa UX no debe reconstruir ni manipular tarjetas feedrow');
assert(renderer.includes("q('#queueColorExclusive')"),'Apariencia debe conservar el color de exclusivos');
assert(renderer.includes('syncLocalBackupPolicy'),'IA local debe tener política de respaldo condicional');
assert(renderer.includes("backups.includes('local')")&&renderer.includes("primary!=='local'"),'La política de respaldo solo debe mostrarse cuando local sea backup real');
assert(renderer.includes('ec29LegacyEditorialHidden'),'Redacción/Prompt legacy deben ocultarse sin destruir nodos');
assert(renderer.indexOf("right.appendChild(localCard)")>=0,'IA local debe añadirse a la derecha');
assert(renderer.indexOf("right.appendChild(serviceCard)")>renderer.indexOf("right.appendChild(localCard)"),'Servicio IA debe quedar debajo de IA local');
assert(renderer.indexOf("right.appendChild(providersCard)")>renderer.indexOf("right.appendChild(serviceCard)"),'Proveedores deben quedar debajo de Servicio IA');
assert(css.includes('grid-template-columns:minmax(0,1fr) minmax(0,1fr)'),'Ajustes debe mantener dos columnas equilibradas');
assert(css.includes('#ec29SettingsServiceGrid')&&css.includes('repeat(3'),'Servicio IA debe usar tres columnas');
assert(css.includes('#ec29SettingsProvidersGrid')&&css.includes('repeat(2'),'Claude y Gemini deben ir en paralelo');
assert(css.includes('#ec29SettingsQueueCard .queue-colors')&&css.includes('repeat(6'),'Apariencia debe mostrar seis colores de forma compacta');
assert(css.includes('@media(max-width:980px)'),'El colapso responsive debe quedar por debajo del mínimo normal de la app');
assert(!/addEventListener\(['"]resize['"][\s\S]{0,500}(appendChild|insertAdjacentElement|replaceChildren)/.test(renderer),'Ajustes no debe reparentar por resize');
assert(!css.includes('.feedrow{')&&!css.includes('.feed-head{')&&!css.includes('.feed-edit{')&&!css.includes('.feed-list-scroll{'),'El CSS nuevo no debe alterar el diseño original de Fuentes');
assert(release.includes("control-settings-ux-lab29.css")&&release.includes("renderer-settings-ux-lab29.js"),'La capa UX debe inyectarse desde releaseV2UxRepairLab29');
assert(finalGate.includes("require('./check-v2lab-settings-ux-lab29.js')"),'El diagnóstico Lab29 debe ejecutar el contrato de Ajustes');

console.log('check-v2lab-settings-ux-lab29: OK · layout, fuentes, IA local, proveedores y colores protegidos');
