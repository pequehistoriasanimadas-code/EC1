'use strict';
const fs=require('fs');
const assert=require('assert');

const read=file=>fs.readFileSync(file,'utf8');

for(const file of [
  'src/services/youtubePromoDesignLab29.js',
  'src/services/releaseV2Stabilization.js',
  'src/renderer-stabilization-lab28.js',
  'src/control-stabilization-lab28.css',
  'src/output-youtube-promo.js',
  'src/output-youtube-promo.css'
])assert(fs.existsSync(file),`Falta ${file}`);

const design=require('../src/services/youtubePromoDesignLab29');
const root=design.normalizeYoutubePromoDesignRoot({});
assert.strictEqual(root.ctaText,'Puedes ver el video aquí:');
assert.strictEqual(root.formats['16:9'].position,'bottom-left');
assert.strictEqual(root.formats['16:9'].xPercent,4);
assert.strictEqual(root.formats['16:9'].yPercent,5);
assert.strictEqual(root.formats['16:9'].scale,1);
assert.strictEqual(root.formats['9:16'].xPercent,5);
assert.strictEqual(root.formats['9:16'].yPercent,8);
assert.strictEqual(root.formats['9:16'].scale,.9);
const clamped=design.normalizeYoutubePromoDesignRoot({ctaText:' CTA ',formats:{'16:9':{xPercent:99,yPercent:-4,scale:4,backgroundOpacity:.1,titleMaxLines:9}}});
assert.strictEqual(clamped.ctaText,' CTA ');
assert.strictEqual(clamped.formats['16:9'].xPercent,40);
assert.strictEqual(clamped.formats['16:9'].yPercent,0);
assert.strictEqual(clamped.formats['16:9'].scale,1.5);
assert.strictEqual(clamped.formats['16:9'].backgroundOpacity,.35);
assert.strictEqual(clamped.formats['16:9'].titleMaxLines,4);

const stab=read('src/services/releaseV2Stabilization.js');
assert(stab.includes('freshYoutubePromoSnapshot'),'La promo debe resolverse justo antes de enviar el contenido');
assert(stab.includes('normalizeYoutubePromoDesign'),'El snapshot debe incluir diseño normalizado');
assert(stab.includes("role==='content'"),'La ruta fresca debe aplicarse solo a contenidos');
assert(stab.includes("role==='ad'"),'Los anuncios deben conservar exclusión explícita');

const out=read('src/output-youtube-promo.js');
assert(out.includes('promo.design'),'Output debe leer el diseño incluido en el snapshot');
assert(out.includes('--yt-x')&&out.includes('--yt-y')&&out.includes('--yt-scale'),'Output debe aplicar variables de posición y escala');
assert(out.includes('--yt-cta-size')&&out.includes('--yt-title-size')&&out.includes('--yt-channel-size'),'Output debe aplicar tamaños tipográficos de la promo');

const ui=read('src/renderer-stabilization-lab28.js');
for(const token of [
  'data-tab="output"',
  'tab-output',
  'ecDesignLeft',
  'ecDesignRight',
  'ecOutputSummaryHost',
  'ecNetworkPermissionsHost',
  'ecLanOutputHost',
  'ecNdiOutputHost',
  'ecDesignBackgroundsCard',
  'ecYoutubePromoPreview',
  'safeResetDesign',
  'Nota',
  'Promo YouTube',
  'Posición',
  'Escala de tarjeta',
  'Posición X',
  'Posición Y',
  'Tamaño CTA',
  'Tamaño título',
  'Tamaño canal',
  'Opacidad del fondo',
  'Tamaño de miniatura',
  'Radio de esquinas',
  'Máximo de líneas'
])assert(ui.includes(token),`Falta UX/arquitectura: ${token}`);
assert(ui.includes("q('#ecNetworkPermissionsConfigure')?.closest('.card')"),'Permisos debe mover el panel existente, no duplicarlo');
assert(ui.includes("q('#ecLanEnabled')?.closest('.card')"),'LAN debe mover el panel existente, no duplicarlo');
assert(ui.includes("q('#ecNdiEnabled')?.closest('.card')"),'NDI debe mover el panel existente, no duplicarlo');
assert(ui.includes("q('#ec0331StandbyCard')"),'Video de espera debe conservar su tarjeta existente');
assert(ui.includes('standbyVideo')&&ui.includes('verticalVideoBackground')&&ui.includes('musicFile'),'Reset seguro debe preservar archivos no visuales');

const css=read('src/control-stabilization-lab28.css');
assert(css.includes('@media(max-width:1180px)'),'El nuevo layout debe colapsar en el breakpoint estable de 1180 px');
assert(css.includes('minmax(0,1fr)'),'Las columnas deben permitir encogerse sin overflow');
assert(css.includes('min-width:0'),'Los hijos deben poder encogerse sin romper el layout');
assert(!/position\s*:\s*sticky/.test(css),'No debe introducirse preview sticky en esta versión');

const outCss=read('src/output-youtube-promo.css');
for(const variable of ['--yt-x','--yt-y','--yt-scale','--yt-bg-opacity','--yt-thumb-scale','--yt-radius','--yt-title-lines'])assert(outCss.includes(variable),`Falta variable CSS de promo ${variable}`);

const pkg=JSON.parse(read('package.json'));
assert(pkg.scripts.check.includes('check-v2lab-emission-layout.js'),'La suite principal debe ejecutar la regresión de Diseño/Salida');
assert(pkg.scripts.check.includes('youtubePromoDesignLab29.js'),'El normalizador de Promo debe pasar node --check');
assert((pkg.build.files||[]).includes('scripts/check-v2lab-emission-layout.js'),'El smoke empaquetado debe incluir la regresión nueva');

console.log('check-v2lab-emission-layout: OK · diseño completo + salida + promo fresca + responsive + reset seguro');
