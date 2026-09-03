'use strict';

const STRONG_LOCK_RE=/(?:solo|exclusiv[oa])\s+(?:para\s+)?suscriptores?|contenido\s+(?:exclusivo|premium)\s+(?:para\s+)?suscriptores?|suscr[ií]bete\s+(?:para|y)\s+(?:continuar|seguir|leer)(?:\s+leyendo)?|inicia\s+sesi[oó]n\s+para\s+(?:continuar|leer)(?:\s+leyendo)?|subscriber\s+only|premium\s+content\s+(?:for\s+)?(?:subscribers?|members?)|members?\s+only/i;
const PREMIUM_PATH_RE=/(?:\/premium\/|\/suscriptores?\/|\/exclusive\/|\/exclusivo\/|\/plusg\/)/i;
const READABLE_PUBLIC_MIN=350;

function correctAccess(result={},pageUrl=''){
  const access=result.access||{};
  if(String(access.status||'UNKNOWN')!=='SUBSCRIBER_ONLY')return result;
  const signals=access.signals||{};
  const readableText=[result.title,result.description,result.body].map(x=>String(x||'')).join(' ');
  const chars=Number(result.sourceChars)||String(result.body||'').length;
  const state=String(result.contentState||'');
  const explicitLock=signals.strongLock===true||STRONG_LOCK_RE.test(readableText);
  const schemaLocked=signals.schemaLocked===true;
  const urlHint=signals.urlHint===true||PREMIUM_PATH_RE.test(String(pageUrl||result.finalUrl||''));
  const readableEnough=state==='COMPLETE'||chars>=READABLE_PUBLIC_MIN;

  // A strong, current-page subscriber message always wins. Being technically
  // able to extract a long body does not make a paywalled article public.
  if(explicitLock)return{
    ...result,
    access:{...access,status:'SUBSCRIBER_ONLY',confidence:'high',signals:{...signals,strongLock:true}},
    isExclusive:true
  };

  // EC pages may include generic subscriber widgets, generic editorial uses of
  // “contenido exclusivo”, or contradictory schema. A substantial readable
  // article without a strong lock remains public to avoid false positives.
  if(readableEnough){
    return{
      ...result,
      access:{
        ...access,
        status:'PUBLIC',
        confidence:schemaLocked||urlHint?'medium':'high',
        signals:{
          ...signals,
          correctedFalsePositive:true,
          readableChars:chars,
          metadataContradicted:!!(schemaLocked||urlHint)
        }
      },
      isExclusive:false
    };
  }

  if(schemaLocked||urlHint)return result;

  return{
    ...result,
    access:{
      ...access,
      status:'UNKNOWN',
      confidence:'low',
      signals:{...signals,correctedUncertain:true,readableChars:chars}
    },
    isExclusive:false
  };
}

module.exports={correctAccess,STRONG_LOCK_RE,PREMIUM_PATH_RE,READABLE_PUBLIC_MIN};
