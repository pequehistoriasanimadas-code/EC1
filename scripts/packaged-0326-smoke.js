'use strict';
const fs=require('fs');
const path=require('path');
const {app}=require('electron');
const resourcesDir=path.resolve(process.argv[2]||path.join('dist','win-unpacked','resources'));
const appRoot=path.join(resourcesDir,'app.asar');
const assert=(v,m)=>{if(!v)throw new Error(m);};
app.whenReady().then(()=>{try{
  const required=['src/bootstrap-0326.js','src/services/speechNormalizer0326.js','src/services/fonts.js','src/renderer-0326.js','src/output-0326.js','scripts/check-0326.js'];
  for(const rel of required)assert(fs.existsSync(path.join(appRoot,rel)),`Falta en app.asar: ${rel}`);
  const pkg=JSON.parse(fs.readFileSync(path.join(appRoot,'package.json'),'utf8'));
  assert(pkg.version==='0.3.26','Versión empaquetada no es 0.3.26');
  assert(pkg.main==='src/bootstrap-0326.js','Bootstrap 0.3.26 no es el entry point');
  const {normalizeSpeech}=require(path.join(appRoot,'src','services','speechNormalizer0326.js'));
  const cases=[
    ['3.600 millones','tres mil seiscientos millones'],
    ['3,77%','tres coma setenta y siete por ciento'],
    ['S/ 3.600 millones','tres mil seiscientos millones de soles'],
    ['13:00 horas','una de la tarde'],
    ['97° aniversario','nonagésimo séptimo aniversario'],
    ['3.er lugar','tercer lugar'],
    ['1.ª edición','primera edición'],
    ['Piura: la inflación llegó a 3,77%.','Piura. La inflación llegó a tres coma setenta y siete por ciento.'],
    ['F-16','F-16'],['COVID-19','COVID-19'],['https://elcomercio.pe/politica/nota-2026','https://elcomercio.pe/politica/nota-2026']
  ];
  for(const [input,expected] of cases){const actual=normalizeSpeech(input).text;assert(actual===expected,`${input} -> ${actual} (esperado ${expected})`);}
  const bootstrap=fs.readFileSync(path.join(appRoot,'src','bootstrap-0326.js'),'utf8');
  const output=fs.readFileSync(path.join(appRoot,'src','output-0326.js'),'utf8');
  const renderer=fs.readFileSync(path.join(appRoot,'src','renderer-0326.js'),'utf8');
  const fonts=fs.readFileSync(path.join(appRoot,'src','services','fonts.js'),'utf8');
  const fontFix=fs.readFileSync(path.join(appRoot,'src','renderer-font-fix-0325.js'),'utf8');
  assert(bootstrap.includes('initialAttackPaddingMs')&&bootstrap.includes('prosodicGuard')&&bootstrap.includes('backups'), 'Protección de locución/backup 0.3.26 incompleta');
  assert(output.includes('waitAudioReady')&&output.includes('ecSerial')&&output.includes('lastEndedSerial'),'Precarga/serial de Output 0.3.26 incompleto');
  assert(renderer.includes('Locución ES-PE')&&renderer.includes('refreshSpeechDiagnostic')&&renderer.includes('variantsFor'),'UI de locución/fuentes 0.3.26 incompleta');
  assert(fonts.includes('parseFont')&&fonts.includes('fvar')&&fonts.includes('fileHash'),'Gestor de fuentes reales 0.3.26 incompleto');
  assert(!fontFix.includes('customCache')&&!fontFix.includes('MutationObserver'),'Persistió el race de caché de fuentes 0.3.25');
  console.log('PACKAGED 0.3.26 OK · ES-PE · fuentes reales · protección de ataque y playback');
  app.exit(0);
}catch(e){console.error(e.stack||e);app.exit(1);}});
