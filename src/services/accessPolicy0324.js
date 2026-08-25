'use strict';

const STRONG_LOCK_RE=/(?:solo|exclusiv[oa])\s+(?:para\s+)?suscriptores?|contenido\s+(?:exclusivo|premium)\s+(?:para\s+)?suscriptores?|suscr[ií]bete\s+(?:para|y)\s+(?:continuar|leer)|inicia\s+sesi[oó]n\s+para\s+leer|subscriber\s+only|premium\s+content\s+(?:for\s+)?(?:subscribers?|members?)|members?\s+only/i;
const PREMIUM_PATH_RE=/(?:\/premium\/|\/suscriptores?\/|\/exclusive\/|\/exclusivo\/|\/plusg\/)/i;

function correctAccess(result={},pageUrl=''){
  const access=result.access||{};
  if(String(access.status||'UNKNOWN')!=='SUBSCRIBER_ONLY')return result;
  const signals=access.signals||{};
  const readableText=[result.title,result.description,result.body].map(x=>String(x||'')).join(' ');
  const chars=Number(result.sourceChars)||String(result.body||'').length;
  const fullReadable=(result.contentState==='COMPLETE'||chars>=1000)&&chars>=1000;
  const explicitLock=STRONG_LOCK_RE.test(readableText);
  const schemaLocked=signals.schemaLocked===true;
  const urlHint=signals.urlHint===true||PREMIUM_PATH_RE.test(String(pageUrl||result.finalUrl||''));

  // A generic phrase such as “contenido exclusivo de la liga”, or a dormant
  // paywall component in the DOM, must not classify a fully readable article
  // as subscriber-only. Preserve strong structural/current-page evidence.
  if(fullReadable&&!explicitLock&&!schemaLocked&&!urlHint){
    return{
      ...result,
      access:{
        ...access,
        status:'PUBLIC',
        confidence:'high',
        signals:{...signals,correctedFalsePositive:true,readableChars:chars}
      },
      isExclusive:false
    };
  }
  return result;
}

module.exports={correctAccess,STRONG_LOCK_RE,PREMIUM_PATH_RE};
