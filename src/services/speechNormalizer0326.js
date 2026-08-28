'use strict';

const VERSION='1.0.0-es-PE';
const MONTHS=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const UNITS={
  'km/h':['kilómetro por hora','kilómetros por hora'],km:['kilómetro','kilómetros'],kg:['kilogramo','kilogramos'],
  'm²':['metro cuadrado','metros cuadrados'],m2:['metro cuadrado','metros cuadrados'],cm:['centímetro','centímetros'],mm:['milímetro','milímetros'],
  gb:['gigabyte','gigabytes'],mb:['megabyte','megabytes'],tb:['terabyte','terabytes'],mw:['megavatio','megavatios'],kw:['kilovatio','kilovatios'],ha:['hectárea','hectáreas']
};
const SMALL=['cero','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve','diez','once','doce','trece','catorce','quince','dieciséis','diecisiete','dieciocho','diecinueve','veinte','veintiuno','veintidós','veintitrés','veinticuatro','veinticinco','veintiséis','veintisiete','veintiocho','veintinueve'];
const TENS=['','','veinte','treinta','cuarenta','cincuenta','sesenta','setenta','ochenta','noventa'];
const HUNDREDS=['','ciento','doscientos','trescientos','cuatrocientos','quinientos','seiscientos','setecientos','ochocientos','novecientos'];
const ORD_UNITS=['','primero','segundo','tercero','cuarto','quinto','sexto','séptimo','octavo','noveno'];
const ORD_TENS=['','décimo','vigésimo','trigésimo','cuadragésimo','quincuagésimo','sexagésimo','septuagésimo','octogésimo','nonagésimo'];
const HTML_ENTITIES={nbsp:' ',amp:' y ',quot:'"',apos:"'",lt:' menor que ',gt:' mayor que '};
const SPORTS_HINT=/(partido|gol(?:es)?|marcador|resultado|gan[oó]|perdi[oó]|empat[oó]|venci[oó]|derrot[oó]|copa|liga|torneo|selecci[oó]n|f[uú]tbol|vs\.?|contra)/i;
const MODEL_HINT=/(?:\b(?:F|G|COP|COVID|iPhone|iOS|Windows|Android|PlayStation|PS|Xbox|RTX|GTX|USB|HDMI)[- .]?\d[\w.-]*\b)|(?:\bv?\d+\.\d+(?:\.\d+)+\b)/gi;

function cleanSpaces(s){return String(s||'').replace(/[ \t]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim();}
function normalizeUnicode(text){
  let s=String(text||'').normalize('NFC').replace(/[\u00A0\u2007\u202F]/g,' ').replace(/[\u200B-\u200D\u2060\uFEFF]/g,'');
  s=s.replace(/&([a-z]+);/gi,(m,k)=>HTML_ENTITIES[k.toLowerCase()]??m).replace(/&#(\d+);/g,(m,n)=>{try{return String.fromCodePoint(Number(n));}catch{return m;}});
  s=s.replace(/[•▪◦►▶◆◇★☆●○■□→⇒➜➤]+/g,'. ').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu,' ');
  return cleanSpaces(s);
}
function apocope(words){return String(words).replace(/veintiuno$/,'veintiún').replace(/ y uno$/,' y un').replace(/uno$/,'un');}
function feminine(words){return String(words).replace(/veintiuno$/,'veintiuna').replace(/ y uno$/,' y una').replace(/uno$/,'una').replace(/doscientos$/,'doscientas').replace(/trescientos$/,'trescientas').replace(/cuatrocientos$/,'cuatrocientas').replace(/quinientos$/,'quinientas').replace(/seiscientos$/,'seiscientas').replace(/setecientos$/,'setecientas').replace(/ochocientos$/,'ochocientas').replace(/novecientos$/,'novecientas');}
function under100(n){n=Math.trunc(n);if(n<30)return SMALL[n]||'';const t=Math.trunc(n/10),u=n%10;return u?`${TENS[t]} y ${SMALL[u]}`:TENS[t];}
function under1000(n){n=Math.trunc(n);if(n<100)return under100(n);if(n===100)return'cien';const h=Math.trunc(n/100),r=n%100;return `${HUNDREDS[h]}${r?' '+under100(r):''}`;}
function integerWords(value){
  let n=typeof value==='bigint'?value:BigInt(Math.trunc(Number(value)));
  if(n===0n)return'cero';if(n<0n)return`menos ${integerWords(-n)}`;
  if(n>999999999999999n)return String(n).split('').map(d=>SMALL[Number(d)]).join(' ');
  const parts=[];
  const billones=n/1000000000000n;n%=1000000000000n;
  if(billones){parts.push(billones===1n?'un billón':`${apocope(integerWords(billones))} billones`);}
  const millones=n/1000000n;n%=1000000n;
  if(millones){parts.push(millones===1n?'un millón':`${apocope(integerWords(millones))} millones`);}
  const miles=n/1000n;n%=1000n;
  if(miles){parts.push(miles===1n?'mil':`${apocope(under1000(Number(miles)))} mil`);}
  if(n)parts.push(under1000(Number(n)));
  return parts.join(' ');
}
function parseNumber(raw,{dotDecimal=false}={}){
  let s=String(raw||'').trim().replace(/\s/g,''),sign='';if(/^[+-]/.test(s)){sign=s[0];s=s.slice(1);}if(!/^\d[\d.,]*$/.test(s))return null;
  let intPart=s,decPart='';const dots=(s.match(/\./g)||[]).length,commas=(s.match(/,/g)||[]).length;
  if(dots&&commas){const lastDot=s.lastIndexOf('.'),lastComma=s.lastIndexOf(','),decSep=lastComma>lastDot?',':'.',thSep=decSep===','?'.':',';const idx=s.lastIndexOf(decSep);intPart=s.slice(0,idx).split(thSep).join('').split(decSep).join('');decPart=s.slice(idx+1).replace(/[.,]/g,'');}
  else if(commas){const idx=s.lastIndexOf(',');intPart=s.slice(0,idx).replace(/,/g,'');decPart=s.slice(idx+1);}
  else if(dots){
    if(dots>1&&s.split('.').slice(1).every(x=>x.length===3)){intPart=s.replace(/\./g,'');}
    else if(dots===1){const [a,b]=s.split('.');if(dotDecimal||b.length<3){intPart=a;decPart=b;}else if(b.length===3){intPart=a+b;}else{intPart=a;decPart=b;}}
    else intPart=s.replace(/\./g,'');
  }
  intPart=intPart.replace(/^0+(?=\d)/,'')||'0';
  try{return{negative:sign==='-',positive:sign==='+',integer:BigInt(intPart),decimal:decPart};}catch{return null;}
}
function decimalWords(dec){if(!dec)return'';if(dec.length<=2&&!/^0/.test(dec))return integerWords(BigInt(dec));return dec.split('').map(d=>SMALL[Number(d)]).join(' ');}
function numberWords(raw,opts={}){const p=parseNumber(raw,opts);if(!p)return String(raw);let out=integerWords(p.integer);if(p.decimal)out+=` coma ${decimalWords(p.decimal)}`;if(p.negative)out=`menos ${out}`;else if(p.positive)out=`más ${out}`;return out;}
function ordinalWords(n,{female=false,apocopated=false}={}){n=Number(n);if(!Number.isInteger(n)||n<1||n>100)return integerWords(BigInt(Math.max(0,Math.trunc(n))));if(n===100)return female?'centésima':'centésimo';const t=Math.trunc(n/10),u=n%10;let parts=[];if(t)parts.push(ORD_TENS[t]);if(u)parts.push(ORD_UNITS[u]);let out=parts.join(' ');if(female)out=out.replace(/o\b/g,'a');if(apocopated)out=out.replace(/primero$/,'primer').replace(/tercero$/,'tercer');return out;}
function hourWords(h,m){h=Number(h);m=Number(m);if(h===0&&m===0)return'medianoche';if(h===12&&m===0)return'mediodía';const h12=h%12||12;let hw=integerWords(BigInt(h12));if(h12===1)hw='una';let part=h<6?'de la madrugada':h<12?'de la mañana':h<20?'de la tarde':'de la noche';if(m===0)return`${hw} ${part}`;return`${hw} y ${integerWords(BigInt(m))} ${part}`;}
function spokenDigits(raw){return String(raw).replace(/\D/g,'').split('').map(d=>SMALL[Number(d)]).join(' ');}
function nounNumber(raw,noun,{femaleNoun=false,dotDecimal=false}={}){const p=parseNumber(raw,{dotDecimal});if(!p)return`${raw} ${noun}`;let w=numberWords(raw,{dotDecimal});if(!p.decimal){if(femaleNoun)w=feminine(w);else w=apocope(w);}return`${w} ${noun}`;}
function currencyText(code,raw,scale=''){
  const p=parseNumber(raw,{dotDecimal:false});if(!p)return`${raw} ${scale} ${code}`.trim();const scaled=String(scale||'').trim().toLowerCase();const info={PEN:['sol','soles','céntimo','céntimos'],USD:['dólar','dólares','centavo','centavos'],EUR:['euro','euros','céntimo','céntimos'],GBP:['libra','libras','penique','peniques'],JPY:['yen','yenes','sen','sen']}[code]||['unidad','unidades','centavo','centavos'];
  if(scaled){const amount=numberWords(raw);const amountAdj=!p.decimal?apocope(amount):amount;const scaleOut=/^mill[oó]n$/i.test(scaled)?'millón':/^millones$/i.test(scaled)?'millones':/^bill[oó]n$/i.test(scaled)?'billón':/^billones$/i.test(scaled)?'billones':/^mil(?:es)?$/i.test(scaled)?'mil':scaled;const de=/^(millón|millones|billón|billones)$/i.test(scaleOut)?' de':'';return`${amountAdj} ${scaleOut}${de} ${info[1]}`;}
  if(p.decimal&&p.decimal.length===2){const major=p.integer===1n?info[0]:info[1],minorN=BigInt(p.decimal),minor=minorN===1n?info[2]:info[3];return`${apocope(integerWords(p.integer))} ${major} con ${apocope(integerWords(minorN))} ${minor}`;}
  const major=p.integer===1n&&!p.decimal?info[0]:info[1];return`${p.decimal?numberWords(raw):apocope(integerWords(p.integer))} ${major}`;
}

function normalizeSpeech(input,{enabled=true}={}){
  const original=String(input||'');if(!enabled)return{text:original,version:VERSION,transforms:[],changed:false};
  const transforms=[];let text=normalizeUnicode(original);if(text!==original)transforms.push('unicode/limpieza');
  const stash=[];const protect=(rx,fn,label)=>{text=text.replace(rx,(...args)=>{let value;try{value=fn(...args);}catch{return args[0];}const alpha=(n)=>{let x=n+1,r='';while(x){x--;r=String.fromCharCode(65+(x%26))+r;x=Math.floor(x/26);}return r;};const token=`\uE000${alpha(stash.length)}\uE001`;stash.push(String(value));if(label)transforms.push(label);return token;});};
  const restore=()=>{const index=(letters)=>{let n=0;for(const ch of letters)n=n*26+(ch.charCodeAt(0)-64);return n-1;};text=text.replace(/\uE000([A-Z]+)\uE001/g,(m,k)=>stash[index(k)]??m);};

  protect(MODEL_HINT,m=>m,'identificador protegido');
  protect(/\b(?:https?:\/\/|www\.)[^\s,;!?]+/gi,m=>m,'URL protegida');
  protect(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g,m=>m,'correo protegido');
  protect(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/g,(m,d,mo,y)=>{const di=Number(d),mi=Number(mo);if(mi<1||mi>12||di<1||di>31)return m;return`${integerWords(BigInt(di))} de ${MONTHS[mi-1]} de ${integerWords(BigInt(y))}`;},'fecha');
  protect(/\b(\d{1,2}):([0-5]\d)\s*([ap])\.?\s*m\.?\b/gi,(m,h,mi,ap)=>{let hh=Number(h)%12;if(ap.toLowerCase()==='p')hh+=12;return hourWords(hh,Number(mi));},'hora');
  protect(/\b([01]?\d|2[0-3]):([0-5]\d)\s*(?:h(?:oras?)?|hrs?\.?|horas?)?\b/gi,(m,h,mi)=>hourWords(h,mi),'hora');
  protect(/\b([01]?\d|2[0-3])\.([0-5]\d)\s*(?:h(?:oras?)?|hrs?\.?|horas?)\b/gi,(m,h,mi)=>hourWords(h,mi),'hora');
  const moneyScale='(?:millones|mill[oó]n|billones|bill[oó]n|miles|mil)?';
  protect(new RegExp(`(?:S\\/\\.?|PEN)\\s*([+-]?\\d[\\d.,]*)\\s*(${moneyScale})`,'gi'),(m,n,s)=>currencyText('PEN',n,s),'moneda');
  protect(new RegExp(`(?:US\\$|USD|\\$)\\s*([+-]?\\d[\\d.,]*)\\s*(${moneyScale})`,'gi'),(m,n,s)=>currencyText('USD',n,s),'moneda');
  protect(new RegExp(`(?:€|EUR)\\s*([+-]?\\d[\\d.,]*)\\s*(${moneyScale})`,'gi'),(m,n,s)=>currencyText('EUR',n,s),'moneda');
  protect(new RegExp(`(?:£|GBP)\\s*([+-]?\\d[\\d.,]*)\\s*(${moneyScale})`,'gi'),(m,n,s)=>currencyText('GBP',n,s),'moneda');
  protect(/([+-]?\d[\d.,]*)\s*%/g,(m,n)=>`${numberWords(n,{dotDecimal:/\.\d{1,2}$/.test(n)&&!n.includes(',')})} por ciento`,'porcentaje');
  protect(/([+-]?\d[\d.,]*)\s+por ciento\b/gi,(m,n)=>`${numberWords(n,{dotDecimal:/\.\d{1,2}$/.test(n)&&!n.includes(',')})} por ciento`,'porcentaje');
  protect(/(\d[\d.,]*)\s*°\s*C\b/gi,(m,n)=>`${numberWords(n)} grados Celsius`,'temperatura');
  protect(/\b(\d{1,3})(?:°|º|\.\s*(?:º|o|er)?)\s+(aniversario|puesto|lugar|congreso|campeonato|festival|premio)\b/gi,(m,n,noun)=>`${ordinalWords(Number(n),{apocopated:/lugar|puesto/.test(noun.toLowerCase())})} ${noun}`,'ordinal');
  protect(/\b(\d{1,3})(?:ª|\.\s*ª?)\s+(edici[oó]n|fecha|jornada)\b/gi,(m,n,noun)=>`${ordinalWords(Number(n),{female:true})} ${noun}`,'ordinal');
  protect(/\b(\d{1,3})\s*°/g,(m,n)=>`${integerWords(BigInt(n))} grados`,'grados');
  protect(/\b(?:DNI|de ene i)\s*(?:N\.?\s*[°º]?\s*)?(\d{7,9})\b/gi,(m,n)=>`de ene i ${spokenDigits(n)}`,'DNI');
  protect(/\b(?:RUC|erre u ce)\s*(?:N\.?\s*[°º]?\s*)?(\d{10,12})\b/gi,(m,n)=>`erre u ce ${spokenDigits(n)}`,'RUC');
  protect(/\b(?:tel[eé]fono|celular)\s*[:Nn°º.]*\s*(\+?\d[\d -]{6,16})\b/gi,(m,n)=>`${m.split(/[:Nn°º.]/)[0].trim()} ${spokenDigits(n)}`,'teléfono');
  protect(/\b(Ley|Decreto|Resoluci[oó]n)\s+N\.?\s*[°º]?\s*(\d{1,7})\b/gi,(m,t,n)=>`${t} número ${integerWords(BigInt(n))}`,'documento');
  for(const [unit,[sg,pl]] of Object.entries(UNITS)){
    const escaped=unit.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    protect(new RegExp(`\\b(\\d[\\d.,]*)\\s*${escaped}\\b`,'gi'),(m,n)=>{const p=parseNumber(n);const noun=p&&!p.decimal&&p.integer===1n?sg:pl;return nounNumber(n,noun);},'unidad');
  }
  protect(/\b(\d{1,5})\s*[-–]\s*(\d{1,5})\s+(años?|d[ií]as?|meses?|personas?|kil[oó]metros?|metros?)\b/gi,(m,a,b,noun)=>`${integerWords(BigInt(a))} a ${integerWords(BigInt(b))} ${noun}`,'rango');
  protect(/\b(\d{1,3})\s*[-–]\s*(\d{1,3})\b/g,(m,a,b,offset,whole)=>{const ctx=whole.slice(Math.max(0,offset-45),Math.min(whole.length,offset+m.length+45));if(SPORTS_HINT.test(ctx))return`${integerWords(BigInt(a))} a ${integerWords(BigInt(b))}`;return m;},'marcador');
  protect(/\b(1)\/(2|3|4)\b/g,(m,a,b)=>({2:'un medio',3:'un tercio',4:'un cuarto'}[b]),'fracción');
  protect(/\b(\d+)\/(\d+)\b/g,(m,a,b)=>`${integerWords(BigInt(a))} sobre ${integerWords(BigInt(b))}`,'fracción');
  protect(/(?<![\p{L}\p{N}_])([+-]?\d{1,9}(?:[.,]\d+)?)\s+(millones|mill[oó]n|billones|bill[oó]n|miles|mil)\b/giu,(m,n,scale)=>{const p=parseNumber(n);let w=numberWords(n);if(p&&!p.decimal)w=apocope(w);return`${w} ${scale}`;},'escala');
  protect(/(?<![\p{L}\p{N}_])(\d{1,4})\s+(personas|mujeres|candidatas|empresas|familias|viviendas)\b/giu,(m,n,noun)=>`${feminine(integerWords(BigInt(n)))} ${noun}`,'concordancia');
  protect(/\b(20\d{2})\b/g,(m,y)=>integerWords(BigInt(y)),'año');
  protect(/(?<![\p{L}\p{N}_])([+-]?\d(?:[\d.,]*\d)?)(?![\p{L}\p{N}_])/gu,(m,n)=>numberWords(n),'número');
  const beforeProsody=text;
  text=text.replace(/^([A-ZÁÉÍÓÚÑ][\p{L}\p{M} .'’\-]{0,28}):\s+(\p{L})/u,(m,p,c)=>`${p}. ${c.toLocaleUpperCase('es')}`);
  text=text.replace(/;\s+/g,'. ').replace(/\s+[—–]\s+/g,', ').replace(/…+/g,'. ');
  text=text.replace(/\s*\.\s*\./g,'. ').replace(/\s+,/g,',').replace(/\s+\./g,'.').replace(/([.!?])(?=\p{L})/gu,'$1 ');
  restore();
  text=text.replace(/\ba las una de la\b/gi,'a la una de la');
  text=cleanSpaces(text);
  if(text!==beforeProsody)transforms.push('prosodia');
  return{text,version:VERSION,transforms:[...new Set(transforms)],changed:text!==original};
}

function validateSpeech(original,candidate){const o=String(original||''),c=String(candidate||'');if(!c.trim())return{ok:false,reason:'texto vacío'};if(/[\uE000\uE001]|__EC_|\b(?:undefined|NaN|null)\b/.test(c))return{ok:false,reason:'marcador interno residual'};if(c.length>Math.max(120,o.length*5+80))return{ok:false,reason:'expansión excesiva'};return{ok:true,reason:''};}

module.exports={VERSION,normalizeSpeech,validateSpeech,numberWords,integerWords,parseNumber,ordinalWords,hourWords,currencyText};
