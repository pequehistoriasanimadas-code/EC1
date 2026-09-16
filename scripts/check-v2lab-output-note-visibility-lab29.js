'use strict';
const fs=require('fs');
const assert=require('assert');
const design=require('../src/services/emissionDesignLab29');

const output=fs.readFileSync('src/output.js','utf8');
const output0324=fs.readFileSync('src/output-0324.js','utf8');
const localHtml=fs.readFileSync('src/output.html','utf8');
const webHtml=fs.readFileSync('src/output-web.html','utf8');

function bodyBetween(source,start,end){
  const a=source.indexOf(start);assert(a>=0,`Falta ${start}`);
  const b=source.indexOf(end,a+start.length);assert(b>a,`Falta límite ${end}`);
  return source.slice(a,b);
}

// El modelo normalizado ya expone la visibilidad legacy que consume el Output.
const root=design.normalizeNoteDesignRoot(null,{format:'16:9'});
root.formats['16:9'].visibility={category:false,date:false,exclusive:false};
const effective=design.materializeEffectiveOutput({format:'16:9',noteDesign:root,exclusiveEnabled:true});
assert.strictEqual(effective.categoryVisible,false);
assert.strictEqual(effective.dateVisible,false);
assert.strictEqual(effective.exclusiveBadgeVisible,false);
assert.strictEqual(effective.exclusiveEnabled,true,'Ocultar el badge no debe alterar la semántica editorial');

// Output maestro: applyDesign debe obedecer los flags visuales inmediatamente.
const applyDesign=bodyBetween(output,'function applyDesign(next={}){','function preload(');
assert(applyDesign.includes('categoryVisible'),'Output debe aplicar categoryVisible');
assert(applyDesign.includes('dateVisible'),'Output debe aplicar dateVisible');
assert(/cat\.(?:style\.display|classList\.toggle)/.test(applyDesign),'Output debe ocultar/mostrar Categoría en el DOM');
assert(/pubDate\.(?:style\.display|classList\.toggle)/.test(applyDesign),'Output debe ocultar/mostrar Fecha en el DOM');

// La transición noticia -> noticia crea un snapshot independiente: también debe respetar visibilidad.
const snapshot=bodyBetween(output,'function makeStorySnapshot(){','async function revealStoryFromStory');
assert(snapshot.includes('categoryVisible'),'Snapshot debe respetar categoryVisible');
assert(snapshot.includes('dateVisible'),'Snapshot debe respetar dateVisible');

// Exclusivo es visibilidad gráfica separada de exclusiveEnabled.
const setStoryPatch=bodyBetween(output0324,'setStoryContent=async function(p){','const baseSnapshot=makeStorySnapshot');
assert(setStoryPatch.includes('exclusiveBadgeVisible'),'Output exclusivo debe respetar exclusiveBadgeVisible');
assert(setStoryPatch.includes('exclusiveEnabled'),'Output exclusivo debe conservar la elegibilidad editorial');
const apply0324=bodyBetween(output0324,'applyDesign=function(next={}){','transitionEnabled=function()');
assert(apply0324.includes('exclusiveBadgeVisible'),'Cambiar diseño en vivo debe poder ocultar el badge Exclusivo');

// La corrección está en los scripts base compartidos por Output local/NDI y LAN, no en una vista aislada.
for(const [name,html] of [['local',localHtml],['LAN',webHtml]]){
  assert(html.includes('output.js'),`${name}: debe cargar output.js`);
  assert(html.includes('output-0324.js'),`${name}: debe cargar output-0324.js`);
}

console.log('Output Note visibility Lab29 regression gate: OK');
