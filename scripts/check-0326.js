'use strict';
const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {normalizeSpeech,validateSpeech,numberWords}=require('../src/services/speechNormalizer0326');
const {protectStructuredText}=require('../src/services/speechPipeline0326');
const {PronunciationNormalizer}=require('../src/services/pronunciation');

let checks=0;
const eq=(input,expected)=>{const out=normalizeSpeech(input).text;assert.strictEqual(out,expected,`\nIN: ${input}\nOUT: ${out}\nEXP: ${expected}`);checks++;};
const same=input=>{const out=normalizeSpeech(input).text;assert.strictEqual(out,input,`\nIN: ${input}\nOUT: ${out}`);checks++;};
const idem=input=>{const a=normalizeSpeech(input).text,b=normalizeSpeech(a).text;assert.strictEqual(b,a,`No idempotente: ${input}\nA=${a}\nB=${b}`);checks++;};

async function run(){
  eq('1.000','mil');eq('1.024','mil veinticuatro');eq('1.924','mil novecientos veinticuatro');eq('2.500','dos mil quinientos');eq('10.000','diez mil');eq('25.400','veinticinco mil cuatrocientos');eq('100.000','cien mil');eq('850.000','ochocientos cincuenta mil');eq('1.000.000','un millón');eq('3.600.000','tres millones seiscientos mil');
  eq('1.250,75','mil doscientos cincuenta coma setenta y cinco');eq('1,924','uno coma novecientos veinticuatro');eq('1,92','uno coma noventa y dos');eq('1.924,50','mil novecientos veinticuatro coma cincuenta');
  eq('3.600 millones','tres mil seiscientos millones');eq('21 millones','veintiún millones');eq('21 personas','veintiuna personas');
  eq('3,77%','tres coma setenta y siete por ciento');eq('3.77%','tres coma setenta y siete por ciento');eq('3,05%','tres coma cero cinco por ciento');eq('0,25%','cero coma veinticinco por ciento');eq('-3,77%','menos tres coma setenta y siete por ciento');eq('+2,5%','más dos coma cinco por ciento');
  eq('S/ 3.600 millones','tres mil seiscientos millones de soles');eq('S/ 250','doscientos cincuenta soles');eq('S/ 1','un sol');eq('US$ 2,5 millones','dos coma cinco millones de dólares');eq('USD 850.000','ochocientos cincuenta mil dólares');eq('$ 125','ciento veinticinco dólares');eq('S/ 3,50','tres soles con cincuenta céntimos');eq('US$ 12,75','doce dólares con setenta y cinco centavos');eq('EUR 25','veinticinco euros');eq('GBP 10','diez libras');eq('JPY 1000','mil yenes');eq('CNY 25','veinticinco yuanes');
  eq('13:00 horas','trece horas');eq('14:30 horas','catorce horas con treinta minutos');eq('08:00','ocho horas');eq('00:00','cero horas');eq('12:00','doce horas');eq('13:05','trece horas con cinco minutos');eq('1:00 p. m.','una de la tarde.');eq('1:00 a. m.','una de la madrugada.');eq('8:30 a. m.','ocho y treinta de la mañana.');
  eq('28/08/2026','veintiocho de agosto de dos mil veintiséis');eq('28/08/1999','veintiocho de agosto de mil novecientos noventa y nueve');eq('28-08-2026','veintiocho de agosto de dos mil veintiséis');eq('1939-1945','mil novecientos treinta y nueve a mil novecientos cuarenta y cinco');eq('2024-2026','dos mil veinticuatro a dos mil veintiséis');
  eq('97° aniversario','nonagésimo séptimo aniversario');eq('3.er lugar','tercer lugar');eq('21.º puesto','vigésimo primer puesto');eq('1.ª edición','primera edición');eq('5to','quinto');eq('2da','segunda');eq('32°C','treinta y dos grados Celsius');eq('86°F','ochenta y seis grados Fahrenheit');eq('90°','noventa grados');
  eq('Harald V','Harald quinto');eq('Felipe VI','Felipe sexto');eq('Carlos III','Carlos tercero');eq('Isabel II','Isabel segunda');eq('Juan Pablo II','Juan Pablo segundo');eq('Luis XIV','Luis catorce');eq('Benedicto XVI','Benedicto dieciséis');eq('siglo XXI','siglo veintiuno');eq('siglo XIX','siglo diecinueve');eq('capítulo IV','capítulo cuatro');eq('Super Bowl LVIII','Super Bowl cincuenta y ocho');same('Canal V');
  eq('Perú ganó 2-1','Perú ganó dos a uno');eq('El partido terminó 1-1','El partido terminó uno a uno');eq('Perú cayó 0-3','Perú cayó cero a tres');eq('Ganó 5-4 en penales','Ganó cinco a cuatro en penales');eq('El marcador global fue 3-2','El marcador global fue tres a dos');eq('El partido de vóley terminó 25-21','El partido de vóley terminó veinticinco a veintiuno');eq('El partido de básquet terminó 102-98','El partido de básquet terminó ciento dos a noventa y ocho');eq('10-15 años','diez a quince años');
  eq('Piura: la inversión llegó a 3,77% a las 13:00 horas.','Piura. La inversión llegó a tres coma setenta y siete por ciento a las trece horas.');
  eq('Ley N.º 30225','Ley número treinta mil doscientos veinticinco');eq('Decreto Supremo N.° 001-2026','Decreto Supremo número cero cero uno guion dos mil veintiséis');eq('art. 5-A','artículo cinco A');
  eq('32 km/h','treinta y dos kilómetros por hora');eq('5 m/s','cinco metros por segundo');eq('2 km²','dos kilómetros cuadrados');eq('3 m³','tres metros cúbicos');eq('25 mg','veinticinco miligramos');eq('2 l','dos litros');eq('100 Mbps','cien megabits por segundo');
  same('F-16');same('COVID-19');same('G20');same('COP30');same('iPhone 17');same('Windows 11');same('S&P 500');same('https://elcomercio.pe/politica/nota-2026');same('v0.3.26');same('Inversión privada aumentará.');same('Eclipse solar será visible.');

  for(let i=0;i<=140;i++){const raw=String(i),out=normalizeSpeech(raw).text;assert.strictEqual(out,numberWords(raw));checks++;}
  for(let h=0;h<24;h++){const raw=`${String(h).padStart(2,'0')}:00`,out=normalizeSpeech(raw).text;assert.strictEqual(out,`${numberWords(String(h))} horas`,`${raw} -> ${out}`);checks++;}
  for(let i=0;i<60;i++){const raw=`${i},25%`,out=normalizeSpeech(raw).text;assert(out.endsWith('por ciento'));assert(!out.includes('%'));checks++;}
  for(const input of ['1.924','3,77%','S/ 3.600 millones','S/ 3,50','13:00 horas','97° aniversario','Harald V','siglo XXI','Piura: la inflación llegó a 3,77%.','Perú ganó 2-1','28/08/2026','28/08/1999','F-16','COVID-19','1:00 p. m.','3.er lugar'])idem(input);
  for(const input of ['🚨 Último minuto','📊 La inflación llegó a 3,5%','• Uno • Dos','Piura: información oficial']){const out=normalizeSpeech(input);assert(validateSpeech(input,out.text).ok);checks++;}

  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ec-0326-e2e-'));
  const pron=new PronunciationNormalizer({resourcesDir:temp,dataDir:temp,getSettings:()=>({tts:{pronunciationMaxSeconds:5,pronunciationClaudeVerify:false}})});
  const e2e=async(input,expected)=>{
    const p=protectStructuredText(input);const base=await pron.normalize(p.text,{smart:false});const restored=p.restore(base.text);const final=normalizeSpeech(restored).text;assert.strictEqual(final,expected,`E2E\nIN: ${input}\nPRON: ${base.text}\nREST: ${restored}\nFINAL: ${final}\nEXP: ${expected}`);checks++;
  };
  await e2e('Reporta 1.924 desaparecidos.','Reporta mil novecientos veinticuatro desaparecidos.');
  await e2e('La cita será a las 13:00 horas.','La cita será a las trece horas.');
  await e2e('Harald V visitó la ciudad.','Harald quinto visitó la ciudad.');
  await e2e('La inflación llegó a 3,77%.','La inflación llegó a tres coma setenta y siete por ciento.');
  await e2e('La inversión fue de S/ 3,50.','La inversión fue de tres soles con cincuenta céntimos.');
  await e2e('Perú ganó 2-1 el partido.','Perú ganó dos a uno el partido.');
  await e2e('Piura: la reunión será a las 13:30 horas.','Piura. La reunión será a las trece horas con treinta minutos.');
  fs.rmSync(temp,{recursive:true,force:true});

  const root=path.join(__dirname,'..');
  const bootstrap=fs.readFileSync(path.join(root,'src','bootstrap-0326.js'),'utf8');
  const output=fs.readFileSync(path.join(root,'src','output-0326.js'),'utf8');
  const renderer=fs.readFileSync(path.join(root,'src','renderer-0326.js'),'utf8');
  const fontFix=fs.readFileSync(path.join(root,'src','renderer-font-fix-0325.js'),'utf8');
  const fonts=fs.readFileSync(path.join(root,'src','services','fonts.js'),'utf8');
  assert(bootstrap.includes('protectMutilatedFirstWord')&&bootstrap.includes('initialAttackPaddingMs')&&bootstrap.includes('protectStructuredText'));checks+=3;
  assert(output.includes('waitAudioReady')&&output.includes('ecSerial')&&output.includes('lastEndedSerial'));checks+=3;
  assert(renderer.includes('speechNormalizerEnabled')&&renderer.includes('initialAttackProtection')&&renderer.includes('refreshSpeechDiagnostic'));checks+=3;
  assert(fontFix.includes("BASE_FONTS=['Arial','Segoe UI','Verdana','Georgia','Impact']")&&!fontFix.includes('MutationObserver')&&!fontFix.includes('customCache'));checks+=3;
  assert(fonts.includes('parseFont')&&fonts.includes('fvar')&&fonts.includes('fileHash')&&fonts.includes('duplicate:true'));checks+=4;
  assert(checks>=300,`Solo ${checks} checks`);
  console.log(`EC 0.3.26 speech regression checks: OK · ${checks} casos · E2E real hasta texto para Kokoro`);
}
run().catch(e=>{console.error(e.stack||e);process.exit(1);});
