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
// seguir siendo editable para poder preparar fuente, tamaño y color antes de volver a mostrarlo.
const typeDisabled=(css.match(/\.ec-v2-type-row\.ec-v2-disabled[^\{]*\{([^}]*)\}/)||[])[1]||'';
const bgDisabled=(css.match(/\.ec-v2-bg-item\.ec-v2-disabled[^\{]*\{([^}]*)\}/)||[])[1]||'';
assert(typeDisabled,'Debe existir estado visual para metadata oculta');
assert(bgDisabled,'Debe existir estado visual para casillas ocultas');
assert(!/pointer-events\s*:\s*none/i.test(typeDisabled),'Ocultar metadata no debe bloquear sus controles tipográficos');
assert(!/pointer-events\s*:\s*none/i.test(bgDisabled),'Ocultar una casilla no debe bloquear sus selectores de color/radio/opacidad');

const bindings=bodyBetween('function bindControls(){','function hydrateFonts()');
const visibilityHandler=(bindings.match(/if\(visible\)visible\.onchange=e=>\{([\s\S]*?)\};/)||[])[1]||'';
assert(visibilityHandler,'Debe existir handler de visibilidad');
assert(!visibilityHandler.includes('hydrateNote()'),'Cambiar visibilidad no debe rehidratar todas las fuentes/colores del editor');
assert(visibilityHandler.includes('syncNoteVisibilityUi'),'Visibilidad debe sincronizar únicamente la fila afectada');

// Safe guides son puramente de preview. TikTok Safe puede normalizar geometría Promo, pero
// ambos controles no deben compartir un handler que rehidrate Promo innecesariamente.
assert(!bindings.includes("for(const id of ['tiktokSafe','showSafeGuides'])"),'TikTok Safe y guías deben tener handlers independientes');
const guidesHandler=(bindings.match(/showSafeGuides[\s\S]{0,260}?addEventListener\('change',[\s\S]{0,420}?\);/)||[])[0]||'';
assert(guidesHandler,'Guías seguras deben tener handler propio');
assert(!guidesHandler.includes('hydratePromo'),'Mostrar/ocultar guías no debe rehidratar Promo YouTube');
assert(!guidesHandler.includes('hydrateNote'),'Mostrar/ocultar guías no debe rehidratar Nota');

// Importar/eliminar una fuente pertenece a Nota. Debe refrescar solo las listas de fuente;
// nunca debe rehidratar Promo ni reconstruir todo el editor de Nota.
const customFonts=bodyBetween('function renderCustomFonts(){','async function load(){');
assert(customFonts.includes('window.ECAPI.deleteFont'),'Debe conservar eliminación de fuente');
assert(!customFonts.includes('youtubePromoDesign'),'Eliminar fuente no debe modificar el diseño de Promo YouTube');
assert(!customFonts.includes('hydratePromo'),'Eliminar fuente no debe rehidratar Promo YouTube');
assert(!customFonts.includes('hydrateNote()'),'Eliminar fuente no debe rehidratar todo el editor de Nota');
assert(customFonts.includes('hydrateFonts()'),'Eliminar fuente debe refrescar únicamente los selectores de fuentes');

const importHandler=(bindings.match(/q\('#ecV2ImportFont'\)\.onclick=async\(\)=>\{([\s\S]*?)\};/)||[])[1]||'';
assert(importHandler,'Debe existir importación de fuente');
assert(!importHandler.includes('hydrateNote()'),'Importar fuente no debe rehidratar todo el editor');
assert(importHandler.includes('hydrateFonts()'),'Importar fuente debe refrescar únicamente los selectores de fuentes');

// Cambiar de modo solo muestra/oculta paneles; jamás debe alterar los datos del otro modo.
const setMode=bodyBetween('function setMode(','function renderPreview');
assert(!setMode.includes('noteDesign='),'Cambiar Nota/Promo no debe reemplazar noteDesign');
assert(!setMode.includes('youtubePromoDesign='),'Cambiar Nota/Promo no debe reemplazar youtubePromoDesign');

console.log('Emission Design Lab29 control-independence regression gate: OK');
