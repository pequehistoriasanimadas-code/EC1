'use strict';

const fs=require('fs');
const path=require('path');
const {PronunciationNormalizer}=require('./pronunciation');

const nowIso=()=>new Date().toISOString();
const keyOf=s=>String(s||'').normalize('NFKC').trim().toLocaleLowerCase('es');
const TRIVIAL_ES=new Set(['apoyan','apoyo','hay','ley','muy','proveedor','proyecto','proyectos','ya','hoy','ayer','mañana','mayor','menor','nuevo','nueva','nuevos','nuevas','país','ciudad','empresa','empresas','mercado','grupo','ministro','presidente','gobierno']);
const LETTER_NAMES=new Set(['a','be','ce','de','e','efe','ge','hache','i','jota','ka','ele','eme','ene','eñe','o','pe','cu','erre','ese','te','u','uve','dobleuve','equis','ye','zeta']);
const SEMANTIC_WORDS=/\b(?:d[oó]lar(?:es)?|estadounidense(?:s)?|estados\s+unidos|estilo\s+de\s+vida|gobierno|pa[ií]s|moneda|soles?|millones?|billones?|empresa|mercado)\b/i;
const COUNTRY_CUES=/(?:gobierno|presidente|administraci[oó]n|congreso|senado|estado|pa[ií]s|relaciones|embajada|diplom[aá]tic|ciudadan|elecciones|washington|casa blanca|departamento de estado)/i;

function isAcronym(term){return /^[A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ0-9.-]{1,9}$/.test(String(term||''));}
function strongForeignSignal(term){const s=String(term||'');return /[wk]|sh|th|ph|oo|ee|ai|ou|oe|ae|ck|wh|gh|sch|tz|ss|style|life|news|ware|stream/i.test(s)||/[a-záéíóúüñ][A-ZÁÉÍÓÚÜÑ]/.test(s)||/[.'’]/.test(s);}
function isSimpleLowerSpanish(term){const s=String(term||'').trim();if(!s||s!==s.toLocaleLowerCase('es'))return false;const k=keyOf(s);if(TRIVIAL_ES.has(k))return true;if(strongForeignSignal(s))return false;return /^[a-záéíóúüñ-]+$/i.test(s)&&/[aeiouáéíóúüñ]/i.test(s);}
function normalizeToken(s){return keyOf(s).replace(/[^a-záéíóúüñ]/g,'');}
function isSafePhoneticPair(term,pronunciation){
  const from=String(term||'').trim(),to=String(pronunciation||'').trim();if(!from||!to)return false;
  if(SEMANTIC_WORDS.test(to)&&!SEMANTIC_WORDS.test(from))return false;
  const srcWords=from.split(/\s+/).filter(Boolean),dstWords=to.split(/\s+/).filter(Boolean);
  if(isAcronym(from)){
    if(dstWords.length===1)return dstWords[0].length<=Math.max(10,from.length*3)&&!SEMANTIC_WORDS.test(to);
    return dstWords.every(x=>LETTER_NAMES.has(normalizeToken(x))||/^[a-z]$/i.test(x));
  }
  if(srcWords.length===1&&dstWords.length>2)return false;
  if(srcWords.length>1&&dstWords.length>srcWords.length+1)return false;
  if(to.length>Math.max(24,from.length*3.2))return false;
  return true;
}
function contextualUs(text){
  const s=String(text||'');
  return s.replace(/\bUS\b(?!\$)/g,(m,offset,full)=>{const around=full.slice(Math.max(0,offset-90),Math.min(full.length,offset+100));return COUNTRY_CUES.test(around)?'Estados Unidos':m;});
}
function shouldPersistNegative(term){const s=String(term||'').trim();return !!s&&!isSimpleLowerSpanish(s)&&(isAcronym(s)||/\s/.test(s)||/^[A-ZÁÉÍÓÚÜÑ]/.test(s)||strongForeignSignal(s));}
function manualConfig(settings){const t=settings?.tts||{};return{manual:t.manualPronunciations&&typeof t.manualPronunciations==='object'?t.manualPronunciations:{},blocked:new Set((Array.isArray(t.pronunciationBlockedTerms)?t.pronunciationBlockedTerms:[]).map(keyOf))};}

function installPronunciation0323(){
  const proto=PronunciationNormalizer.prototype;if(proto.__ec0323PronunciationInstalled)return;Object.defineProperty(proto,'__ec0323PronunciationInstalled',{value:true});
  const baseLoad=proto.loadLearning,baseCandidates=proto.candidates,baseBasic=proto.basic,baseStatus=proto.status;

  proto.__ec0323ApplyManual=function(){
    const cfg=manualConfig(this.getSettings?.()||{}),entries=this.learning?.entries||{};let changed=false;
    for(const k of cfg.blocked){if(entries[k]){delete entries[k];changed=true;}}
    for(const [termRaw,value] of Object.entries(cfg.manual)){
      const term=String(termRaw||'').trim(),k=keyOf(term);if(!k||cfg.blocked.has(k))continue;
      const obj=value&&typeof value==='object'?value:{pronunciation:String(value||''),needsReplacement:String(value||'').trim()!==''},needs=obj.needsReplacement!==false,pron=needs?this.validatePronunciation(term,obj.pronunciation):'';if(needs&&!pron)continue;
      const current=entries[k],next=this.normalizeEntry({...current,term,pronunciation:pron,needsReplacement:needs,source:'manual',confidence:1,uses:current?.uses||0,createdAt:current?.createdAt||nowIso(),updatedAt:nowIso(),lastValidated:nowIso()});
      if(!current||current.pronunciation!==next.pronunciation||current.needsReplacement!==next.needsReplacement||current.source!=='manual'){entries[k]=next;changed=true;}
    }
    if(changed)this.saveLearning();return changed;
  };

  proto.__ec0323Migrate=function(){
    const marker=path.join(this.dataDir,'pronunciation-migration-v4-0.3.23.json');if(fs.existsSync(marker)){this.__ec0323ApplyManual();return;}
    const report={version:4,at:nowIso(),found:Object.keys(this.learning?.entries||{}).length,removedSemantic:0,removedTrivial:0,manualKept:0,backup:''};
    try{
      if(fs.existsSync(this.learningFile)){const backup=path.join(this.dataDir,'pronunciation-learning.backup-0.3.23.json');if(!fs.existsSync(backup))fs.copyFileSync(this.learningFile,backup);report.backup=backup;}
      for(const [k,e] of Object.entries(this.learning?.entries||{})){
        if(/manual/i.test(e?.source||'')){report.manualKept++;continue;}
        if(e?.needsReplacement){if(!isSafePhoneticPair(e.term,e.pronunciation)){delete this.learning.entries[k];report.removedSemantic++;}}
        else if(isSimpleLowerSpanish(e?.term||'')){delete this.learning.entries[k];report.removedTrivial++;}
      }
      this.__ec0323ApplyManual();this.saveLearning();fs.writeFileSync(marker,JSON.stringify(report,null,2),'utf8');this.__ec0323MigrationReport=report;
    }catch(e){this.__ec0323MigrationReport={...report,error:e.message||String(e)};}
  };

  proto.loadLearning=function(){const r=baseLoad.call(this);this.__ec0323Migrate();return r;};

  proto.candidates=function(text){
    const cfg=manualConfig(this.getSettings?.()||{}),session=this.__ec0323NegativeSession||(this.__ec0323NegativeSession=new Set());
    return baseCandidates.call(this,text).filter(c=>{
      const term=String(c?.term||'').trim(),k=keyOf(term);if(!term||cfg.blocked.has(k)||session.has(k)||TRIVIAL_ES.has(k))return false;
      if(term===term.toLocaleLowerCase('es')&&isSimpleLowerSpanish(term))return false;
      return true;
    }).slice(0,14);
  };

  proto.requestSmartMap=async function(items,timeoutMs){
    const terms=(items||[]).slice(0,14).map(x=>({term:x.term,context:x.context}));
    const rules='Devuelve SOLO JSON válido con {"items":[{"term":"texto exacto","needs_replacement":true,"pronunciation":"aproximación fonética simple","confidence":0.90}]}. Tu única tarea es FONÉTICA para un TTS en español latinoamericano: conserva exactamente el significado y no traduzcas, no expliques, no desarrolles siglas por su significado y no sustituyas monedas, países o conceptos. Una palabra extranjera debe seguir siendo la misma palabra escrita de forma que el TTS la pronuncie mejor. Una sigla puede deletrearse por letras, pero nunca convertirse en su significado. Ejemplos PROHIBIDOS: lifestyle→estilo de vida; US→dólares estadounidenses. Si el término ya se pronuncia razonablemente en español, usa needs_replacement=false y pronunciation vacío. Nunca uses IPA ni markdown.';
    const prompt=`/no_think\n${rules}\nENTRADAS: ${JSON.stringify(terms)}`;
    const r=await fetch(`http://127.0.0.1:${this.port}/v1/chat/completions`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:'local',messages:[{role:'user',content:prompt}],temperature:0,max_tokens:500,stream:false}),signal:AbortSignal.timeout(Math.max(1200,timeoutMs))});
    if(!r.ok)throw new Error(`Normalizador HTTP ${r.status}`);const j=await r.json();return this.parseSmartResponse(j?.choices?.[0]?.message?.content||'',terms.map(x=>x.term));
  };

  proto.basic=function(text){return baseBasic.call(this,contextualUs(text));};

  proto.normalize=async function(script,{smart=true}={}){
    this.__ec0323ApplyManual();this.__ec0323Migrate();
    const started=Date.now(),raw=String(script||''),settings=this.getSettings?.()||{},cfg=manualConfig(settings),maxMs=Math.max(5000,Math.min(30000,Number(settings?.tts?.pronunciationMaxSeconds)||15)*1000),deadline=started+maxMs;
    const candidates=this.candidates(raw),unknown=[];let cachedUsed=0,learningDirty=false,rejectedCount=0;
    for(const c of candidates){const k=keyOf(c.term),entry=this.learning.entries[k];if(entry&&!cfg.blocked.has(k)){entry.uses=(entry.uses||0)+1;entry.updatedAt=entry.updatedAt||nowIso();learningDirty=true;cachedUsed++;}else unknown.push(c);}

    let qwen={},qwenAttempted=false,qwenError='';
    if(smart&&unknown.length&&this.modelReady()&&Date.now()<deadline-1500){qwenAttempted=true;try{qwen=await this.smartMap(unknown,deadline);}catch(e){qwenError=e.message||String(e);this.onEvent({type:'pronunciation-warning',message:qwenError});}}
    const claudeCandidates=unknown.filter(c=>{const local=qwen[c.term],confidence=Math.max(0,Math.min(1,Number(local?.confidence)||0));return !local||confidence<.88||(local.needsReplacement&&(!local.to||!isSafePhoneticPair(c.term,local.to)));});
    let claude={used:false,items:[]},claudeAttempted=false,claudeError='';
    if(smart&&claudeCandidates.length&&typeof this.claudeVerify==='function'&&settings?.tts?.pronunciationClaudeVerify!==false&&Date.now()<deadline-1800){claudeAttempted=true;try{const remaining=Math.max(1500,deadline-Date.now()-300);claude=await this.claudeVerify(claudeCandidates,qwen,settings,remaining)||{used:false,items:[]};}catch(e){claudeError=e.message||String(e);this.onEvent({type:'pronunciation-warning',message:`Claude: ${claudeError}`});}}

    const learnedNow={},handled=new Set(),session=this.__ec0323NegativeSession||(this.__ec0323NegativeSession=new Set());let learnedCount=0;
    const accept=(term,needs,to,source,confidence)=>{
      const k=keyOf(term);if(cfg.blocked.has(k))return false;
      if(!needs){if(shouldPersistNegative(term)){this.learn(term,'',false,source,confidence);learningDirty=true;learnedCount++;}else session.add(k);return true;}
      const valid=this.validatePronunciation(term,to);if(!valid||!isSafePhoneticPair(term,valid)){rejectedCount++;this.onEvent({type:'pronunciation-rejected',term,proposal:String(to||''),reason:'posible traducción o cambio semántico'});return false;}
      this.learn(term,valid,true,source,confidence);learningDirty=true;learnedCount++;learnedNow[term]=valid;return true;
    };
    if(claude?.used){for(const x of claude.items||[]){const term=String(x.term||'').trim();if(!term)continue;handled.add(keyOf(term));const confidence=Math.max(0,Math.min(1,Number(x.confidence)||0));if(confidence<.65)continue;const needs=!!x.needsReplacement,local=qwen[term],source=local&&local.needsReplacement===needs&&keyOf(local.to||'')===keyOf(x.pronunciation||'')?'qwen+claude':'claude';accept(term,needs,x.pronunciation,source,confidence);}}
    for(const c of unknown){if(handled.has(keyOf(c.term)))continue;const local=qwen[c.term];if(!local)continue;const confidence=Math.max(0,Math.min(1,Number(local.confidence)||0));if(confidence<.88)continue;accept(c.term,!!local.needsReplacement,local.to,'qwen',confidence);}
    if(learningDirty)this.saveLearning();

    const persistentMap={};for(const e of Object.values(this.learning.entries||{})){const k=keyOf(e?.term);if(cfg.blocked.has(k)||!e?.needsReplacement||!e?.pronunciation)continue;persistentMap[e.term]=e.pronunciation;}
    let out=this.applyMap(raw,{...persistentMap,...learnedNow});out=this.basic(out);
    const smartAttempted=qwenAttempted||claudeAttempted,smartFailed=smartAttempted&&!Object.keys(qwen).length&&!(claude?.used&&claude.items?.length)&&(!!qwenError||!!claudeError),errors=[qwenError&&`Qwen: ${qwenError}`,claudeError&&`Claude: ${claudeError}`].filter(Boolean).join(' | ');
    return{text:out,elapsedMs:Date.now()-started,smartUsed:cachedUsed>0||Object.keys(learnedNow).length>0,smartAttempted,smartFailed,smartError:errors,qwenAttempted,qwenUsed:Object.keys(qwen).length>0,claudeAttempted,claudeUsed:!!claude?.used,learnedCount,rejectedCount,modelReady:this.modelReady(),learningEntries:Object.keys(this.learning.entries).length,cacheEntries:Object.keys(this.learning.entries).length};
  };

  proto.status=function(){
    this.__ec0323ApplyManual();this.__ec0323Migrate();const s=baseStatus.call(this),cfg=manualConfig(this.getSettings?.()||{}),list=Object.values(this.learning.entries||{}).filter(e=>!cfg.blocked.has(keyOf(e.term))).sort((a,b)=>a.term.localeCompare(b.term,'es',{sensitivity:'base'}));
    return{...s,learningEntries:list.length,replacementEntries:list.filter(x=>x.needsReplacement).length,negativeEntries:list.filter(x=>!x.needsReplacement).length,manualEntries:list.filter(x=>/manual/i.test(x.source||'')).length,learningList:list.map(x=>({term:x.term,pronunciation:x.pronunciation,needsReplacement:!!x.needsReplacement,source:x.source,confidence:x.confidence,uses:x.uses||0,manual:/manual/i.test(x.source||'')})),migration0323:this.__ec0323MigrationReport||null,semanticGuard:true,contextualRules:true};
  };
}

function installVersion0323Policy(){installPronunciation0323();}
module.exports={installVersion0323Policy,isSafePhoneticPair,contextualUs,isSimpleLowerSpanish,strongForeignSignal};
