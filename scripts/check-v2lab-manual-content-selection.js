'use strict';

const fs=require('fs');
const path=require('path');
const assert=require('assert');

const root=path.join(__dirname,'..');
const renderer=fs.readFileSync(path.join(root,'src','renderer-0327.js'),'utf8');

assert(renderer.includes("s?.canned?.manualContent"), 'RED: Próximo contenido / selección debe priorizar canned.manualContent');
assert(renderer.includes("Programado como próximo"), 'RED: la tarjeta debe identificar explícitamente la selección manual');
assert(renderer.includes("Contenidos desactivados"), 'RED: la tarjeta debe avisar cuando existe selección manual pero Contenidos está OFF');
assert(renderer.includes("Cancelar próximo"), 'RED: la tarjeta debe permitir cancelar la selección manual desde Próximo contenido / selección');
assert(renderer.includes("cannedCancelSpecific"), 'RED: cancelar desde la tarjeta debe reutilizar la acción de cancelación específica');

console.log('manual content selection UI contract: OK');
