const fs=require('fs');
const path=require('path');
const os=require('os');
const {spawn}=require('child_process');
const {pathToFileURL}=require('url');

const TTS_PROFILES={
  safe_streaming:{label:'Seguro para streaming',intra:2,inter:1,priority:'below'},
  balanced:{label:'Equilibrado',intra:3,inter:1,priority:'below'},
  performance:{label:'Rápido',intra:6,inter:1,priority:'normal'}
};

class KokoroTTS {
  constructor({resourcesDir,dataDir}){
    this.resourcesDir=resourcesDir;this.dataDir=dataDir;
    this.python=path.join(resourcesDir,'runtime','python','python.exe');
    this.script=path.join(resourcesDir,'runtime','kokoro','tts.py');
    this.model=path.join(resourcesDir,'runtime','kokoro','kokoro-v1.0.int8.onnx');
    this.voices=path.join(resourcesDir,'runtime','kokoro','voices-v1.0.bin');
    this.settingsFile=path.join(dataDir,'settings.json');
    this.audioDir=path.join(dataDir,'audio');fs.mkdirSync(this.audioDir,{recursive:true});
    this.generationTail=Promise.resolve();
    this.cleanupOldAudio();
  }
  ready(){return [this.python,this.script,this.model,this.voices].every(fs.existsSync);}
  profileName(){
    try{
      const s=JSON.parse(fs.readFileSync(this.settingsFile,'utf8'));
      const mode=String(s?.tts?.resourceMode||'safe_streaming');
      return TTS_PROFILES[mode]?mode:'safe_streaming';
    }catch{return'safe_streaming';}
  }
  profile(){const name=this.profileName();return{name,...TTS_PROFILES[name]};}
  run(args,profile=this.profile(),timeoutMs=120000){
    return new Promise((resolve,reject)=>{
      if(!this.ready())return reject(new Error('Kokoro runtime no incluido o incompleto'));
      const threads=String(Math.max(1,profile.intra||2));
      const env={
        ...process.env,
        OMP_NUM_THREADS:threads,OMP_THREAD_LIMIT:threads,OMP_DYNAMIC:'FALSE',OMP_WAIT_POLICY:'PASSIVE',
        OPENBLAS_NUM_THREADS:threads,MKL_NUM_THREADS:threads,NUMEXPR_NUM_THREADS:threads
      };
      const p=spawn(this.python,[this.script,...args],{windowsHide:true,env});let out='',err='',settled=false;
      const finish=(fn,value)=>{if(settled)return;settled=true;clearTimeout(timer);fn(value);};
      const timer=setTimeout(()=>{try{p.kill();}catch{}finish(reject,new Error(`Kokoro excedió ${Math.round(timeoutMs/1000)} s`));},Math.max(5000,timeoutMs));
      try{
        const priority=profile.priority==='normal'?os.constants.priority.PRIORITY_NORMAL:os.constants.priority.PRIORITY_BELOW_NORMAL;
        os.setPriority(p.pid,priority);
      }catch{}
      p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);
      p.on('error',e=>finish(reject,e));
      p.on('exit',code=>code===0?finish(resolve,out.trim()):finish(reject,new Error(`Kokoro error ${code}: ${err.slice(-1200)}`)));
    });
  }
  async listVoices(){
    const out=await this.run(['--list-voices','--voices',this.voices],{name:'safe_streaming',...TTS_PROFILES.safe_streaming},20000);
    try{const voices=JSON.parse(out).voices||[];return voices.filter(Boolean);}catch{return[];}
  }
  cleanupAudio(file){
    try{
      const resolved=path.resolve(String(file||''));const root=path.resolve(this.audioDir)+path.sep;
      if(resolved.startsWith(root)&&fs.existsSync(resolved))fs.rmSync(resolved,{force:true});
    }catch{}
  }
  cleanupOldAudio(maxAgeMs=24*60*60*1000){
    try{
      const now=Date.now();
      for(const name of fs.readdirSync(this.audioDir)){
        if(!/^news-.*\.(wav|txt)$/i.test(name))continue;
        const full=path.join(this.audioDir,name);const st=fs.statSync(full);
        if(now-st.mtimeMs>maxAgeMs)fs.rmSync(full,{force:true});
      }
    }catch{}
  }
  generate(text,{voice='ef_dora',speed=1.0}={}){
    const task=async()=>{
      const profile=this.profile();
      const started=Date.now();
      const id=`news-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const txt=path.join(this.audioDir,`${id}.txt`),wav=path.join(this.audioDir,`${id}.wav`);
      fs.writeFileSync(txt,text,'utf8');
      try{
        const out=await this.run([
          '--text-file',txt,'--output',wav,'--voice',voice,'--speed',String(speed),'--model',this.model,'--voices',this.voices,
          '--onnx-intra',String(profile.intra),'--onnx-inter',String(profile.inter)
        ],profile,180000);
        let meta={};try{meta=JSON.parse(out);}catch{}
        if(!fs.existsSync(wav)||fs.statSync(wav).size<1000)throw new Error('Kokoro no produjo un WAV válido');
        const elapsedMs=Date.now()-started;
        const durationSec=Number(meta.duration_sec||0);
        const intra=Number(meta.onnx_intra_threads||profile.intra);
        const inter=Number(meta.onnx_inter_threads||profile.inter);
        return{
          path:wav,url:pathToFileURL(wav).href,durationSec,voice:meta.voice||voice,elapsedMs,
          threads:intra,onnxIntraThreads:intra,onnxInterThreads:inter,executionMode:meta.execution_mode||'sequential',
          performanceProfile:profile.name,performanceLabel:profile.label,
          realtimeFactor:durationSec>0?Number(((elapsedMs/1000)/durationSec).toFixed(3)):0
        };
      }catch(e){this.cleanupAudio(wav);throw e;}
      finally{try{fs.rmSync(txt,{force:true});}catch{}}
    };
    const queued=this.generationTail.then(task,task);
    this.generationTail=queued.catch(()=>{});
    return queued;
  }
}
module.exports={KokoroTTS,TTS_PROFILES};
