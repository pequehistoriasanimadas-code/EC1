'use strict';
const fs=require('fs');
const assert=require('assert');
const read=file=>fs.readFileSync(file,'utf8');

for(const file of ['src/renderer-canned-ux-lab29.js','src/control-canned-ux-lab29.css']){
  assert(fs.existsSync(file),`Falta ${file}`);
}
const ui=read('src/renderer-canned-ux-lab29.js');
const css=read('src/control-canned-ux-lab29.css');
const release=read('src/services/releaseV2UxRepairLab29.js');
const settings=read('src/services/settings.js');
const policy=read('src/services/version0328Policy.js');
new Function(ui);

for(const id of ['ecCannedLibraryActions','ecAdsLibraryActions','ecCannedRulesRow','ecCannedRecoveryEnabled','ecCannedSelectionCard']){
  assert(ui.includes(id),`Falta ${id}`);
}
assert(ui.includes("q('#pickCannedFolder')?.closest('.buttons')"),'Debe mover los botones originales de carpeta de contenidos');
assert(ui.includes("q('#pickAdsFolder')?.closest('.buttons')"),'Debe mover los botones originales de carpeta de anuncios');
assert(ui.includes("q('#cannedEmergency')?.closest('.switch-row')"),'Debe reutilizar el switch original de respaldo');
assert(ui.includes("q('#cannedInterval')?.closest('label')"),'Debe reutilizar el selector original de frecuencia');
assert(ui.includes("b.textContent='Usar como respaldo'")||ui.includes('b.textContent="Usar como respaldo"'),'Debe usar el texto compacto “Usar como respaldo”');
assert(ui.includes("textContent='Cada'")||ui.includes("textContent='Cada '"),'Debe usar el texto compacto “Cada”');
assert(ui.includes("q('#ec27Selection')"),'Debe conservar la selección/próximo contenido existente');
assert(ui.includes('Autonomía objetivo para recuperación'),'Debe ocultar el control legado de autonomía en minutos si aún existe');
assert(release.includes("injectFile(win,'control-canned-ux-lab29.css','css')"),'Debe inyectar CSS de Contenidos/Anuncios');
assert(release.includes("injectFile(win,'renderer-canned-ux-lab29.js','js')"),'Debe inyectar JS de Contenidos/Anuncios');

assert(settings.includes('recoveryEnabled:true'),'Los perfiles nuevos deben activar recuperación de reserva por defecto');
assert(policy.includes('recoveryEnabled'),'La política 0.3.28 debe respetar el switch de recuperación');
assert(policy.includes('bufferReady'),'La recuperación debe tomar como objetivo el número de noticias de Automático');
const adaptive=(policy.match(/function adaptiveReservation\([^]*?\n\}/)||[])[0]||'';
assert(adaptive.includes('bufferReady'),'La selección adaptativa debe derivar el déficit del objetivo de noticias');
assert(!adaptive.includes('targetAutonomyMin'),'La selección adaptativa ya no debe depender de un objetivo manual en minutos');

assert(css.includes('#ecCannedRulesRow'),'Debe existir layout compacto para respaldo + frecuencia');
assert(css.includes('#ecCannedAvailableCard')&&css.includes('#adsLibraryCard'),'Contenidos y Anuncios deben compartir lenguaje visual');
assert(css.includes('.ec-canned-library-head'),'Las dos bibliotecas deben tener cabecera consistente');

console.log('check-v2lab-canned-ux-lab29: OK · bibliotecas compactas + recuperación anclada a noticias');
