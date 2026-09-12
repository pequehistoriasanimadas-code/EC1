'use strict';

const fs=require('fs');
const path=require('path');
const assert=require('assert');

const root=path.join(__dirname,'..');
const renderer=fs.readFileSync(path.join(root,'src','renderer-0332.js'),'utf8');
const engine=fs.readFileSync(path.join(root,'src','services','release0331.js'),'utf8');

assert(engine.includes('manualContent:m?{...m}:null'), 'backend snapshot must expose top-level manualContent');
assert(renderer.includes('snapshot?.manualContent'), 'RED: Próximo contenido / selección debe priorizar snapshot.manualContent');
assert(renderer.includes('Programado como próximo'), 'RED: la tarjeta debe identificar explícitamente la selección manual');
assert(renderer.includes('Contenidos desactivados'), 'RED: la tarjeta debe avisar cuando existe selección manual pero Contenidos está OFF');
assert(renderer.includes('Cancelar próximo'), 'RED: la tarjeta debe permitir cancelar la selección manual desde Próximo contenido / selección');
assert(renderer.includes('cannedCancelSpecific'), 'RED: cancelar desde la tarjeta debe reutilizar la acción de cancelación específica');
assert(renderer.includes("manualContent?.name"), 'RED: al reemplazar A por B la tarjeta debe tomar siempre el nombre del snapshot actual');

console.log('manual content selection UI contract: OK');
