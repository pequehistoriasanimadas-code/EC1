'use strict';

const TOKEN_OPEN='\uE210';
const TOKEN_CLOSE='\uE211';
const STRUCTURED_PATTERNS=[
  /\b(?:https?:\/\/|www\.)[^\s,;!?]+/giu,
  /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/gu,
  /(?:S\/\.?|PEN|US\$|USD|\$|€|EUR|£|GBP|JPY|CNY|RMB|¥)\s*[+-]?\d(?:[\d.,]*\d)?(?:\s*(?:millones?|billones?|miles?|mil))?/giu,
  /[+-]?\d(?:[\d.,]*\d)?\s*%/gu,
  /\b\d{1,2}[:.]\d{2}\s*(?:[ap]\.?\s*m\.?|h(?:oras?)?|hrs?\.?|horas?)?/giu,
  /\b\d{1,2}[\/-]\d{1,2}[\/-]\d{4}\b/gu,
  /\b\d(?:[\d.,]*\d)?\s*°\s*[CF]\b/giu,
  /\b\d(?:[\d.,]*\d)?\s*(?:km\/h|m\/s|GB\/s|Mbps|km²|m²|m³|kg|mg|km|cm|mm|ml|l|g|t|GB|MB|TB|MW|kW|ha)\b/giu,
  /\b(?:DNI|RUC)\s*(?:N\.?\s*[°º]?\s*)?\d{7,12}\b/giu,
  /\b(?:Ley|Decreto(?:\s+Supremo)?|Resoluci[oó]n)\s+N\.?\s*[°º]?\s*\d[\d-]{0,15}\b/giu,
  /\b(?:siglos?|cap[ií]tulo|tomo|volumen|parte|acto|Super\s+Bowl)\s+[IVXLCDM]{1,10}\b/gu,
  /\b[A-ZÁÉÍÓÚÜÑ][\p{L}\p{M}'’.-]+(?:\s+[A-ZÁÉÍÓÚÜÑ][\p{L}\p{M}'’.-]+){0,2}\s+[IVXLCDM]{1,10}\b/gu
];

function tokenFor(index){return `${TOKEN_OPEN}${index.toString(36)}${TOKEN_CLOSE}`;}

function protectStructuredText(input){
  let text=String(input||'');
  const stash=[];
  for(const rx of STRUCTURED_PATTERNS){
    text=text.replace(rx,m=>{const token=tokenFor(stash.length);stash.push(m);return token;});
  }
  const restore=value=>String(value??'').replace(new RegExp(`${TOKEN_OPEN}([0-9a-z]+)${TOKEN_CLOSE}`,'gi'),(m,k)=>{
    const i=parseInt(k,36);return Number.isInteger(i)&&i>=0&&i<stash.length?stash[i]:m;
  });
  return{text,restore,stash:[...stash]};
}

module.exports={protectStructuredText,STRUCTURED_PATTERNS,TOKEN_OPEN,TOKEN_CLOSE};
