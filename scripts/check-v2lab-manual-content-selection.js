'use strict';

const fs=require('fs');
const path=require('path');
const assert=require('assert');

const root=path.join(__dirname,'..');
const renderer=fs.readFileSync(path.join(root,'src','renderer-0332.js'),'utf8');
const engine=fs.readFileSync(path.join(root,'src','services','release0331.js'),'utf8');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));

assert(engine.includes('manualContent:m?{...m}:null'), 'backend snapshot must expose top-level manualContent');
assert(renderer.includes('snapshot?.manualContent'), 'Próximo contenido / selección debe priorizar snapshot.manualContent');
assert(renderer.includes('Programado como próximo'), 'la tarjeta debe identificar explícitamente la selección manual');
assert(renderer.includes('Contenidos desactivados'), 'la tarjeta debe avisar cuando existe selección manual pero Contenidos está OFF');
assert(renderer.includes('Cancelar próximo'), 'la tarjeta debe permitir cancelar la selección manual desde Próximo contenido / selección');
assert(renderer.includes('cannedCancelSpecific'), 'cancelar desde la tarjeta debe reutilizar la acción de cancelación específica');
assert(renderer.includes("manualContent?.name"), 'al reemplazar A por B la tarjeta debe tomar siempre el nombre del snapshot actual');
assert((pkg.build.files||[]).includes('scripts/check-v2lab-manual-content-selection.js'),'el paquete debe incluir la regresión nueva porque el gate empaquetado la requiere');

console.log('manual content selection UI contract: OK');
