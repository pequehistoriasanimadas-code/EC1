const fs=require('fs'); const path=require('path');
const {spawn}=require('child_process');
const {Readable}=require('stream');

const MODEL_URL='https://huggingface.co/Qwen/Qwen3-8B-GGUF/resolve/main/Qwen3-8B-Q4_K_M.gguf?download=true';
const MODEL_NAME='Qwen3-8B-Q4_K_M.gguf';

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
    this.server=null;this.port=8766;this.startingPromise=null;this.idleTimer=null;this.idleDeadline=0;
    fs.mkdirSync(this.modelDir,{recursive:true});
  }
  serverExe(){return findRecursive(this.runtimeDir,'llama-server.exe');}
  modelReady(){return fs.existsSync(this.modelPath)&&fs.statSync(this.modelPath).size>4_000_000_000;}
  async status(){
    return{
      ok:!!this.serverExe(),runtime:!!this.serverExe(),model:this.modelReady(),running:!!this.server,
      idleStopScheduled:!!this.idleTimer,idleStopInSec:this.idleDeadline?Math.max(0,Math.ceil((this.idleDeadline-Date.now())/1000)):0
    };
  }
  cancelIdleStop(){
    if(this.idleTimer){clearTimeout(this.idleTimer);this.idleTimer=null;}
    this.idleDeadline=0;
  }
  scheduleIdleStop(ms=600000){
    this.cancelIdleStop();
    if(!this.server)return;
    const delay=Math.max(60000,Number(ms)||600000);
    this.idleDeadline=Date.now()+delay;
    this.idleTimer=setTimeout(()=>{
      this.idleTimer=null;this.idleDeadline=0;
      this.stop('idle');
    },delay);
    this.onEvent({type:'local-ai-idle-scheduled',seconds:Math.round(delay/1000)});
  }

  async downloadModel(){
    if(this.modelReady())return{ok:true,path:this.modelPath,already:true};
    fs.mkdirSync(this.modelDir,{recursive:true});
    const tmp=this.modelPath+'.part';
    const res=await fetch(MODEL_URL,{redirect:'follow'});
    if(!res.ok)throw new Error(`Descarga Qwen HTTP ${res.status}`);
    const total=Number(res.headers.get('content-length')||0);let done=0;
    const out=fs.createWriteStream(tmp);
    const stream=Readable.fromWeb(res.body);
    stream.on('data',chunk=>{done+=chunk.length;this.onEvent({type:'model-download',done,total,percent:total?Math.round(done*100/total):0});});
    await new Promise((resolve,reject)=>{stream.pipe(out);out.on('finish',resolve);out.on('error',reject);stream.on('error',reject);});
    fs.renameSync(tmp,this.modelPath);
    return{ok:true,path:this.modelPath};
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
    const args=['-m',this.modelPath,'--host','127.0.0.1','--port',String(this.port),'-c','8192','-ngl','99'];
    this.server=spawn(exe,args,{cwd:path.dirname(exe),windowsHide:true,stdio:['ignore','pipe','pipe']});
    this.server.on('exit',()=>{this.server=null;this.cancelIdleStop();this.onEvent({type:'local-ai-exit'});});
    const started=Date.now();
    while(Date.now()-started<120000){
      try{const r=await fetch(`http://127.0.0.1:${this.port}/health`,{signal:AbortSignal.timeout(3000)});if(r.ok){this.onEvent({type:'local-ai-started'});return;}}catch{}
      await new Promise(r=>setTimeout(r,1000));
    }
    this.stop('start-timeout');throw new Error('La IA local no terminó de iniciar');
  }
  stop(reason='manual'){
    this.cancelIdleStop();
    if(this.server){try{this.server.kill();}catch{}this.server=null;}
    this.onEvent({type:'local-ai-stopped',reason});
  }
  async generate(prompt){
    await this.start();
    const directPrompt=`/no_think\n${prompt}\n\nIMPORTANTE: no expliques tu razonamiento; entrega únicamente el JSON solicitado.`;
    const r=await fetch(`http://127.0.0.1:${this.port}/v1/chat/completions`,{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({model:'local',messages:[{role:'system',content:'Responde exactamente en el formato solicitado. No uses bloques <think> y no agregues texto fuera del JSON.'},{role:'user',content:directPrompt}],temperature:0.1,max_tokens:1600,stream:false}),
      signal:AbortSignal.timeout(120000)
    });
    if(!r.ok)throw new Error(`IA local HTTP ${r.status}: ${(await r.text()).slice(0,300)}`);
    const j=await r.json();return j?.choices?.[0]?.message?.content||'';
  }
}
module.exports={LocalRuntime,MODEL_URL,MODEL_NAME};
