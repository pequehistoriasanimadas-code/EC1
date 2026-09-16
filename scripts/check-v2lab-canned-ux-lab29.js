'use strict';
const fs=require('fs');
const assert=require('assert');
const read=file=>fs.readFileSync(file,'utf8');

for(const file of ['src/renderer-canned-ux-lab29.js','src/control-canned-ux-lab29.css','src/services/releaseV2CannedRecoveryLab29.js']){
  assert(fs.existsSync(file),`Falta ${file}`);
}
const ui=read('src/renderer-canned-ux-lab29.js');
const css=read('src/control-canned-ux-lab29.css');
const release=read('src/services/releaseV2UxRepairLab29.js');
const recovery=read('src/services/releaseV2CannedRecoveryLab29.js');
const bootstrap=read('src/bootstrap-v2lab.js');
new Function(ui);new Function(recovery);

for(const id of ['ecCannedLibraryActions','ecAdsLibraryActions','ecCannedRulesRow','ecCannedRecoveryEnabled','ecCannedSelectionCard']){
  assert(ui.includes(id),`Falta ${id}`);
}
assert(ui.includes("q('#pickCannedFolder')?.closest('.buttons')"),'Debe mover los botones originales de carpeta de contenidos');
assert(ui.includes("q('#pickAdsFolder')?.closest('.buttons')"),'Debe mover los botones originales de carpeta de anuncios');
assert(ui.includes("q('#cannedEmergency')?.closest('.switch-row')"),'Debe reutilizar el switch original de respaldo');
assert(ui.includes("q('#cannedInterval')?.closest('label')"),'Debe reutilizar el selector original de frecuencia');
assert(ui.includes("b.textContent='Usar como respaldo'")||ui.includes('b.textContent="Usar como respaldo"'),'Debe usar el texto compacto “Usar como respaldo”');
assert(ui.includes("directText(interval,'Cada')")||ui.includes('directText(interval,"Cada")'),'Debe usar el texto compacto “Cada”');
assert(ui.includes("q('#ec27Selection')"),'Debe conservar la selección/próximo contenido existente');
assert(ui.includes('Autonomía objetivo para recuperación'),'Debe ocultar el control legado de autonomía en minutos si aún existe');
assert(release.includes("injectFile(win,'control-canned-ux-lab29.css','css')"),'Debe inyectar CSS de Contenidos/Anuncios');
assert(release.includes("injectFile(win,'renderer-canned-ux-lab29.js','js')"),'Debe inyectar JS de Contenidos/Anuncios');

assert(recovery.includes('recoveryEnabled=settings.canned.recoveryEnabled!==false'),'Los perfiles deben normalizar recuperación de reserva por defecto');
assert(recovery.includes('bufferReady'),'La recuperación debe tomar como objetivo el número de noticias de Automático');
assert(recovery.includes("return'recovery'"),'La política debe poder activar recuperación por reserva baja');
assert(recovery.includes("if(!hasReady&&c.emergency!==false)return'emergency'"),'El respaldo sin noticias debe seguir siendo una regla independiente');
const reserve=(recovery.match(/function reserveRecoveryState\([^]*?\n\}/)||[])[0]||'';
assert(reserve.includes('targetReady')&&reserve.includes('deficitNotes'),'La selección adaptativa debe derivar el déficit del objetivo de noticias');
assert(!reserve.includes('targetAutonomyMin'),'La recuperación ya no debe depender de un objetivo manual en minutos');
assert(bootstrap.includes("require('./services/releaseV2CannedRecoveryLab29').installReleaseV2CannedRecoveryLab29()"),'V2 Lab debe instalar la política de recuperación por cantidad de noticias');

assert(css.includes('#ecCannedRulesRow'),'Debe existir layout compacto para respaldo + frecuencia');
assert(css.includes('#ecCannedAvailableCard')&&css.includes('#adsLibraryCard'),'Contenidos y Anuncios deben compartir lenguaje visual');
assert(css.includes('.ec-canned-library-head'),'Las dos bibliotecas deben tener cabecera consistente');

console.log('check-v2lab-canned-ux-lab29: OK · bibliotecas compactas + recuperación anclada a noticias');
