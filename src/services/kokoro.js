const fs=require('fs');
const path=require('path');
const os=require('os');
const {spawn}=require('child_process');
const {pathToFileURL}=require('url');

class KokoroTTS {
  constructor({resourcesDir,dataDir}){
    this.resourcesDir=resourcesDir; this.dataDir=dataDir;
    this.python=path.join(resourcesDir,'runtime','python','python.exe');
    this.script=path.join(resourcesDir,'runtime','kokoro','tts.py');
    this.model=path.join(resourcesDir,'runtime','kokoro','kokoro-v1.0.int8.onnx');
    this.voices=path.join(resourcesDir,'runtime','kokoro','voices-v1.0.bin');
    this.audioDir=path.join(dataDir,'audio'); fs.mkdirSync(this.audioDir,{recursive:true});
  }
  ready(){ return [this.python,this.script,this.model,this.voices].every(fs.existsSync); }
  run(args){
    return new Promise((resolve,reject)=>{
      if(!this.ready()) return reject(new Error('Kokoro runtime no incluido o incompleto'));
      const env={...process.env,OMP_NUM_THREADS:'6',OPENBLAS_NUM_THREADS:'6',MKL_NUM_THREADS:'6',NUMEXPR_NUM_THREADS:'6',OMP_WAIT_POLICY:'PASSIVE'};
      const p=spawn(this.python,[this.script,...args],{windowsHide:true,env}); let out='',err='';
      try{os.setPriority(p.pid,os.constants.priority.PRIORITY_BELOW_NORMAL);}catch{}
      p.stdout.on('data',d=>out+=d); p.stderr.on('data',d=>err+=d);
      p.on('error',reject);
      p.on('exit',code=> code===0?resolve(out.trim()):reject(new Error(`Kokoro error ${code}: ${err.slice(-1200)}`)));
    });
  }
  async listVoices(){
    const out=await this.run(['--list-voices','--voices',this.voices]);
    try{return JSON.parse(out).voices||[];}catch{return[];}
  }
  async generate(text,{voice='ef_dora',speed=1.0}={}){
    const id=`news-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const txt=path.join(this.audioDir,`${id}.txt`), wav=path.join(this.audioDir,`${id}.wav`);
    fs.writeFileSync(txt,text,'utf8');
    const out=await this.run(['--text-file',txt,'--output',wav,'--voice',voice,'--speed',String(speed),'--model',this.model,'--voices',this.voices]);
    try{fs.unlinkSync(txt);}catch{}
    let meta={}; try{meta=JSON.parse(out);}catch{}
    return {path:wav,url:pathToFileURL(wav).href,durationSec:Number(meta.duration_sec||0),voice:meta.voice||voice};
  }
}
module.exports={KokoroTTS};
