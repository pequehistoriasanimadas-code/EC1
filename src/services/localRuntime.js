const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { Readable } = require('stream');

const MODEL_URL = 'https://huggingface.co/Qwen/Qwen3-8B-GGUF/resolve/main/Qwen3-8B-Q4_K_M.gguf?download=true';
const MODEL_NAME = 'Qwen3-8B-Q4_K_M.gguf';

function findRecursive(dir, filename) {
  if (!fs.existsSync(dir)) return '';
  for (const e of fs.readdirSync(dir,{withFileTypes:true})) {
    const p=path.join(dir,e.name);
    if (e.isDirectory()) { const f=findRecursive(p,filename); if(f) return f; }
    else if (e.name.toLowerCase()===filename.toLowerCase()) return p;
  }
  return '';
}

class LocalRuntime {
  constructor({ resourcesDir, dataDir, onEvent=()=>{} }) {
    this.resourcesDir=resourcesDir; this.dataDir=dataDir; this.onEvent=onEvent;
    this.runtimeDir=path.join(resourcesDir,'runtime','llama');
    this.modelDir=path.join(dataDir,'models');
    this.modelPath=path.join(this.modelDir,MODEL_NAME);
    this.server=null; this.port=8766;
    fs.mkdirSync(this.modelDir,{recursive:true});
  }
  serverExe(){ return findRecursive(this.runtimeDir,'llama-server.exe'); }
  modelReady(){ return fs.existsSync(this.modelPath) && fs.statSync(this.modelPath).size > 4_000_000_000; }
  async status(){ return {ok:!!this.serverExe(),runtime:!!this.serverExe(),model:this.modelReady(),running:!!this.server}; }

  async downloadModel() {
    if (this.modelReady()) return {ok:true,path:this.modelPath,already:true};
    fs.mkdirSync(this.modelDir,{recursive:true});
    const tmp=this.modelPath+'.part';
    const res=await fetch(MODEL_URL,{redirect:'follow'});
    if(!res.ok) throw new Error(`Descarga Qwen HTTP ${res.status}`);
    const total=Number(res.headers.get('content-length')||0); let done=0;
    const out=fs.createWriteStream(tmp);
    const stream=Readable.fromWeb(res.body);
    stream.on('data',chunk=>{done+=chunk.length; this.onEvent({type:'model-download',done,total,percent:total?Math.round(done*100/total):0});});
    await new Promise((resolve,reject)=>{stream.pipe(out); out.on('finish',resolve); out.on('error',reject); stream.on('error',reject);});
    fs.renameSync(tmp,this.modelPath);
    return {ok:true,path:this.modelPath};
  }

  async start() {
    if (this.server) return;
    const exe=this.serverExe();
    if(!exe) throw new Error('Runtime llama.cpp no incluido en esta compilación');
    if(!this.modelReady()) throw new Error('MODEL_MISSING');
    const args=['-m',this.modelPath,'--host','127.0.0.1','--port',String(this.port),'-c','8192','-ngl','99'];
    this.server=spawn(exe,args,{cwd:path.dirname(exe),windowsHide:true,stdio:['ignore','pipe','pipe']});
    this.server.on('exit',()=>{this.server=null; this.onEvent({type:'local-ai-exit'});});
    const started=Date.now();
    while(Date.now()-started<120000){
      try { const r=await fetch(`http://127.0.0.1:${this.port}/health`); if(r.ok) return; } catch{}
      await new Promise(r=>setTimeout(r,1000));
    }
    this.stop(); throw new Error('La IA local no terminó de iniciar');
  }
  stop(){ if(this.server){ try{this.server.kill();}catch{} this.server=null; } }
  async generate(prompt){
    await this.start();
    const r=await fetch(`http://127.0.0.1:${this.port}/v1/chat/completions`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:'local',messages:[{role:'system',content:'Responde exactamente en el formato solicitado por el usuario.'},{role:'user',content:prompt}],temperature:0.15,max_tokens:1200,stream:false})});
    if(!r.ok) throw new Error(`IA local HTTP ${r.status}: ${(await r.text()).slice(0,200)}`);
    const j=await r.json(); return j?.choices?.[0]?.message?.content || '';
  }
}
module.exports={LocalRuntime,MODEL_URL,MODEL_NAME};
