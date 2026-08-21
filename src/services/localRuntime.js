const fs=require('fs');
const path=require('path');
const {spawn}=require('child_process');
const {Readable}=require('stream');

const MODEL_URL='https://huggingface.co/Qwen/Qwen3-8B-GGUF/resolve/main/Qwen3-8B-Q4_K_M.gguf?download=true';
const MODEL_NAME='Qwen3-8B-Q4_K_M.gguf';
const MIN_MODEL_BYTES=4_000_000_000;

const RESOURCE_PROFILES={
  safe_streaming:{label:'Seguro para streaming',ctx:4096,gpuLayers:20,batch:256,ubatch:128,threads:6,parallel:1,prio:-1,poll:0,warmup:false},
  balanced:{label:'Equilibrado',ctx:4096,gpuLayers:28,batch:512,ubatch:256,threads:8,parallel:1,prio:-1,poll:0,warmup:false},
  performance:{label:'Máximo rendimiento',ctx:8192,gpuLayers:99,batch:512,ubatch:256,threads:12,parallel:1,prio:0,poll:50,warmup:true}
};

function findRecursive(dir,filename){
  if(!fs.existsSync(dir))return'';
  for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    const p=path.join(dir,e.name);
    if(e.isDirectory()){const f=findRecursive(p,filename);if(f)return f;}
    else if(e.name.toLowerCase()===filename.toLowerCase())return p;
  }
  return'';
}

class LocalRuntime{
  constructor({resourcesDir,dataDir,onEvent=()=>{}}){
    this.resourcesDir=resourcesDir;this.dataDir=dataDir;this.onEvent=onEvent;
    this.runtimeDir=path.join(resourcesDir,'runtime','llama');
    this.modelDir=path.join(dataDir,'models');
    this.modelPath=path.join(this.modelDir,MODEL_NAME);
    this.server=null;this.port=8766;this.startingPromise=null;this.downloadPromise=null;this.idleTimer=null;this.idleDeadline=0;
    this.resourceMode='safe_streaming';
    fs.mkdirSync(this.modelDir,{recursive:true});
  }
  serverExe(){return findRecursive(this.runtimeDir,'llama-server.exe');}
  modelReady(){try{return fs.existsSync(this.modelPath)&&fs.statSync(this.modelPath).size>MIN_MODEL_BYTES;}catch{return false;}}
  profile(){return RESOURCE_PROFILES[this.resourceMode]||RESOURCE_PROFILES.safe_streaming;}
  configure(mode='safe_streaming'){
    const next=RESOURCE_PROFILES[mode]?mode:'safe_streaming';
    if(next===this.resourceMode)return;
    const wasRunning=!!this.server;
    this.resourceMode=next;
    if(wasRunning)this.stop('profile-change');
    this.onEvent({type:'local-ai-profile',mode:this.resourceMode,profile:this.profile()});
  }
  async status(){
    const p=this.profile();
    return{
      ok:!!this.serverExe(),runtime:!!this.serverExe(),model:this.modelReady(),running:!!this.server,downloading:!!this.downloadPromise,
      resourceMode:this.resourceMode,profile:{label:p.label,ctx:p.ctx,gpuLayers:p.gpuLayers,threads:p.threads,batch:p.batch,ubatch:p.ubatch,parallel:p.parallel},
      idleStopScheduled:!!this.idleTimer,idleStopInSec:this.idleDeadline?Math.max(0,Math.ceil((this.idleDeadline-Date.now())/1000)):0
    };
  }
  cancelIdleStop(){
    if(this.idleTimer){clearTimeout(this.idleTimer);this.idleTimer=null;}
    this.idleDeadline=0;
  }
  scheduleIdleStop(ms=300000){
    this.cancelIdleStop();
    if(!this.server)return;
    const delay=Math.max(60000,Number(ms)||300000);
    this.idleDeadline=Date.now()+delay;
    this.idleTimer=setTimeout(()=>{
      this.idleTimer=null;this.idleDeadline=0;
      this.stop('idle');
    },delay);
    this.onEvent({type:'local-ai-idle-scheduled',seconds:Math.round(delay/1000)});
  }

  async downloadModel(){
    if(this.modelReady())return{ok:true,path:this.modelPath,already:true};
    if(this.downloadPromise)return this.downloadPromise;
    this.downloadPromise=(async()=>{
      fs.mkdirSync(this.modelDir,{recursive:true});
      const tmp=this.modelPath+'.part';
      try{if(fs.existsSync(tmp))fs.rmSync(tmp,{force:true});}catch{}
      try{
        const res=await fetch(MODEL_URL,{redirect:'follow',headers:{'user-agent':'EC-Automatic-News/0.3.11'},signal:AbortSignal.timeout(2*60*60*1000)});
        if(!res.ok)throw new Error(`Descarga Qwen HTTP ${res.status}`);
        if(!res.body)throw new Error('El servidor no devolvió datos del modelo Qwen');
        const total=Number(res.headers.get('content-length')||0);let done=0;
        const out=fs.createWriteStream(tmp,{flags:'w'});
        const stream=Readable.fromWeb(res.body);
        stream.on('data',chunk=>{done+=chunk.length;this.onEvent({type:'model-download',done,total,percent:total?Math.round(done*100/total):0});});
        await new Promise((resolve,reject)=>{stream.pipe(out);out.on('finish',resolve);out.on('error',reject);stream.on('error',reject);});
        const size=fs.existsSync(tmp)?fs.statSync(tmp).size:0;
        if(size<MIN_MODEL_BYTES)throw new Error(`Descarga Qwen incompleta (${Math.round(size/1048576)} MB)`);
        if(fs.existsSync(this.modelPath))fs.rmSync(this.modelPath,{force:true});
        fs.renameSync(tmp,this.modelPath);
        this.onEvent({type:'model-downloaded',path:this.modelPath,size});
        return{ok:true,path:this.modelPath,size};
      }catch(e){try{if(fs.existsSync(tmp))fs.rmSync(tmp,{force:true});}catch{}this.onEvent({type:'model-download-error',message:e.message||String(e)});throw e;}
    })();
    try{return await this.downloadPromise;}finally{this.downloadPromise=null;}
  }

  async start(){
    this.cancelIdleStop();
    if(this.server)return;
    if(this.startingPromise)return this.startingPromise;
    this.startingPromise=this._start();
    try{return await this.startingPromise;}finally{this.startingPromise=null;}
  }
  async _start(){
    const exe=this.serverExe();
    if(!exe)throw new Error('Runtime llama.cpp no incluido en esta compilación');
    if(!this.modelReady())throw new Error('MODEL_MISSING');
    const p=this.profile();
    const args=[
      '-m',this.modelPath,'--host','127.0.0.1','--port',String(this.port),
      '-c',String(p.ctx),'-ngl',String(p.gpuLayers),
      '-b',String(p.batch),'-ub',String(p.ubatch),
      '-t',String(p.threads),'-tb',String(p.threads),'-np',String(p.parallel),
      '--prio',String(p.prio),'--poll',String(p.poll)
    ];
    if(!p.warmup)args.push('--no-warmup');
    this.onEvent({type:'local-ai-starting',mode:this.resourceMode,profile:p});
    this.server=spawn(exe,args,{cwd:path.dirname(exe),windowsHide:true,stdio:['ignore','ignore','ignore']});
    this.server.once('error',e=>{this.onEvent({type:'local-ai-error',message:e.message||String(e)});});
    this.server.on('exit',()=>{this.server=null;this.cancelIdleStop();this.onEvent({type:'local-ai-exit'});});
    const started=Date.now();
    while(Date.now()-started<120000){
      if(!this.server)throw new Error('La IA local se cerró durante el inicio');
      try{const r=await fetch(`http://127.0.0.1:${this.port}/health`,{signal:AbortSignal.timeout(3000)});if(r.ok){this.onEvent({type:'local-ai-started',mode:this.resourceMode,profile:p});return;}}catch{}
      await new Promise(r=>setTimeout(r,1000));
    }
    this.stop('start-timeout');throw new Error('La IA local no terminó de iniciar');
  }
  stop(reason='manual'){
    this.cancelIdleStop();
    const p=this.server;this.server=null;
    if(p){try{p.kill();}catch{}}
    this.onEvent({type:'local-ai-stopped',reason});
  }
  async generate(prompt){
    await this.start();
    const directPrompt=`/no_think\n${prompt}\n\nIMPORTANTE: no expliques tu razonamiento; entrega únicamente el JSON solicitado.`;
    const r=await fetch(`http://127.0.0.1:${this.port}/v1/chat/completions`,{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({model:'local',messages:[{role:'system',content:'Responde exactamente en el formato solicitado. No uses bloques <think> y no agregues texto fuera del JSON.'},{role:'user',content:directPrompt}],temperature:0.1,max_tokens:900,stream:false}),
      signal:AbortSignal.timeout(120000)
    });
    if(!r.ok)throw new Error(`IA local HTTP ${r.status}: ${(await r.text()).slice(0,300)}`);
    const j=await r.json();return j?.choices?.[0]?.message?.content||'';
  }
}
module.exports={LocalRuntime,MODEL_URL,MODEL_NAME,RESOURCE_PROFILES};
