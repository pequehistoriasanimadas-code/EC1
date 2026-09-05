'use strict';
const fs=require('fs');const path=require('path');const assert=require('assert');
const root=path.resolve(__dirname,'..');
const rules=require(path.join(root,'src','services','speechRules0327.js'));
const pack=JSON.parse(fs.readFileSync(path.join(root,'src','assets','normalizer-es-PE-0327.json'),'utf8'));
const n=input=>rules.structuralPreNormalize(input,{rules:pack.rules}).text;
let checks=0;const eq=(a,b,m)=>{checks++;assert.strictEqual(a,b,m);};const ok=(v,m)=>{checks++;assert.ok(v,m);};
const exact=[
 ['7,8%','siete coma ocho por ciento'],['18,43%','dieciocho coma cuarenta y tres por ciento'],['0,25%','cero coma veinticinco por ciento'],['-3,7%','menos tres coma siete por ciento'],['+2,5%','más dos coma cinco por ciento'],['7.8%','siete coma ocho por ciento'],
 ['13:00 horas','trece horas'],['13:05 horas','trece horas con cinco minutos'],['1.924 desaparecidos','mil novecientos veinticuatro desaparecidos'],['25.600 casos','veinticinco mil seiscientos casos'],
 ['Perú vs. Chile','Perú versus Chile'],['Harald V','Harald quinto'],['Felipe VI','Felipe sexto'],['Isabel II','Isabel segunda'],['Luis XIV','Luis catorce'],['siglo XXI','siglo veintiuno'],
 ['2026-08-31','treinta y uno de agosto de dos mil veintiséis'],['temporada 2025/26','temporada dos mil veinticinco, dos mil veintiséis'],['Mw 6.1','magnitud seis coma uno'],['km 105','kilómetro ciento cinco'],
 ['EE. UU.','Estados Unidos'],['FF. AA.','Fuerzas Armadas'],['RR. HH.','Recursos Humanos'],['https://elcomercio.pe/politica/nota-2026','https://elcomercio.pe/politica/nota-2026'],['v0.3.27','v0.3.27'],
 ['Perú ganó 2-1 el partido','Perú ganó dos a uno el partido'],['El partido acabó 1:1','El partido acabó uno a uno']
];for(const [i,e] of exact)eq(n(i),e,i);
for(let a=0;a<=20;a++){for(const b of [1,5,8,25,43,99]){const raw=`${a},${b}%`,out=n(raw);ok(out.includes(' coma ')&&out.endsWith(' por ciento'),`porcentaje estructural ${raw} -> ${out}`);}}
for(let h=0;h<24;h++){eq(n(`${String(h).padStart(2,'0')}:00 horas`),`${rules.integerWords(BigInt(h))} horas`,`hora ${h}`);}
for(const x of [1000,1924,3600,12500,25600,999999]){const raw=x.toLocaleString('es-PE').replace(/,/g,'.');eq(n(raw),rules.integerWords(BigInt(x)),`miles ${raw}`);}
const validation=rules.validateRulePack(pack);ok(validation.ok,validation.error);for(const t of pack.tests||[])eq(n(t.input),t.expected,`pack ${t.input}`);
const files={
 bootstrap:fs.readFileSync(path.join(root,'src','bootstrap-0327.js'),'utf8'),policy:fs.readFileSync(path.join(root,'src','services','version0327Policy.js'),'utf8'),renderer:fs.readFileSync(path.join(root,'src','renderer-0327.js'),'utf8'),preload:fs.readFileSync(path.join(root,'src','preload.js'),'utf8'),css:fs.readFileSync(path.join(root,'src','control-0327.css'),'utf8'),pkg:JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'))
};
ok(files.pkg.version==='0.3.27','package 0.3.27');ok(files.pkg.main==='src/bootstrap-0327.js','bootstrap 0327 activo');ok(files.preload.includes('renderer-0327.js')&&files.preload.includes('normalizerStatus'),'preload 0327');ok(files.policy.includes('requestedContentSec')&&files.policy.includes("'recovery'"),'recuperación adaptativa conectada');ok(files.policy.includes('lastInput0327')&&files.policy.includes('sentToKokoro'),'diagnóstico Kokoro');ok(files.renderer.includes('Audio y locución')&&files.renderer.includes('Instalar IA local completa'),'nueva sección e instalador');ok(files.renderer.includes('Cambio sin guardar')&&files.renderer.includes('+ Añadir pronunciación'),'edición/aprendizaje manual');ok(files.renderer.includes('adaptiveSelection')&&files.renderer.includes('Programar contenido ahora'),'diagnóstico de contenidos');ok(files.css.includes('.ec27-grid')&&files.css.includes('.ec27-row'),'CSS 0327');
console.log(`EC 0.3.27 checks OK · ${checks} verificaciones`);
