'use strict';

const editorial=require('./editorial');

const LIST_KEYWORDS=/\b(?:hor[oó]scopo|feriados?|calendario|tabla de posiciones|ranking|resultados?|cotizaciones?|predicciones?|programaci[oó]n|fixture|efem[eé]rides)\b/i;
const RAW_LIST_OPEN=/^(?:esta|estas|estos|a continuaci[oó]n)\s+(?:es|son|se presenta|presentamos)[^.!?]{0,55}\blista\b|\besta es la lista\b/i;
const DANGLING=/(?:[:;,]|\bentre (?:ellos|ellas|estos|estas)\s*)$/i;

function countMatches(text,re){return(String(text||'').match(re)||[]).length;}
function detectListStructure(story={},article={}){
  const title=String(story.title||article.title||''),body=String(article.body||story.description||''),all=`${title}\n${body}`;
  const explicit=countMatches(body,/(?:^|\n)\s*(?:LISTA|TABLA|ITEM|FILA)\s*:/gim);
  const bullets=countMatches(body,/(?:^|\n)\s*(?:[-•*]|\d{1,2}[.)])\s+/gm);
  const zodiac=countMatches(all,/\b(?:aries|tauro|g[eé]minis|c[aá]ncer|leo|virgo|libra|escorpio|sagitario|capricornio|acuario|piscis)\b/gi);
  const dateItems=countMatches(all,/\b(?:\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/gi);
  const tableish=countMatches(body,/(?:^|\n)[^\n]{0,80}\s(?:\d+|\d+[.,]\d+|\d+\s*[-–]\s*\d+)\s*$/gm);
  const keyword=LIST_KEYWORDS.test(all);
  const listMode=explicit>=2||bullets>=4||zodiac>=4||dateItems>=5||tableish>=5||keyword;
  const longList=listMode&&(explicit>=7||bullets>=9||zodiac>=8||dateItems>=9||tableish>=9||body.length>6500&&keyword);
  return{listMode,longList,explicit,bullets,zodiac,dateItems,tableish,keyword};
}
function closingExpected(story={},article={},settings={}){
  const feed=(settings.rssFeeds||[]).find(f=>f.id===story.feedId)||{};
  const override=String(feed.accessMode||'auto').toLowerCase(),status=String(article?.access?.status||'').toUpperCase(),exclusive=override==='exclusive'||status==='SUBSCRIBER_ONLY'||article?.isExclusive===true;
  if(exclusive&&settings.exclusiveClose?.enabled!==false&&feed.exclusiveCtaEnabled!==false)return true;
  return article?.sourceHadCTA===true&&feed.partialCtaEnabled===true;
}
function longListInstruction(story,article,settings,info){
  if(!info.listMode)return'';
  const medium=String(((settings.rssFeeds||[]).find(f=>f.id===story.feedId)||{}).publisherName||story.feedName||'el medio de origen').trim();
  if(info.longList){
    const cta=closingExpected(story,article,settings)?'No añadas una segunda llamada a consultar la fuente; GEC añadirá el cierre correspondiente.':`Cierra de forma natural indicando, sin URL, que la lista completa puede consultarse en ${medium}.`;
    return `\n\nREGLA ESPECIAL PARA LISTA EXTENSA:\n- La fuente contiene una lista extensa. NO leas ni enumeres todos los elementos.\n- Resume los datos principales y los elementos más útiles o representativos con criterio periodístico, sin inventar ni alterar cifras.\n- Redacta oraciones naturales para locución. No uses una estructura del tipo “esta es la lista:” seguida de ítems.\n- La cápsula debe tener introducción, desarrollo y cierre completos.\n- ${cta}`;
  }
  return `\n\nREGLA ESPECIAL PARA LISTA BREVE:\n- Integra los elementos relevantes en oraciones naturales; no copies una lista cruda ni termines abruptamente después del último ítem.\n- Evita fórmulas como “esta es la lista:” o una sucesión de viñetas.`;
}
function decorateBuilt(built,story,article,settings){const info=detectListStructure(story,article);if(!info.listMode)return built;const instruction=longListInstruction(story,article,settings,info);return{...built,prompt:`${built.prompt}${instruction}`,__ec0330ListMode:true,__ec0330LongList:!!info.longList,__ec0330ListInfo:info};}
function validateListResult(result,built={}){
  if(!built.__ec0330ListMode||String(result?.status||'').toUpperCase()!=='OK')return result;
  const script=String(result.script||'').replace(/\s+/g,' ').trim(),semi=(script.match(/;/g)||[]).length;
  if(RAW_LIST_OPEN.test(script)||DANGLING.test(script)||/\b(?:lista|los siguientes|las siguientes)\s*:\s*$/i.test(script)){
    const e=new Error('La IA devolvió una enumeración cruda o un cierre incompleto');e.code='FORMAT_GARBAGE';e.correction='Convierte la lista en una cápsula periodística narrativa, con introducción, síntesis y cierre natural. No uses “esta es la lista:” ni termines con dos puntos, coma o punto y coma.';throw e;
  }
  if(built.__ec0330LongList&&(semi>=7||countMatches(script,/(?:^|\n)\s*(?:[-•*]|\d+[.)])\s+/gm)>=5)){
    const e=new Error('La IA intentó leer demasiados elementos de una lista extensa');e.code='TOO_LONG';e.correction='La lista es extensa: resume solo los puntos principales en prosa y remite de forma natural a la nota completa, sin enumerar todos los elementos.';throw e;
  }
  return result;
}
function installEditorial0330(){
  if(editorial.__ec0330Installed)return;Object.defineProperty(editorial,'__ec0330Installed',{value:true});
  const baseBuild=editorial.buildPrompt,baseDoc=editorial.buildDocumentPrompt,baseValidate=editorial.validateEditorialResult;
  editorial.buildPrompt=function(story={},article={},settings={}){return decorateBuilt(baseBuild(story,article,settings),story,article,settings);};
  editorial.buildDocumentPrompt=function(doc={},settings={},options={}){return decorateBuilt(baseDoc(doc,settings,options),{title:doc.title||'',description:doc.text||'',feedName:'el medio de origen'},{title:doc.title||'',body:doc.text||doc.body||''},settings);};
  editorial.validateEditorialResult=function(result,sourceText,built={}){return validateListResult(baseValidate(result,sourceText,built),built);};
}

module.exports={installEditorial0330,detectListStructure,validateListResult,longListInstruction};
