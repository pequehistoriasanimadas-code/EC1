const fs=require('fs');
const path=require('path');
const os=require('os');
const {spawn}=require('child_process');
const {Readable}=require('stream');

const MODEL_URL='https://huggingface.co/ggml-org/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q4_0.gguf?download=true';
const MODEL_NAME='Qwen3-0.6B-Q4_0.gguf';
const LEARNING_SCHEMA=2;
const MAX_CANDIDATES=18;

function findRecursive(dir,filename){
  if(!fs.existsSync(dir))return'';
  for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    const p=path.join(dir,e.name);
    if(e.isDirectory()){const f=findRecursive(p,filename);if(f)return f;}
    else if(e.name.toLowerCase()===filename.toLowerCase())return p;
  }
  return'';
}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const esc=s=>String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const keyOf=s=>String(s||'').normalize('NFKC').trim().toLocaleLowerCase('es');
const nowIso=()=>new Date().toISOString();

const BASIC=[
  ['EE.UU.','Estados Unidos'],['EE. UU.','Estados Unidos'],
  ['TV','te uve'],['DNI','de ene i'],['RUC','erre u ce'],['AFP','a efe pe'],
  ['FMI','efe eme i'],['BCR','be ce erre'],['BCRP','be ce erre pe'],
  ['CEO','si i ou'],['USB','u ese be'],['HDMI','hache de eme i'],
  ['OpenAI','óupen ei ai'],['YouTube','yutub'],['WhatsApp','guatsap'],
  ['Apple','ápol'],['Google','gúgol'],['Microsoft','máicrosoft'],
  ['TikTok','tíktok'],['iPhone','áifon'],['NVIDIA','envidia']
];
const BASIC_KEYS=new Set(BASIC.map(([x])=>keyOf(x)));
const COMMON_ES=new Set([
  'el','la','los','las','un','una','unos','unas','de','del','al','y','o','en','por','para','con','sin','sobre','entre','desde','hasta',
  'este','esta','estos','estas','ese','esa','esos','esas','aquel','aquella','que','como','cuando','donde','según','tras','ante','contra',
  'lunes','martes','miércoles','jueves','viernes','sábado','domingo','enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre',
  'perú','lima','congreso','gobierno','presidente','ministro','economía','política','actualidad','nacional','internacional'
]);

function currencyPhrase(amount,scale,currency){
  const s=String(scale||'').trim();
  if(!s)return`${amount} ${currency}`;
  const needsDe=/^(millón|millones|billón|billones)$/i.test(s);
  return`${amount} ${s}${needsDe?' de':''} ${currency}`;
}
function normalizeCurrency(text){
  let out=String(text||'');
  const scale='(millones?|billones?|miles?|mil)?';
  out=out.replace(new RegExp(`S\\/\\s*(\\d+(?:[.,]\\d+)?)\\s*${scale}`,'gi'),(_,amount,s)=>currencyPhrase(amount,s,'soles'));
  out=out.replace(new RegExp(`(?:US\\$|USD|\\$)\\s*(\\d+(?:[.,]\\d+)?)\\s*${scale}`,'gi'),(_,amount,s)=>currencyPhrase(amount,s,'dólares'));
  out=out.replace(/(\d+(?:[.,]\d+)?)\s+soles\s+(millones?|billones?)/gi,(_,n,s)=>`${n} ${s} de soles`);
  out=out.replace(/(\d+(?:[.,]\d+)?)\s+dólares\s+(millones?|billones?)/gi,(_,n,s)=>`${n} ${s} de dólares`);
  out=out.replace(/(\d+(?:[.,]\d+)?)\s+soles\s+(mil|miles)/gi,(_,n,s)=>`${n} ${s} soles`);
  out=out.replace(/(\d+(?:[.,]\d+)?)\s+dólares\s+(mil|miles)/gi,(_,n,s)=>`${n} ${s} dólares`);
  return out;
}
function unicodeBoundaryRegex(text,flags='giu'){
  return new RegExp(`(?<![\\p{L}\\p{N}_])${esc(text)}(?![\\p{L}\\p{N}_])`,flags);
}
function sentenceContext(text,index,max=360){
  const s=String(text||'');
  let a=Math.max(0,index),b=Math.min(s.length,index+1);
  while(a>0&&!/[.!?\n]/.test(s[a-1]))a--;
  while(b<s.length&&!/[.!?\n]/.test(s[b]))b++;
  const sentence=s.slice(a,Math.min(s.length,b+1)).replace(/\s+/g,' ').trim();
  if(sentence.length<=max)return sentence;
  const local=Math.max(0,index-a);
  const start=Math.max(0,Math.min(sentence.length-max,local-Math.floor(max/2)));
  return sentence.slice(start,start+max).trim();
}
function isCapitalized(term){return /^\p{Lu}[\p{L}\p{M}'’.-]*$/u.test(term);}
function isAcronym(term){return /^\p{Lu}[\p{Lu}\p{N}.-]{1,9}$/u.test(term);}

class PronunciationNormalizer{
  constructor({resourcesDir,dataDir,onEvent=()=>{},getSettings=()=>({}),claudeVerify=null}){
    this.resourcesDir=resourcesDir;this.dataDir=dataDir;this.onEvent=onEvent;this.getSettings=getSettings;this.claudeVerify=claudeVerify;
    this.runtimeDir=path.join(resourcesDir,'runtime','llama');
    this.modelDir=path.join(dataDir,'models');
    this.modelPath=path.join(this.modelDir,MODEL_NAME);
    this.learningFile=path.join(dataDir,'pronunciation-learning.json');
    this.legacyCacheFile=path.join(dataDir,'pronunciation-cache.json');
    this.learning={schemaVersion:LEARNING_SCHEMA,updatedAt:nowIso(),entries:{}};
    this.server=null;this.startingPromise=null;this.idleTimer=null;this.port=8767;this.downloadPromise=null;
    fs.mkdirSync(this.modelDir,{recursive:true});
    this.loadLearning();
  }
  serverExe(){return findRecursive(this.runtimeDir,'llama-server.exe');}
  modelReady(){try{return fs.existsSync(this.modelPath)&&fs.statSync(this.modelPath).size>300_000_000;}catch{return false;}}
  status(){
    const settings=this.getSettings?.()||{};
    return{
      runtime:!!this.serverExe(),model:this.modelReady(),running:!!this.server,modelName:MODEL_NAME,
      learningEntries:Object.keys(this.learning.entries||{}).length,cacheEntries:Object.keys(this.learning.entries||{}).length,
      claudeVerifyEnabled:settings?.tts?.pronunciationClaudeVerify!==false,
      maxSeconds:Math.max(5,Math.min(30,Number(settings?.tts?.pronunciationMaxSeconds)||15)),
      schemaVersion:LEARNING_SCHEMA
    };
  }
  loadLearning(){
    let loaded=null;
    try{if(fs.existsSync(this.learningFile))loaded=JSON.parse(fs.readFileSync(this.learningFile,'utf8'));}catch{}
    if(loaded)this.learning=this.normalizeLearning(loaded);
    else{
      let legacy=null;try{if(fs.existsSync(this.legacyCacheFile))legacy=JSON.parse(fs.readFileSync(this.legacyCacheFile,'utf8'));}catch{}
      if(legacy&&typeof legacy==='object'){
        const entries={};
        for(const [term,pronunciation] of Object.entries(legacy)){
          if(!term||!pronunciation)continue;
          entries[keyOf(term)]={term,pronunciation:String(pronunciation),needsReplacement:true,source:'qwen-legacy',confidence:.6,uses:0,createdAt:nowIso(),updatedAt:nowIso(),lastValidated:''};
        }
        this.learning={schemaVersion:LEARNING_SCHEMA,updatedAt:nowIso(),entries};
        this.saveLearning();
      }
    }
  }
  normalizeLearning(data){
    const entries={};
    const sourceEntries=data?.entries;
    if(Array.isArray(sourceEntries)){
      for(const x of sourceEntries){
        const term=String(x?.term||'').trim();if(!term)continue;
        entries[keyOf(term)]=this.normalizeEntry({...x,term});
      }
    }else if(sourceEntries&&typeof sourceEntries==='object'){
      for(const [k,x] of Object.entries(sourceEntries)){
        if(typeof x==='string')entries[keyOf(k)]=this.normalizeEntry({term:k,pronunciation:x,needsReplacement:true,source:'legacy'});
        else{const term=String(x?.term||k).trim();if(term)entries[keyOf(term)]=this.normalizeEntry({...x,term});}
      }
    }else if(data&&typeof data==='object'&&!data.schemaVersion){
      for(const [term,pronunciation] of Object.entries(data))if(typeof pronunciation==='string')entries[keyOf(term)]=this.normalizeEntry({term,pronunciation,needsReplacement:true,source:'legacy'});
    }
    return{schemaVersion:LEARNING_SCHEMA,updatedAt:String(data?.updatedAt||nowIso()),entries};
  }
  normalizeEntry(x){
    const term=String(x?.term||'').trim();
    return{
      term,
      pronunciation:String(x?.pronunciation||'').trim(),
      needsReplacement:x?.needsReplacement!==false&&x?.needs_replacement!==false,
      source:String(x?.source||'learned'),
      confidence:Math.max(0,Math.min(1,Number(x?.confidence)||0)),
      uses:Math.max(0,Number(x?.uses)||0),
      createdAt:String(x?.createdAt||nowIso()),
      updatedAt:String(x?.updatedAt||nowIso()),
      lastValidated:String(x?.lastValidated||'')
    };
  }
  saveLearning(){
    try{
      this.learning.schemaVersion=LEARNING_SCHEMA;this.learning.updatedAt=nowIso();
      const tmp=`${this.learningFile}.tmp`;fs.writeFileSync(tmp,JSON.stringify(this.learning,null,2),'utf8');fs.renameSync(tmp,this.learningFile);
    }catch{}
  }
  exportLearning(){
    return{schemaVersion:LEARNING_SCHEMA,exportedAt:nowIso(),updatedAt:this.learning.updatedAt||nowIso(),entries:Object.values(this.learning.entries||{}).sort((a,b)=>a.term.localeCompare(b.term,'es',{sensitivity:'base'}))};
  }
  importLearning(data){
    const incoming=this.normalizeLearning(data);let added=0,updated=0,kept=0;
    const rank=s=>/manual/i.test(s)?4:/claude/i.test(s)?3:/qwen/i.test(s)?2:1;
    for(const [k,next] of Object.entries(incoming.entries)){
      const current=this.learning.entries[k];
      if(!current){this.learning.entries[k]=next;added++;continue;}
      const shouldReplace=rank(next.source)>rank(current.source)||Number(next.confidence)>Number(current.confidence)+.05||String(next.updatedAt)>String(current.updatedAt);
      if(shouldReplace){this.learning.entries[k]={...current,...next,uses:Math.max(current.uses||0,next.uses||0)};updated++;}else kept++;
    }
    this.saveLearning();
    return{ok:true,added,updated,kept,total:Object.keys(this.learning.entries).length,schemaVersion:LEARNING_SCHEMA};
  }
  clearLearning(){this.learning={schemaVersion:LEARNING_SCHEMA,updatedAt:nowIso(),entries:{}};this.saveLearning();return{ok:true,total:0};}
  learn(term,pronunciation,needsReplacement,source,confidence){
    const k=keyOf(term);if(!k)return;
    const current=this.learning.entries[k];
    const entry=this.normalizeEntry({
      ...(current||{}),term:String(term).trim(),pronunciation:needsReplacement?String(pronunciation||'').trim():'',needsReplacement,
      source,confidence,uses:current?.uses||0,createdAt:current?.createdAt||nowIso(),updatedAt:nowIso(),lastValidated:/claude/i.test(source)?nowIso():(current?.lastValidated||'')
    });
    this.learning.entries[k]=entry;
  }
  basic(text){
    let out=normalizeCurrency(text);
    for(const [from,to] of BASIC){out=out.replace(unicodeBoundaryRegex(from,'giu'),to);}
    out=out.replace(/(\d+(?:[.,]\d+)?)\s*%/g,'$1 por ciento');
    out=out.replace(/(\d+(?:[.,]\d+)?)\s*°\s*C\b/gi,'$1 grados Celsius');
    out=out.replace(/(\d+(?:[.,]\d+)?)\s*km\/h\b/gi,'$1 kilómetros por hora');
    out=out.replace(/(\d+(?:[.,]\d+)?)\s*km\b/gi,'$1 kilómetros');
    out=out.replace(/(\d+(?:[.,]\d+)?)\s*kg\b/gi,'$1 kilogramos');
    out=out.replace(/(\d+(?:[.,]\d+)?)\s*m[²2]\b/gi,'$1 metros cuadrados');
    return normalizeCurrency(out);
  }
  candidates(text){
    const s=String(text||'');
    const tokens=[];
    const rx=/[\p{L}][\p{L}\p{M}\p{N}'’.-]{1,40}/gu;
    let m;while((m=rx.exec(s))){tokens.push({term:m[0],index:m.index,end:m.index+m[0].length});}
    const candidates=[];const seen=new Set();
    const add=(term,index,score)=>{
      const clean=String(term||'').trim().replace(/^[.'’-]+|[.'’-]+$/g,'');const k=keyOf(clean);
      if(clean.length<2||seen.has(k)||BASIC_KEYS.has(k)||COMMON_ES.has(k))return;
      seen.add(k);candidates.push({term:clean,index,score,context:sentenceContext(s,index)});
    };
    for(let i=0;i<tokens.length;i++){
      const t=tokens[i],term=t.term,k=keyOf(term);
      if(BASIC_KEYS.has(k)||COMMON_ES.has(k))continue;
      let score=0;
      if(isAcronym(term))score+=6;
      if(/[wWkKyY]|sh|th|ph|oo|ee|ai|ou/i.test(term))score+=4;
      if(/[a-záéíóúüñ][A-ZÁÉÍÓÚÜÑ]/.test(term))score+=5;
      if(isCapitalized(term))score+=2;
      if(/[.'’]/.test(term))score+=2;
      if(score>=2)add(term,t.index,score);

      if(isCapitalized(term)||isAcronym(term)){
        let phrase=term,end=t.end,count=1,phraseScore=score+3;
        for(let j=i+1;j<Math.min(tokens.length,i+4);j++){
          const n=tokens[j];const gap=s.slice(end,n.index);
          if(!/^\s{1,3}$/.test(gap)||!(isCapitalized(n.term)||isAcronym(n.term)))break;
          phrase+=gap+n.term;end=n.end;count++;phraseScore+=2;
        }
        if(count>=2)add(phrase,t.index,phraseScore);
      }
    }
    return candidates.sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,MAX_CANDIDATES);
  }
  validatePronunciation(term,to){
    const value=String(to||'').trim();
    if(!value||value.length>60||keyOf(value)===keyOf(term))return'';
    if(/https?:|www\.|[{}\[\]<>/@#=:;]/i.test(value))return'';
    if(!/^[\p{L}\p{M}\s'’\-]+$/u.test(value))return'';
    if(value.split(/\s+/).filter(Boolean).length>8)return'';
    return value.replace(/\s+/g,' ');
  }
  applyMap(text,map){
    let out=String(text||'');
    const pairs=Object.entries(map||{}).sort((a,b)=>b[0].length-a[0].length);
    for(const [from,to] of pairs){
      if(!from||!to||keyOf(from)===keyOf(to))continue;
      out=out.replace(unicodeBoundaryRegex(from,'giu'),to);
    }
    return out;
  }
  async downloadModel(){
    if(this.modelReady())return{ok:true,path:this.modelPath,already:true};
    if(this.downloadPromise)return this.downloadPromise;
    this.downloadPromise=(async()=>{
      fs.mkdirSync(this.modelDir,{recursive:true});
      const tmp=this.modelPath+'.part';
      try{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}catch{}
      try{
        const res=await fetch(MODEL_URL,{redirect:'follow',headers:{'user-agent':'EC-Automatic-News/0.3.11'},signal:AbortSignal.timeout(60*60*1000)});
        if(!res.ok)throw new Error(`HTTP ${res.status} al descargar el normalizador`);
        if(!res.body)throw new Error('El servidor no devolvió datos del modelo');
        const total=Number(res.headers.get('content-length')||0);let done=0;
        const out=fs.createWriteStream(tmp);const stream=Readable.fromWeb(res.body);
        stream.on('data',chunk=>{done+=chunk.length;this.onEvent({type:'pronunciation-download',done,total,percent:total?Math.round(done*100/total):0});});
        await new Promise((resolve,reject)=>{stream.pipe(out);out.on('finish',resolve);out.on('error',reject);stream.on('error',reject);});
        const size=fs.existsSync(tmp)?fs.statSync(tmp).size:0;
        if(size<300_000_000)throw new Error(`Descarga incompleta (${Math.round(size/1048576)} MB)`);
        if(fs.existsSync(this.modelPath))fs.rmSync(this.modelPath,{force:true});
        fs.renameSync(tmp,this.modelPath);
        this.onEvent({type:'pronunciation-downloaded'});
        return{ok:true,path:this.modelPath};
      }catch(e){try{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}catch{}throw e;}
    })();
    try{return await this.downloadPromise;}finally{this.downloadPromise=null;}
  }
  async start(timeoutMs=6500){
    if(this.server)return;
    if(this.startingPromise)return this.startingPromise;
    this.startingPromise=this._start(timeoutMs);
    try{return await this.startingPromise;}finally{this.startingPromise=null;}
  }
  async _start(timeoutMs){
    const exe=this.serverExe();if(!exe)throw new Error('Runtime llama.cpp no incluido');
    if(!this.modelReady())throw new Error('PRONUNCIATION_MODEL_MISSING');
    const args=['-m',this.modelPath,'--host','127.0.0.1','--port',String(this.port),'-c','2048','-ngl','0','-b','128','-ub','64','-t','2','-tb','2','-np','1','--prio','-1','--poll','0','--no-warmup'];
    this.server=spawn(exe,args,{cwd:path.dirname(exe),windowsHide:true,stdio:['ignore','ignore','ignore']});
    try{os.setPriority(this.server.pid,os.constants.priority.PRIORITY_BELOW_NORMAL);}catch{}
    this.server.on('exit',()=>{this.server=null;this.onEvent({type:'pronunciation-exit'});});
    const started=Date.now();
    while(Date.now()-started<Math.max(1500,timeoutMs)){
      if(!this.server)throw new Error('El normalizador local se cerró durante el inicio');
      try{const r=await fetch(`http://127.0.0.1:${this.port}/health`,{signal:AbortSignal.timeout(900)});if(r.ok){this.onEvent({type:'pronunciation-started'});return;}}catch{}
      await wait(250);
    }
    this.stop('start-timeout');throw new Error('El normalizador local excedió el tiempo de inicio');
  }
  scheduleStop(){
    if(this.idleTimer)clearTimeout(this.idleTimer);
    this.idleTimer=setTimeout(()=>this.stop('idle'),120000);
  }
  stop(reason='manual'){
    if(this.idleTimer){clearTimeout(this.idleTimer);this.idleTimer=null;}
    if(this.server){try{this.server.kill();}catch{}this.server=null;}
    this.onEvent({type:'pronunciation-stopped',reason});
  }
  parseSmartResponse(raw,allowedTerms){
    let s=String(raw||'').replace(/<think>[\s\S]*?<\/think>/gi,'').trim().replace(/^```(?:json)?/i,'').replace(/```$/,'').trim();
    if(!s)throw new Error('El normalizador inteligente devolvió una respuesta vacía');
    const a=s.indexOf('{'),b=s.lastIndexOf('}');if(a>=0&&b>a)s=s.slice(a,b+1);
    let data;try{data=JSON.parse(s);}catch(e){throw new Error(`El normalizador inteligente devolvió JSON inválido: ${e.message}`);}
    const allowed=new Set((allowedTerms||[]).map(String));const out={};
    for(const x of Array.isArray(data?.items)?data.items:Array.isArray(data?.replacements)?data.replacements:[]){
      const term=String(x?.term||x?.from||'').trim();if(!allowed.has(term))continue;
      const needs=x?.needs_replacement===false?false:true;
      const rawTo=String(x?.pronunciation||x?.to||'').trim();
      const to=needs?this.validatePronunciation(term,rawTo):'';
      if(needs&&!to)continue;
      out[term]={to,needsReplacement:needs,confidence:Math.max(0,Math.min(1,Number(x?.confidence)||.75))};
    }
    return out;
  }
  async requestSmartMap(items,timeoutMs){
    const terms=items.slice(0,MAX_CANDIDATES).map(x=>({term:x.term,context:x.context}));
    const rules='Devuelve SOLO JSON válido. Esquema exacto: {"items":[{"term":"texto exacto","needs_replacement":true,"pronunciation":"aproximación simple","confidence":0.90}]}. Solo adapta términos que realmente puedan pronunciarse mal en un TTS de español latinoamericano. No traduzcas nombres propios. Para nombres o palabras que se leen bien en español, usa needs_replacement=false y pronunciation vacío. Usa ortografía simple, nunca IPA, explicaciones ni markdown. El term debe coincidir exactamente con la lista.';
    const prompt=`/no_think\n${rules}\nENTRADAS: ${JSON.stringify(terms)}`;
    const r=await fetch(`http://127.0.0.1:${this.port}/v1/chat/completions`,{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({model:'local',messages:[{role:'user',content:prompt}],temperature:0,max_tokens:500,stream:false}),
      signal:AbortSignal.timeout(Math.max(1200,timeoutMs))
    });
    if(!r.ok)throw new Error(`Normalizador HTTP ${r.status}`);
    const j=await r.json();
    return this.parseSmartResponse(j?.choices?.[0]?.message?.content||'',terms.map(x=>x.term));
  }
  async smartMap(items,deadline){
    const remaining=()=>Math.max(0,deadline-Date.now());
    const startBudget=Math.min(6000,remaining()-800);if(startBudget<1200)throw new Error('Sin tiempo para iniciar el normalizador local');
    await this.start(startBudget);
    try{
      const requestBudget=Math.min(5500,remaining()-300);if(requestBudget<1200)throw new Error('Sin tiempo para consultar el normalizador local');
      return await this.requestSmartMap(items,requestBudget);
    }finally{this.scheduleStop();}
  }
  async normalize(script,{smart=true}={}){
    const started=Date.now();const raw=String(script||'');const settings=this.getSettings?.()||{};
    const maxMs=Math.max(5000,Math.min(30000,Number(settings?.tts?.pronunciationMaxSeconds)||15)*1000);
    const deadline=started+maxMs;
    const candidates=this.candidates(raw);
    const knownMap={};const unknown=[];let cachedUsed=0;let learningDirty=false;
    for(const c of candidates){
      const entry=this.learning.entries[keyOf(c.term)];
      if(entry){
        entry.uses=(entry.uses||0)+1;entry.updatedAt=entry.updatedAt||nowIso();learningDirty=true;cachedUsed++;
        if(entry.needsReplacement&&entry.pronunciation)knownMap[c.term]=entry.pronunciation;
      }else unknown.push(c);
    }

    let qwen={},qwenAttempted=false,qwenError='';
    if(smart&&unknown.length&&this.modelReady()&&Date.now()<deadline-1500){
      qwenAttempted=true;
      try{qwen=await this.smartMap(unknown,deadline);}catch(e){qwenError=e.message||String(e);this.onEvent({type:'pronunciation-warning',message:qwenError});}
    }

    let claude={used:false,items:[]},claudeAttempted=false,claudeError='';
    if(smart&&unknown.length&&typeof this.claudeVerify==='function'&&settings?.tts?.pronunciationClaudeVerify!==false&&Date.now()<deadline-1800){
      claudeAttempted=true;
      try{
        const remaining=Math.max(1500,deadline-Date.now()-300);
        claude=await this.claudeVerify(unknown,qwen,settings,remaining)||{used:false,items:[]};
      }catch(e){claudeError=e.message||String(e);this.onEvent({type:'pronunciation-warning',message:`Claude: ${claudeError}`});}
    }

    const learnedNow={};const handled=new Set();let learnedCount=0;
    if(claude?.used){
      for(const x of claude.items||[]){
        const term=String(x.term||'').trim();if(!term)continue;handled.add(keyOf(term));
        const needs=!!x.needsReplacement;const to=needs?this.validatePronunciation(term,x.pronunciation):'';
        if(needs&&!to)continue;
        const confidence=Math.max(0,Math.min(1,Number(x.confidence)||0));
        if(confidence<.65)continue;
        const local=qwen[term];const source=local&&local.needsReplacement===needs&&keyOf(local.to||'')===keyOf(to||'')?'qwen+claude':'claude';
        this.learn(term,to,needs,source,confidence);learningDirty=true;learnedCount++;
        if(needs)learnedNow[term]=to;
      }
    }
    for(const c of unknown){
      if(handled.has(keyOf(c.term)))continue;
      const local=qwen[c.term];if(!local)continue;
      const confidence=Math.max(0,Math.min(1,Number(local.confidence)||0));
      if(confidence<.88)continue;
      const needs=!!local.needsReplacement;const to=needs?this.validatePronunciation(c.term,local.to):'';
      if(needs&&!to)continue;
      this.learn(c.term,to,needs,'qwen',confidence);learningDirty=true;learnedCount++;
      if(needs)learnedNow[c.term]=to;
    }
    if(learningDirty)this.saveLearning();

    let out=this.applyMap(raw,{...knownMap,...learnedNow});
    out=this.basic(out);
    const smartAttempted=qwenAttempted||claudeAttempted;
    const smartFailed=smartAttempted&&!Object.keys(qwen).length&&!(claude?.used&&claude.items?.length)&&(!!qwenError||!!claudeError);
    const errors=[qwenError&&`Qwen: ${qwenError}`,claudeError&&`Claude: ${claudeError}`].filter(Boolean).join(' | ');
    return{
      text:out,elapsedMs:Date.now()-started,
      smartUsed:cachedUsed>0||Object.keys(learnedNow).length>0,
      smartAttempted,smartFailed,smartError:errors,
      qwenAttempted,qwenUsed:Object.keys(qwen).length>0,claudeAttempted,claudeUsed:!!claude?.used,
      learnedCount,modelReady:this.modelReady(),learningEntries:Object.keys(this.learning.entries).length,cacheEntries:Object.keys(this.learning.entries).length
    };
  }
}
module.exports={PronunciationNormalizer,MODEL_URL,MODEL_NAME,LEARNING_SCHEMA,normalizeCurrency,unicodeBoundaryRegex};
