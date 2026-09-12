'use strict';
const fs=require('fs');
const assert=require('assert');

const design=require('../src/services/emissionDesignLab29');

const legacy={format:'16:9',titleFontFamily:'Georgia',titleFontSize:77,titleFontVariant:'bold',titleColor:'#EEEEEE',summaryFontFamily:'Verdana',summaryFontSize:31,summaryColor:'#DDDDDD',categoryFontFamily:'Impact',categoryFontSize:29,categoryBgColor:'#F7C600',categoryTextColor:'#000000',categoryBgOpacity:.9,categoryRadius:4,dateFontFamily:'Segoe UI',dateFontSize:23,dateColor:'#CCCCCC',exclusiveFontFamily:'Arial',exclusiveFontSize:25,exclusiveBgColor:'#F7C600',exclusiveTextColor:'#000000',exclusiveBgOpacity:1,exclusiveRadius:5,lowerBgColor:'#050505',lowerOpacity:.82,animation:'zoom',motionSpeed:'slow',standbyVideo:'C:/standby.mp4',verticalVideoBackground:'C:/vertical.png',musicFile:'C:/music.mp3'};
const noteRoot=design.normalizeNoteDesignRoot(null,legacy);
assert.strictEqual(noteRoot.schemaVersion,2);
assert.strictEqual(noteRoot.formats['16:9'].titleFontFamily,'Georgia');
assert.strictEqual(noteRoot.formats['9:16'].titleFontFamily,'Georgia');
assert.deepStrictEqual(noteRoot.formats['16:9'].visibility,{category:true,date:true,exclusive:true});
noteRoot.formats['9:16'].titleFontSize=52;noteRoot.formats['9:16'].visibility.date=false;
assert.strictEqual(noteRoot.formats['16:9'].titleFontSize,77,'Editar vertical no debe contaminar horizontal');
assert.strictEqual(noteRoot.formats['16:9'].visibility.date,true,'Visibilidad debe ser independiente');
const effectiveVertical=design.materializeEffectiveOutput({...legacy,format:'9:16',noteDesign:noteRoot});
assert.strictEqual(effectiveVertical.titleFontSize,52);assert.strictEqual(effectiveVertical.dateVisible,false);assert.strictEqual(effectiveVertical.standbyVideo,'C:/standby.mp4');assert.strictEqual(effectiveVertical.musicFile,'C:/music.mp3');

const legacyPromo={ctaText:'Mira el video:',formats:{'16:9':{position:'bottom-left',xPercent:4,yPercent:5,scale:1.2,ctaFontSize:22,titleFontSize:18,channelFontSize:14,backgroundOpacity:.85,thumbnailScale:1,borderRadius:14,titleMaxLines:2},'9:16':{position:'top-right',xPercent:5,yPercent:8,scale:.9,ctaFontSize:20,titleFontSize:17,channelFontSize:13,backgroundOpacity:.8,thumbnailScale:.9,borderRadius:12,titleMaxLines:3}}};
const promo=design.normalizePromoDesignRoot(legacyPromo,{tiktokSafe:true});
assert.strictEqual(promo.schemaVersion,2);assert.strictEqual(promo.ctaText,'Mira el video:');assert(promo.formats['16:9'].widthPercent>0);assert(!Object.prototype.hasOwnProperty.call(promo.formats['16:9'],'titleMaxLines'));
const presetNames=['top-left','top-center','top-right','bottom-left','bottom-center','bottom-right'];
for(const name of presetNames){const p=design.promoPreset(name,'9:16',{widthPercent:70,minHeightPercent:10},true),safe=design.promoSafeRect('9:16',true),halfW=p.widthPercent/2,halfH=p.minHeightPercent/2;assert.strictEqual(p.preset,name);assert(p.centerXPercent-halfW>=safe.left-.001&&p.centerXPercent+halfW<=safe.right+.001);assert(p.centerYPercent-halfH>=safe.top-.001&&p.centerYPercent+halfH<=safe.bottom+.001);}
const custom=design.normalizePromoFormat({preset:'bottom-center',centerXPercent:93,centerYPercent:97,widthPercent:96,minHeightPercent:35},'9:16',{tiktokSafe:true});
const safe=design.promoSafeRect('9:16',true),halfW=custom.widthPercent/2,halfH=custom.minHeightPercent/2;
assert.strictEqual(custom.preset,'custom');assert(custom.centerXPercent-halfW>=safe.left-.001&&custom.centerXPercent+halfW<=safe.right+.001);assert(custom.centerYPercent-halfH>=safe.top-.001&&custom.centerYPercent+halfH<=safe.bottom+.001);assert(custom.widthPercent<=safe.right-safe.left+.001);
const horizontal=design.normalizePromoFormat({preset:'custom',centerXPercent:50,centerYPercent:50,widthPercent:88,minHeightPercent:25},'16:9',{tiktokSafe:false});assert(horizontal.centerXPercent-horizontal.widthPercent/2>=0&&horizontal.centerXPercent+horizontal.widthPercent/2<=100);

assert(fs.existsSync('src/services/releaseV2EmissionDesign.js'),'Falta release Emission Design V2');
const release=fs.readFileSync('src/services/releaseV2EmissionDesign.js','utf8');assert(release.includes('SettingsStore.prototype'));assert(release.includes('normalizeNoteDesignRoot')&&release.includes('materializeEffectiveOutput'));assert(release.includes('normalizePromoDesignRoot'));assert(release.includes('renderer-emission-design-v2.js')&&release.includes('output-emission-design-v2.js'));
const boot=fs.readFileSync('src/bootstrap-v2lab.js','utf8');assert(boot.includes('releaseV2EmissionDesign')&&boot.includes('installReleaseV2EmissionDesign'));assert(boot.indexOf('releaseV2Lab29')<boot.indexOf('releaseV2EmissionDesign'));

// Editor UX contract: intentionally RED until the new renderer/CSS are added.
assert(fs.existsSync('src/renderer-emission-design-v2.js'),'Falta renderer-emission-design-v2.js');
assert(fs.existsSync('src/control-emission-design-v2.css'),'Falta control-emission-design-v2.css');
const ui=fs.readFileSync('src/renderer-emission-design-v2.js','utf8'),css=fs.readFileSync('src/control-emission-design-v2.css','utf8');
for(const font of ['Arial','Segoe UI','Verdana','Georgia','Impact'])assert(ui.includes(font),`UI debe inicializar fuente base ${font}`);
for(const id of ['ecEmissionV2Mode','ecEmissionV2NoteCard','ecEmissionV2PromoCard','ecEmissionV2PreviewCard'])assert(ui.includes(id),`Falta host ${id}`);
assert(ui.includes('Categoría')&&ui.includes('Fecha')&&ui.includes('Exclusivo'),'Nota debe exponer checkboxes de metadata');
assert(!ui.includes('Mostrar Categoría')&&!ui.includes('Mostrar Fecha')&&!ui.includes('Mostrar Exclusivo'),'Checkboxes no deben usar Mostrar');
assert(ui.includes('categoryVisible')&&ui.includes('dateVisible')&&ui.includes('exclusiveBadgeVisible'),'Visibilidad debe ser visual y separada');
for(const id of presetNames)assert(ui.includes(id),`UI debe incluir preset ${id}`);
assert(ui.includes('Personalizado'),'UI debe identificar posición personalizada');
assert((ui.match(/type="range"/g)||[]).length>=6,'X/Y/ancho/alto y avanzados deben usar sliders');
assert(ui.includes('type="number"'),'Tamaños tipográficos deben seguir siendo numéricos');
assert(!ui.includes('Máximo de líneas')&&!ui.includes('titleMaxLines'),'UI no debe exponer máximo de líneas');
assert(ui.includes('profileStatus'),'Autosave debe validar el perfil activo antes de persistir');
assert(ui.includes('transitionType')&&ui.includes('ec0331StandbyCard')&&ui.includes('ecDesignRight'),'Transiciones y standby deben permanecer en la derecha');
assert(css.includes('minmax(0,1fr)')||css.includes('minmax(0, 1fr)'),'Layout debe proteger overflow horizontal');
assert(/1180px/.test(css),'Debe preservar breakpoint de 1180 px');
assert(!/position\s*:\s*sticky/.test(css),'Preview no debe ser sticky');

console.log('Emission Design V2 model/persistence/editor/geometry regression gate: OK');
