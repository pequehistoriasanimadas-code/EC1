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

r=correctAccess({...base,access:{status:'SUBSCRIBER_ONLY',signals:{schemaLocked:true,urlHint:false}}},base.finalUrl);
assert.equal(r.access.status,'SUBSCRIBER_ONLY','isAccessibleForFree=false de la nota actual debe conservarse');

r=correctAccess({...base,body:`Solo para suscriptores. ${base.body}`},base.finalUrl);
assert.equal(r.access.status,'SUBSCRIBER_ONLY','un bloqueo explícito visible debe conservarse');

r=correctAccess({...base,finalUrl:'https://example.com/premium/nota/'},'https://example.com/premium/nota/');
assert.equal(r.access.status,'SUBSCRIBER_ONLY','una ruta premium explícita debe conservarse');

console.log('check-access-policy-0324: OK');
