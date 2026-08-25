'use strict';
const fs=require('fs');
const assert=require('assert');
const read=p=>fs.readFileSync(p,'utf8');
const pkg=JSON.parse(read('package.json'));
const loader=read('src/services/version0319RendererLoader.js');
const policyText=read('src/services/version0323Policy.js');
const renderer=read('src/renderer-0323.js');
const {isSafePhoneticPair,contextualUs,isSimpleLowerSpanish,strongForeignSignal}=require('../src/services/version0323Policy');

assert.strictEqual(pkg.version,'0.3.23','La versión debe ser 0.3.23');
assert.strictEqual(pkg.build.appId,'pe.ec.automaticnews','No cambiar appId: conserva identidad técnica y datos existentes');
assert.strictEqual(pkg.build.productName,'EC Automatic News','El productName técnico se conserva para compatibilidad');
assert.ok(/^GEC-Automatic-News-Portable-/.test(pkg.build.artifactName),'El artefacto visible debe seguir usando GEC');
assert.ok(loader.includes("require('./version0323Policy').installVersion0323Policy()"),'El backend 0.3.23 debe cargarse');
assert.ok(loader.includes("r.src='renderer-0323.js'"),'La UI 0.3.23 debe cargarse después de 0.3.22');

assert.strictEqual(isSafePhoneticPair('lifestyle','estilo de vida'),false,'No se debe guardar una traducción como pronunciación');
assert.strictEqual(isSafePhoneticPair('US','dólares estadounidenses'),false,'US no puede aprender un significado global de moneda');
assert.strictEqual(isSafePhoneticPair('SHP','ese hache pe'),true,'Una sigla sí puede deletrearse fonéticamente');
assert.strictEqual(isSafePhoneticPair('Kuiper','Káiper'),true,'Una transliteración fonética de una palabra debe ser válida');
assert.ok(contextualUs('El gobierno de US anunció una medida.').includes('Estados Unidos'),'US con contexto de país debe resolverse como Estados Unidos');
assert.ok(contextualUs('La inversión fue de US$495 millones.').includes('US$495'),'US$ debe quedar para el normalizador monetario, no para la regla contextual');
assert.strictEqual(isSimpleLowerSpanish('proyecto'),true,'Proyecto debe filtrarse como falso candidato español');
assert.strictEqual(isSimpleLowerSpanish('lifestyle'),false,'Lifestyle debe seguir siendo candidato extranjero');
assert.strictEqual(strongForeignSignal('Byrne'),false,'Byrne se conserva por mayúscula/base, no por una señal artificial de y');

for(const token of ['posible traducción o cambio semántico','pronunciation-migration-v4-0.3.23.json','manualPronunciations','pronunciationBlockedTerms','learningList','replacementEntries','contextualRules'])assert.ok(policyText.includes(token),`Falta ${token} en política 0.3.23`);
for(const token of ['Gestionar aprendizaje','correcciones manuales quedan protegidas','pronunciationBlockedTerms','manualPronunciations','Claude verificador activo','Limpieza automática 0.3.23'])assert.ok(renderer.includes(token),`Falta ${token} en UI 0.3.23`);

console.log('GEC 0.3.23 checks OK · filtro de falsos candidatos · guard semántico · contexto US · aprendizaje editable');
