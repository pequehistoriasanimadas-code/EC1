'use strict';
const assert=require('assert');
const {correctAccess}=require('../src/services/accessPolicy0324');

const base={
  title:'Partido en vivo',
  description:'Información del encuentro',
  body:'Contenido editorial completo '.repeat(90),
  sourceChars:2200,
  contentState:'COMPLETE',
  finalUrl:'https://example.com/deportes/nota-publica/',
  isExclusive:true,
  access:{status:'SUBSCRIBER_ONLY',confidence:'high',signals:{phrase:true,dom:true,urlHint:false,schemaLocked:false}}
};

let r=correctAccess({...base,body:`${base.body} Apple TV ofrece contenido exclusivo relacionado con la liga.`},base.finalUrl);
assert.equal(r.access.status,'PUBLIC','una frase editorial genérica no debe volver exclusiva una nota pública completa');
assert.equal(r.isExclusive,false);

r=correctAccess(base,base.finalUrl);
assert.equal(r.access.status,'PUBLIC','un componente paywall inactivo no debe marcar una nota completa como exclusiva');

const shortPublic={...base,body:'Magaly Medina continúa entreteniendo al público peruano desde la señal de ATV. '.repeat(7),sourceChars:560,contentState:'PARTIAL',access:{status:'SUBSCRIBER_ONLY',confidence:'high',signals:{phrase:true,dom:true,urlHint:false,schemaLocked:false}}};
r=correctAccess(shortPublic,shortPublic.finalUrl);
assert.equal(r.access.status,'PUBLIC','una nota pública corta pero sustancial no debe marcarse como exclusiva');
assert.equal(r.isExclusive,false);

r=correctAccess({...shortPublic,access:{status:'SUBSCRIBER_ONLY',confidence:'high',signals:{schemaLocked:true,urlHint:false}}},shortPublic.finalUrl);
assert.equal(r.access.status,'PUBLIC','metadata contradictoria no debe bloquear una nota cuyo cuerpo sustancial ya fue leído');

r=correctAccess({...base,body:`Solo para suscriptores. ${base.body}`},base.finalUrl);
assert.equal(r.access.status,'SUBSCRIBER_ONLY','un bloqueo explícito visible debe conservarse');

const teaser={...base,body:'Avance breve de la nota.',sourceChars:24,contentState:'INSUFFICIENT'};
r=correctAccess({...teaser,access:{status:'SUBSCRIBER_ONLY',signals:{schemaLocked:true,urlHint:false}}},teaser.finalUrl);
assert.equal(r.access.status,'SUBSCRIBER_ONLY','metadata de bloqueo debe conservarse cuando solo existe un teaser insuficiente');

r=correctAccess({...teaser,finalUrl:'https://example.com/premium/nota/',access:{status:'SUBSCRIBER_ONLY',signals:{schemaLocked:false,urlHint:true}}},'https://example.com/premium/nota/');
assert.equal(r.access.status,'SUBSCRIBER_ONLY','una ruta premium debe conservarse cuando el contenido accesible es insuficiente');

r=correctAccess({...teaser,access:{status:'SUBSCRIBER_ONLY',signals:{schemaLocked:false,urlHint:false,dom:true,phrase:true}}},teaser.finalUrl);
assert.equal(r.access.status,'UNKNOWN','un widget genérico no debe inventar exclusividad cuando no hay evidencia fuerte');
assert.equal(r.isExclusive,false);

console.log('check-access-policy-0324: OK');
