'use strict';

const STRONG_LOCK_RE=/(?:solo|exclusiv[oa])\s+(?:para\s+)?suscriptores?|contenido\s+(?:exclusivo|premium)\s+(?:para\s+)?suscriptores?|suscr[ií]bete\s+(?:para|y)\s+(?:continuar|leer)|inicia\s+sesi[oó]n\s+para\s+leer|subscriber\s+only|premium\s+content\s+(?:for\s+)?(?:subscribers?|members?)|members?\s+only/i;
const PREMIUM_PATH_RE=/(?:\/premium\/|\/suscriptores?\/|\/exclusive\/|\/exclusivo\/|\/plusg\/)/i;
const READABLE_PUBLIC_MIN=350;

function correctAccess(result={},pageUrl=''){
  const access=result.access||{};
  if(String(access.status||'UNKNOWN')!=='SUBSCRIBER_ONLY')return result;
  const signals=access.signals||{};
  const readableText=[result.title,result.description,result.body].map(x=>String(x||'')).join(' ');
  const chars=Number(result.sourceChars)||String(result.body||'').length;
  const state=String(result.contentState||'');
  const explicitLock=STRONG_LOCK_RE.test(readableText);
  const schemaLocked=signals.schemaLocked===true;
  const urlHint=signals.urlHint===true||PREMIUM_PATH_RE.test(String(pageUrl||result.finalUrl||''));
  const readableEnough=state==='COMPLETE'||chars>=READABLE_PUBLIC_MIN;

  // For EC's use case, EXCLUSIVO must mean that the current article is actually
  // blocked. Generic subscription widgets, generic editorial phrases and even
  // contradictory metadata must not override a substantial readable body.
  // A visible lock message still wins, as does structural/premium evidence when
  // the article body is only a teaser or is otherwise insufficient.
  if(explicitLock)return result;

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

  // No readable body and no strong current-page evidence: do not invent an
  // exclusive classification from a generic/dormant subscription component.
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
