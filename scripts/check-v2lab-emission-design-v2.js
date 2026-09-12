'use strict';
const fs=require('fs');
const assert=require('assert');

const design=require('../src/services/emissionDesignLab29');

const legacy={
  format:'16:9',
  titleFontFamily:'Georgia',titleFontSize:77,titleFontVariant:'bold',titleColor:'#EEEEEE',
  summaryFontFamily:'Verdana',summaryFontSize:31,summaryColor:'#DDDDDD',
  categoryFontFamily:'Impact',categoryFontSize:29,categoryBgColor:'#F7C600',categoryTextColor:'#000000',categoryBgOpacity:.9,categoryRadius:4,
  dateFontFamily:'Segoe UI',dateFontSize:23,dateColor:'#CCCCCC',
  exclusiveFontFamily:'Arial',exclusiveFontSize:25,exclusiveBgColor:'#F7C600',exclusiveTextColor:'#000000',exclusiveBgOpacity:1,exclusiveRadius:5,
  lowerBgColor:'#050505',lowerOpacity:.82,animation:'zoom',motionSpeed:'slow',
  standbyVideo:'C:/standby.mp4',verticalVideoBackground:'C:/vertical.png',musicFile:'C:/music.mp3'
};

const noteRoot=design.normalizeNoteDesignRoot(null,legacy);
assert.strictEqual(noteRoot.schemaVersion,2,'Note Design debe quedar versionado');
assert.strictEqual(noteRoot.formats['16:9'].titleFontFamily,'Georgia','Migración debe conservar tipografía legacy');
assert.strictEqual(noteRoot.formats['9:16'].titleFontFamily,'Georgia','Perfil legacy debe sembrar ambos formatos');
assert.deepStrictEqual(noteRoot.formats['16:9'].visibility,{category:true,date:true,exclusive:true},'Metadata visible por defecto');
noteRoot.formats['9:16'].titleFontSize=52;
noteRoot.formats['9:16'].visibility.date=false;
assert.strictEqual(noteRoot.formats['16:9'].titleFontSize,77,'Editar vertical no debe contaminar horizontal');
assert.strictEqual(noteRoot.formats['16:9'].visibility.date,true,'Visibilidad debe ser independiente por formato');

const effectiveVertical=design.materializeEffectiveOutput({...legacy,format:'9:16',noteDesign:noteRoot});
assert.strictEqual(effectiveVertical.titleFontSize,52,'Materialización debe usar formato activo');
assert.strictEqual(effectiveVertical.dateVisible,false,'Output efectivo debe recibir visibilidad del formato activo');
assert.strictEqual(effectiveVertical.standbyVideo,'C:/standby.mp4','Materialización no debe borrar standby');
assert.strictEqual(effectiveVertical.musicFile,'C:/music.mp3','Materialización no debe borrar música');

const legacyPromo={
  ctaText:'Mira el video:',
  formats:{
    '16:9':{position:'bottom-left',xPercent:4,yPercent:5,scale:1.2,ctaFontSize:22,titleFontSize:18,channelFontSize:14,backgroundOpacity:.85,thumbnailScale:1,borderRadius:14,titleMaxLines:2},
    '9:16':{position:'top-right',xPercent:5,yPercent:8,scale:.9,ctaFontSize:20,titleFontSize:17,channelFontSize:13,backgroundOpacity:.8,thumbnailScale:.9,borderRadius:12,titleMaxLines:3}
  }
};
const promo=design.normalizePromoDesignRoot(legacyPromo,{tiktokSafe:true});
assert.strictEqual(promo.schemaVersion,2,'Promo Design debe quedar versionado');
assert.strictEqual(promo.ctaText,'Mira el video:','CTA legacy debe conservarse');
assert(Number.isFinite(promo.formats['16:9'].widthPercent)&&promo.formats['16:9'].widthPercent>0,'Scale legacy debe migrar a ancho real');
assert(!Object.prototype.hasOwnProperty.call(promo.formats['16:9'],'titleMaxLines'),'Máximo de líneas deja de ser una opción persistida');

const presetNames=['top-left','top-center','top-right','bottom-left','bottom-center','bottom-right'];
for(const name of presetNames){
  const p=design.promoPreset(name,'9:16',{widthPercent:70,minHeightPercent:10},true);
  assert.strictEqual(p.preset,name,`Preset ${name} debe conservar identidad`);
  assert(Number.isFinite(p.centerXPercent)&&Number.isFinite(p.centerYPercent),`Preset ${name} debe resolver X/Y`);
  const safe=design.promoSafeRect('9:16',true);
  const halfW=p.widthPercent/2,halfH=p.minHeightPercent/2;
  assert(p.centerXPercent-halfW>=safe.left-.001&&p.centerXPercent+halfW<=safe.right+.001,`Preset ${name} debe quedar dentro de safe zone horizontal`);
  assert(p.centerYPercent-halfH>=safe.top-.001&&p.centerYPercent+halfH<=safe.bottom+.001,`Preset ${name} debe quedar dentro de safe zone vertical`);
}

const custom=design.normalizePromoFormat({preset:'bottom-center',centerXPercent:93,centerYPercent:97,widthPercent:96,minHeightPercent:35},'9:16',{tiktokSafe:true});
const safe=design.promoSafeRect('9:16',true),halfW=custom.widthPercent/2,halfH=custom.minHeightPercent/2;
assert.strictEqual(custom.preset,'custom','Cambiar X/Y fuera del preset debe quedar como Personalizado');
assert(custom.centerXPercent-halfW>=safe.left-.001&&custom.centerXPercent+halfW<=safe.right+.001,'Geometría custom debe clamp horizontalmente');
assert(custom.centerYPercent-halfH>=safe.top-.001&&custom.centerYPercent+halfH<=safe.bottom+.001,'Geometría custom debe clamp verticalmente');
assert(custom.widthPercent<=safe.right-safe.left+.001,'Tarjeta vertical no puede ser más ancha que safe zone');

const horizontal=design.normalizePromoFormat({preset:'custom',centerXPercent:50,centerYPercent:50,widthPercent:88,minHeightPercent:25},'16:9',{tiktokSafe:false});
assert(horizontal.centerXPercent-horizontal.widthPercent/2>=0&&horizontal.centerXPercent+horizontal.widthPercent/2<=100,'Promo 16:9 debe quedar dentro del canvas');

if(fs.existsSync('src/renderer-emission-design-v2.js')){
  const ui=fs.readFileSync('src/renderer-emission-design-v2.js','utf8');
  for(const font of ['Arial','Segoe UI','Verdana','Georgia','Impact'])assert(ui.includes(font),`UI debe inicializar fuente base ${font}`);
  assert(ui.includes('Categoría')&&ui.includes('Fecha')&&ui.includes('Exclusivo'),'Nota debe exponer switches de metadata');
  assert(!ui.includes('Mostrar Categoría')&&!ui.includes('Mostrar Fecha')&&!ui.includes('Mostrar Exclusivo'),'Checkboxes no deben usar texto Mostrar');
  for(const id of ['top-left','top-center','top-right','bottom-left','bottom-center','bottom-right'])assert(ui.includes(id),`UI debe incluir preset ${id}`);
  assert(ui.includes('type="range"'),'Posición/geometría deben usar sliders');
  assert(!ui.includes('Máximo de líneas'),'UI no debe volver a exponer máximo de líneas');
}

console.log('Emission Design V2 model/geometry regression gate: OK');
