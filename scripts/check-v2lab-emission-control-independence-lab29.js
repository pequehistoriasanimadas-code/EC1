'use strict';
const fs=require('fs');
const assert=require('assert');

const ui=fs.readFileSync('src/renderer-emission-design-v2.js','utf8');
const css=fs.readFileSync('src/control-emission-design-v2.css','utf8');

function bodyBetween(start,end){
  const a=ui.indexOf(start);assert(a>=0,`Falta ${start}`);
  const b=ui.indexOf(end,a+start.length);assert(b>a,`Falta límite ${end}`);
  return ui.slice(a,b);
}

// Ocultar un elemento controla solamente su presencia en Output/Preview. El editor debe
// seguir siendo editable para preparar fuente, tamaño, color y fondo antes de volver a mostrarlo.
const typeDisabled=(css.match(/\.ec-v2-type-row\.ec-v2-disabled[^\{]*\{([^}]*)\}/)||[])[1]||'';
const bgDisabled=(css.match(/\.ec-v2-bg-item\.ec-v2-disabled[^\{]*\{([^}]*)\}/)||[])[1]||'';
assert(typeDisabled,'Debe existir estado visual para metadata oculta');
assert(bgDisabled,'Debe existir estado visual para casillas ocultas');
assert(!/pointer-events\s*:\s*none/i.test(typeDisabled),'Ocultar metadata no debe bloquear sus controles tipográficos');
assert(!/pointer-events\s*:\s*none/i.test(bgDisabled),'Ocultar una casilla no debe bloquear sus selectores de color/radio/opacidad');

const bindings=bodyBetween('function bindUi(){','function hydrateFonts()');
assert(!/\.disabled\s*=\s*true|setAttribute\(\s*['"]disabled['"]/i.test(bindings),'Ninguna opción de Diseño debe deshabilitar controles hermanos por JavaScript');
const visibilityHandler=(bindings.match(/if\(visible\)visible\.onchange=e=>\{([\s\S]*?)\};/)||[])[1]||'';
assert(visibilityHandler,'Debe existir handler de visibilidad');
assert(visibilityHandler.includes('note().visibility'),'Visibilidad debe modificar solo el mapa de visibilidad de Nota');
assert(visibilityHandler.includes('syncNoteVisibilityUi'),'Visibilidad debe refrescar únicamente su propia fila');
assert(!visibilityHandler.includes('hydrateNote()'),'Ocultar metadata no debe rehidratar todas las fuentes, tamaños y colores');
assert(!visibilityHandler.includes('youtubePromoDesign')&&!visibilityHandler.includes('promo()'),'Ocultar metadata de Nota no debe tocar Promo YouTube');
assert(!visibilityHandler.includes('setMode'),'Ocultar metadata no debe cambiar Nota/Promo');

const upperHandler=(bindings.match(/upper\.onclick=\(\)=>\{([\s\S]*?)\};/)||[])[1]||'';
assert(upperHandler,'Debe existir handler de mayúsculas');
assert(!upperHandler.includes('hydrateNote()'),'Mayúsculas debe actualizar solo su botón, no rehidratar todo el editor');

// Importar/eliminar una fuente es una operación exclusiva de tipografías de Nota. Promo
// YouTube no tiene familia tipográfica personalizada y no debe cambiar de modo ni geometría.
const customFonts=bodyBetween('function renderCustomFonts(){','async function load(){');
assert(customFonts.includes('window.ECAPI.deleteFont'),'Debe conservar eliminación de fuente');
assert(customFonts.includes('state.visual.output.noteDesign'),'La sustitución de una fuente eliminada debe limitarse a noteDesign');
assert(customFonts.includes('hydrateFonts()'),'Eliminar una fuente debe refrescar solo listas de fuentes');
assert(!customFonts.includes('hydrateNote()'),'Eliminar una fuente no debe rehidratar todo el editor de Nota');
assert(!customFonts.includes('youtubePromoDesign'),'Eliminar fuente no debe modificar el diseño de Promo YouTube');
assert(!customFonts.includes('hydratePromo'),'Eliminar fuente no debe rehidratar Promo YouTube');
assert(!customFonts.includes('setMode'),'Eliminar fuente no debe cambiar el modo Nota/Promo');

const importHandler=(bindings.match(/q\('#ecV2ImportFont'\)\.onclick=async\(\)=>\{([\s\S]*?)\};/)||[])[1]||'';
assert(importHandler,'Debe existir importación de fuente');
assert(importHandler.includes('hydrateFonts()'),'Importar fuente debe refrescar solo las listas de fuente');
assert(!importHandler.includes('hydrateNote()'),'Importar fuente no debe rehidratar todo el editor');

// Guías seguras son solo visuales. TikTok Safe sí puede recalcular geometría Promo en 9:16,
// pero mostrar/ocultar guías no debe rehidratar ni Nota ni Promo.
assert(!bindings.includes("for(const id of ['tiktokSafe','showSafeGuides'])"),'TikTok Safe y guías deben tener handlers independientes');
const guidesStart=bindings.indexOf("q('#showSafeGuides')");
assert(guidesStart>=0,'Guías seguras deben tener handler propio');
const guidesChunk=bindings.slice(guidesStart,guidesStart+420);
assert(!guidesChunk.includes('hydratePromo'),'Mostrar/ocultar guías no debe rehidratar Promo YouTube');
assert(!guidesChunk.includes('hydrateNote'),'Mostrar/ocultar guías no debe rehidratar Nota');
assert(!/disabled\s*=|setAttribute\(\s*['"]disabled['"]/i.test(guidesChunk),'Guías no deben deshabilitar otros controles');

// Cambiar de modo solo muestra/oculta paneles; jamás reemplaza datos del otro modo.
const setMode=bodyBetween('function setMode(','function touch(');
assert(!setMode.includes('noteDesign='),'Cambiar Nota/Promo no debe reemplazar noteDesign');
assert(!setMode.includes('youtubePromoDesign='),'Cambiar Nota/Promo no debe reemplazar youtubePromoDesign');
assert(!/disabled\s*=|setAttribute\(\s*['"]disabled['"]/i.test(setMode),'Cambiar Nota/Promo no debe deshabilitar controles del editor');

console.log('Emission Design Lab29 control-independence regression gate: OK');
