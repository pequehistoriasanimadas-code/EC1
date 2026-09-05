'use strict';
const fs=require('fs');
const assert=require('assert');
const read=p=>fs.readFileSync(p,'utf8');
const pkg=JSON.parse(read('package.json'));
const policy=read('src/services/version0322Policy.js');
const renderer=read('src/renderer-0322.js');
const loader=read('src/services/version0319RendererLoader.js');
const main=read('src/main.js');

assert.strictEqual(pkg.version,'0.3.22','La versión debe ser 0.3.22');
assert.strictEqual(pkg.build.appId,'pe.ec.automaticnews','No cambiar appId: conserva identidad técnica y datos existentes');
assert.strictEqual(pkg.build.productName,'EC Automatic News','El productName técnico se conserva para compatibilidad del portable');
assert.ok(/^GEC-Automatic-News-Portable-/.test(pkg.build.artifactName)||/^GEC-V2\.0-TTS-Lab-/.test(pkg.build.artifactName),'El artefacto visible debe usar GEC o la identidad explícita V2 TTS Lab');
assert.ok(main.includes("'EC Automatic News Data'"),'Debe conservarse la carpeta de datos existente');

assert.ok(policy.includes('optimized-profile-change'),'Falta reinicio del worker al cambiar el perfil optimizado');
assert.ok(policy.includes("resourceMode:'performance'"),'Falta protección del perfil de voz optimizado');
assert.ok(policy.includes("pronunciationClaudeVerify!==false"),'Claude debe respetar el interruptor real de pronunciación');
assert.ok(policy.includes('pronunciationMaxSeconds'),'Debe respetarse el tiempo máximo real de pronunciación');
assert.ok(!policy.includes('pronunciationClaudeVerify:false'),'0.3.22 no debe desactivar Claude silenciosamente');
assert.ok(policy.includes('confidence<.65'),'Debe conservarse el umbral de aprendizaje confirmado por Claude');
assert.ok(policy.includes('confidence<.88'),'Debe conservarse el umbral local conservador');

assert.ok(loader.includes("require('./version0322Policy').installVersion0322Policy()"),'El backend 0.3.22 debe cargarse');
assert.ok(loader.includes("q.src='renderer-0322.js'"),'La UI 0.3.22 debe cargarse después de 0.3.21');
assert.ok(renderer.includes('GEC Automatic News'),'Falta branding GEC');
assert.ok(renderer.includes('Diseñado por Carls Mayo'),'Falta crédito de diseño');
assert.ok(renderer.includes("label.style.display='none'"),'Uso de recursos debe salir del flujo normal');
assert.ok(renderer.includes("settings.tts.resourceMode='performance'"),'La UI no debe deshacer el perfil optimizado');
assert.ok(renderer.includes('Claude verificador activo'),'La UI debe mostrar el estado efectivo de Claude para pronunciación');

console.log('GEC 0.3.22 checks OK');
