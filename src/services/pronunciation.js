const fs=require('fs');
const path=require('path');
const os=require('os');
const {spawn}=require('child_process');
const {Readable}=require('stream');

// Fuente estable mantenida por ggml-org. Q4_0 es suficiente para esta tarea corta y reduce tamaño/consumo.
const MODEL_URL='https://huggingface.co/ggml-org/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q4_0.gguf?download=true';
const MODEL_NAME='Qwen3-0.6B-Q4_0.gguf';

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

const BASIC=[
  ['EE.UU.','Estados Unidos'],['EE. UU.','Estados Unidos'],
  ['TV','te uve'],['DNI','de ene i'],['RUC','erre u ce'],['AFP','a efe pe'],
  ['FMI','efe eme i'],['BCR','be ce erre'],['BCRP','be ce erre pe'],
  ['CEO','si i ou'],['USB','u ese be'],['HDMI','hache de eme i'],
  ['OpenAI','óupen ei ai'],['YouTube','yutub'],['WhatsApp','guatsap'],
  ['Apple','ápol'],['Google','gúgol'],['Microsoft','máicrosoft'],
  ['TikTok','tíktok'],['iPhone','áifon'],['NVIDIA','envidia']
];

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

class PronunciationNormalizer{
  constructor({resourcesDir,dataDir,onEvent=()=>{}}){
    this.resourcesDir=resourcesDir;this.dataDir=dataDir;this.onEvent=onEvent;
    this.runtimeDir=path.join(resourcesDir,'runtime','llama');
    this.modelDir=path.join(dataDir,'models');
    this.modelPath=path.join(this.modelDir,MODEL_NAME);
    this.cacheFile=path.join(dataDir,'pronunciation-cache.json');
    this.cache={};this.server=null;this.startingPromise=null;this.idleTimer=null;this.port=8767;
    fs.mkdirSync(this.modelDir,{recursive:true});
    try{if(fs.existsSync(this.cacheFile))this.cache=JSON.parse(fs.readFileSync(this.cacheFile,'utf8'))||{};}catch{this.cache={};}
  }
  serverExe(){return findRecursive(this.runtimeDir,'llama-server.exe');}
  modelReady(){return fs.existsSync(this.modelPath)&&fs.statSync(this.modelPath).size>300_000_000;}
  status(){return{runtime:!!this.serverExe(),model:this.modelReady(),running:!!this.server,modelName:MODEL_NAME,cacheEntries:Object.keys(this.cache).length};}
  saveCache(){try{fs.writeFileSync(this.cacheFile,JSON.stringify(this.cache,null,2),'utf8');}catch{}}
  basic(text){
    let out=normalizeCurrency(text);
    for(const [from,to] of BASIC){
      const rx=/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]+$/.test(from)?new RegExp(`\\b${esc(from)}\\b`,'g'):new RegExp(esc(from),'g');
      out=out.replace(rx,to);
    }
    out=out.replace(/(\d+(?:[.,]\d+)?)\s*%/g,'$1 por ciento');
    return normalizeCurrency(out);
  }
  candidates(text){
    const words=String(text||'').match(/\b[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ.-]{1,30}\b/g)||[];
    const out=[];const seen=new Set();
    for(const w of words){
      if(seen.has(w))continue;
      const interesting=/^[A-ZÁÉÍÓÚÜÑ]{2,6}$/.test(w) || /[a-záéíóúüñ][A-ZÁÉÍÓÚÜÑ]/.test(w) || /[wWkKyY]|sh|th|ph|oo|ee|ai|ou/i.test(w);
      if(!interesting)continue;
      if(/^(Perú|Lima|Keiko|Fujimori)$/i.test(w))continue;
      seen.add(w);out.push(w);
      if(out.length>=12)break;
    }
    return out;
  }
  applyMap(text,map){
    let out=String(text||'');
    const pairs=Object.entries(map||{}).sort((a,b)=>b[0].length-a[0].length);
    for(const [from,to] of pairs){
      if(!from||!to||from===to)continue;
      const rx=new RegExp(`\\b${esc(from)}\\b`,'g');
      out=out.replace(rx,to);
    }
    return out;
  }
  async downloadModel(){
    if(this.modelReady())return{ok:true,path:this.modelPath,already:true};
    fs.mkdirSync(this.modelDir,{recursive:true});
    const tmp=this.modelPath+'.part';
    try{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}catch{}
    const res=await fetch(MODEL_URL,{redirect:'follow',headers:{'user-agent':'EC-Automatic-News/0.3.7'}});
    if(!res.ok)throw new Error(`HTTP ${res.status} al descargar el normalizador`);
    if(!res.body)throw new Error('El servidor no devolvió datos del modelo');
    const total=Number(res.headers.get('content-length')||0);let done=0;
    const out=fs.createWriteStream(tmp);const stream=Readable.fromWeb(res.body);
    stream.on('data',chunk=>{done+=chunk.length;this.onEvent({type:'pronunciation-download',done,total,percent:total?Math.round(done*100/total):0});});
    try{
      await new Promise((resolve,reject)=>{stream.pipe(out);out.on('finish',resolve);out.on('error',reject);stream.on('error',reject);});
      const size=fs.existsSync(tmp)?fs.statSync(tmp).size:0;
      if(size<300_000_000)throw new Error(`Descarga incompleta (${Math.round(size/1048576)} MB)`);
      fs.renameSync(tmp,this.modelPath);
    }catch(e){try{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}catch{}throw e;}
    this.onEvent({type:'pronunciation-downloaded'});
    return{ok:true,path:this.modelPath};
  }
  async start(){
    if(this.server)return;
    if(this.startingPromise)return this.startingPromise;
    this.startingPromise=this._start();
    try{return await this.startingPromise;}finally{this.startingPromise=null;}
  }
  async _start(){
    const exe=this.serverExe();if(!exe)throw new Error('Runtime llama.cpp no incluido');
    if(!this.modelReady())throw new Error('PRONUNCIATION_MODEL_MISSING');
    const args=['-m',this.modelPath,'--host','127.0.0.1','--port',String(this.port),'-c','2048','-ngl','0','-b','128','-ub','64','-t','2','-tb','2','-np','1','--prio','-1','--poll','0','--no-warmup'];
    this.server=spawn(exe,args,{cwd:path.dirname(exe),windowsHide:true,stdio:['ignore','ignore','ignore']});
    try{os.setPriority(this.server.pid,os.constants.priority.PRIORITY_BELOW_NORMAL);}catch{}
    this.server.on('exit',()=>{this.server=null;this.onEvent({type:'pronunciation-exit'});});
    const started=Date.now();
    while(Date.now()-started<60000){
      if(!this.server)throw new Error('El normalizador local se cerró durante el inicio');
      try{const r=await fetch(`http://127.0.0.1:${this.port}/health`,{signal:AbortSignal.timeout(2000)});if(r.ok){this.onEvent({type:'pronunciation-started'});return;}}catch{}
      await wait(500);
    }
    this.stop('start-timeout');throw new Error('El normalizador local no terminó de iniciar');
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
  parseSmartResponse(raw,candidates){
    let s=String(raw||'').replace(/<think>[\s\S]*?<\/think>/gi,'').trim().replace(/^```(?:json)?/i,'').replace(/```$/,'').trim();
    if(!s)throw new Error('El normalizador inteligente devolvió una respuesta vacía');
    let data=null;
    const a=s.indexOf('{'),b=s.lastIndexOf('}');
    if(a>=0&&b>a){
      try{data=JSON.parse(s.slice(a,b+1));}catch{}
    }
    const map={};
    if(data&&Array.isArray(data.replacements)){
      for(const x of data.replacements){
        const from=String(x?.from||'').trim(),to=String(x?.to||'').trim();
        if(candidates.includes(from)&&to&&to.length<=80)map[from]=to;
      }
      return map;
    }
    if(/"replacements"\s*:\s*\[\s*\]/i.test(s))return map;
    const pairRx=/"from"\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*"to"\s*:\s*"((?:\\.|[^"\\])*)"/g;
    let m;
    while((m=pairRx.exec(s))){
      let from='',to='';
      try{from=JSON.parse(`"${m[1]}"`);to=JSON.parse(`"${m[2]}"`);}catch{continue;}
      from=String(from).trim();to=String(to).trim();
      if(candidates.includes(from)&&to&&to.length<=80)map[from]=to;
    }
    if(Object.keys(map).length)return map;
    throw new Error('El normalizador inteligente devolvió JSON incompleto');
  }
  async requestSmartMap(prompt,candidates,maxTokens){
    const r=await fetch(`http://127.0.0.1:${this.port}/v1/chat/completions`,{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({model:'local',messages:[{role:'user',content:prompt}],temperature:0,max_tokens:maxTokens,stream:false}),
      signal:AbortSignal.timeout(45000)
    });
    if(!r.ok)throw new Error(`Normalizador HTTP ${r.status}`);
    const j=await r.json();
    return this.parseSmartResponse(j?.choices?.[0]?.message?.content||'',candidates);
  }
  async smartMap(script,candidates){
    await this.start();
    const terms=candidates.slice(0,12);
    const baseRules=`Devuelve SOLO JSON válido, sin markdown ni comentarios. Esquema exacto: {"replacements":[{"from":"texto exacto","to":"pronunciación aproximada"}]}. Incluye solo términos que necesiten adaptación para un TTS en español latinoamericano. No traduzcas ni cambies nombres españoles. Usa ortografía simple, no IPA. El campo from debe coincidir exactamente con la lista. Si no hay cambios devuelve {"replacements":[]}.`;
    const prompt1=`/no_think\n${baseRules}\nTÉRMINOS: ${JSON.stringify(terms)}\nCONTEXTO: ${String(script||'').slice(0,1800)}`;
    const prompt2=`/no_think\nRESPUESTA JSON ESTRICTA. ${baseRules}\nTÉRMINOS: ${JSON.stringify(terms)}`;
    let lastError=null;
    try{
      for(let attempt=1;attempt<=2;attempt++){
        try{return await this.requestSmartMap(attempt===1?prompt1:prompt2,terms,attempt===1?240:180);}
        catch(e){lastError=e;if(attempt===1)await wait(180);}
      }
      throw lastError||new Error('El normalizador inteligente no respondió');
    }finally{this.scheduleStop();}
  }
  async normalize(script,{smart=true}={}){
    const started=Date.now();let out=this.basic(script);
    const candidates=this.candidates(out);
    const cached={};const unknown=[];
    for(const w of candidates){
      const k=w.toLowerCase();
      if(this.cache[k])cached[w]=this.cache[k];
      else unknown.push(w);
    }
    out=this.applyMap(out,cached);
    let learned={},smartFailed=false,smartError='';
    if(smart&&unknown.length&&this.modelReady()){
      try{
        learned=await this.smartMap(out,unknown);
        for(const [from,to] of Object.entries(learned))this.cache[from.toLowerCase()]=to;
        if(Object.keys(learned).length)this.saveCache();
        out=this.applyMap(out,learned);
      }catch(e){
        smartFailed=true;smartError=e.message||String(e);
        this.onEvent({type:'pronunciation-warning',message:smartError});
      }
    }
    out=normalizeCurrency(out);
    return{
      text:out,elapsedMs:Date.now()-started,
      smartUsed:Object.keys(learned).length>0||Object.keys(cached).length>0,
      smartAttempted:!!(smart&&unknown.length&&this.modelReady()),smartFailed,smartError,
      modelReady:this.modelReady(),cacheEntries:Object.keys(this.cache).length
    };
  }
}
module.exports={PronunciationNormalizer,MODEL_URL,MODEL_NAME,normalizeCurrency};
