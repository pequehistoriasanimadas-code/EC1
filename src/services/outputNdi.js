'use strict';
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {spawn}=require('child_process');

function safeJson(file,fallback){try{const v=JSON.parse(fs.readFileSync(file,'utf8'));return v&&typeof v==='object'?v:fallback;}catch{return fallback;}}
function atomicJson(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value,null,2),'utf8');try{fs.renameSync(tmp,file);}catch{fs.copyFileSync(tmp,file);try{fs.rmSync(tmp,{force:true});}catch{}}}
function cleanName(v){return String(v||'GEC Automatic News - OUTPUT').replace(/[\\/:*?"<>|]+/g,' ').replace(/\s+/g,' ').trim().slice(0,180)||'GEC Automatic News - OUTPUT';}
function runtimeCandidates(){
  const out=[];
  const add=p=>{p=String(p||'').trim();if(!p)return;out.push(/\.dll$/i.test(p)?p:path.join(p,'Processing.NDI.Lib.x64.dll'));};
  add(process.env.GEC_NDI_RUNTIME_DIR);add(process.env.NDI_RUNTIME_DIR_V6);add(process.env.NDI_RUNTIME_DIR_V5);
  const pf=process.env.ProgramFiles||'C:\\Program Files',pd=process.env.ProgramData||'C:\\ProgramData',ad=process.env.APPDATA||'';
  [
    path.join(pf,'NDI','NDI 6 Runtime','v6'),
    path.join(pf,'NDI','NDI 6 Runtime'),
    path.join(pf,'NDI','NDI 6 Tools','Runtime'),
    path.join(pf,'NDI','NDI 5 Tools','Runtime'),
    path.join(pf,'NDI','NDI 5 Runtime','v5'),
    path.join(pf,'NDI','NDI 5 Runtime'),
    path.join(pf,'NDI','NDI Tools'),
    path.join(pf,'obs-studio','obs-plugins','64bit'),
    path.join(pf,'DistroAV','bin','64bit'),
    path.join(pd,'obs-studio','plugins','DistroAV','bin','64bit'),
    ad&&path.join(ad,'obs-studio','plugins','DistroAV','bin','64bit')
  ].filter(Boolean).forEach(add);
  return [...new Set(out)];
}
function findRuntime(){for(const p of runtimeCandidates())try{if(fs.existsSync(p))return p;}catch{}return'';}
function bundledBridgePath(resourcesDir){return path.join(path.resolve(resourcesDir),'runtime','ndi','gec-ndi-bridge.exe');}
function stableBridgePath(dataDir){
  const LOCALAPPDATA=String(process.env.LOCALAPPDATA||'').trim();
  const base=LOCALAPPDATA||path.join(path.dirname(path.resolve(dataDir||'.')),'LocalAppData');
  return path.join(base,'EC Automatic News','Network','gec-ndi-bridge.exe');
}
function fileHash(file){const h=crypto.createHash('sha256');h.update(fs.readFileSync(file));return h.digest('hex');}
function deployStableBridge({dataDir,resourcesDir,log}={}){
  const bundled=bundledBridgePath(resourcesDir||'.'),stable=stableBridgePath(dataDir||'.');
  if(process.platform!=='win32')return{ok:fs.existsSync(bundled),path:bundled,bundled,stable:false,error:fs.existsSync(bundled)?'':'Bridge NDI no incluido en este build.'};
  if(!fs.existsSync(bundled))return{ok:false,path:bundled,bundled,stable:false,error:'Bridge NDI no incluido en este build.'};
  try{
    fs.mkdirSync(path.dirname(stable),{recursive:true});
    const same=fs.existsSync(stable)&&fileHash(stable)===fileHash(bundled);
    if(!same){const tmp=stable+'.tmp-'+process.pid+'-'+Date.now();fs.copyFileSync(bundled,tmp);try{fs.renameSync(tmp,stable);}catch{fs.copyFileSync(tmp,stable);try{fs.rmSync(tmp,{force:true});}catch{}}}
    return{ok:true,path:stable,bundled,stable:true,error:''};
  }catch(e){try{log?.('OUTPUT_NDI_STABLE_BRIDGE',e?.message||e);}catch{}return{ok:true,path:bundled,bundled,stable:false,error:'No se pudo preparar la ruta NDI estable; se usa el bridge incluido en este build.'};}
}
function packet(type,a,b,c,payload){
  const data=Buffer.isBuffer(payload)?payload:Buffer.from(payload||[]);
  const h=Buffer.allocUnsafe(28);h.write('GECN',0,4,'ascii');h.writeUInt32LE(1,4);h.writeUInt32LE(type>>>0,8);h.writeUInt32LE(a>>>0,12);h.writeUInt32LE(b>>>0,16);h.writeUInt32LE(c>>>0,20);h.writeUInt32LE(data.length>>>0,24);
  return{header:h,data};
}
class OutputNdi{
  constructor({dataDir,resourcesDir,log,onState}){
    this.dataDir=path.resolve(dataDir);this.resourcesDir=path.resolve(resourcesDir);this.log=log||(()=>{});this.onState=onState||(()=>{});
    this.configFile=path.join(this.dataDir,'global','output-ndi.json');
    this.config=this.loadConfig();this.child=null;this.running=false;this.starting=false;this.stopping=false;this.error='';this.connections=0;this.runtimePath='';this.restartTimer=null;this.stderrBuf='';this.framesSent=0;this.audioPackets=0;this.droppedVideo=0;this.droppedAudio=0;this.lastFrameAt=0;this.lastAudioAt=0;this.activeBridgePath='';this.bridgeDeployError='';this.bridgeIsStable=false;
  }
  loadConfig(){const r=safeJson(this.configFile,{})||{};return{enabled:r.enabled===true,name:cleanName(r.name),fps:[15,25,30,50,60].includes(Number(r.fps))?Number(r.fps):30,audio:r.audio!==false};}
  saveConfig(){atomicJson(this.configFile,this.config);}
  bridgePath(){if(this.activeBridgePath&&fs.existsSync(this.activeBridgePath))return this.activeBridgePath;const stable=stableBridgePath(this.dataDir);if(fs.existsSync(stable))return stable;return bundledBridgePath(this.resourcesDir);}
  prepareBridge(){const r=deployStableBridge({dataDir:this.dataDir,resourcesDir:this.resourcesDir,log:this.log});this.activeBridgePath=r.path||bundledBridgePath(this.resourcesDir);this.bridgeDeployError=r.error||'';this.bridgeIsStable=r.stable===true;return r;}
  status(){
    const runtime=findRuntime()||this.runtimePath,bridge=this.bridgePath(),bundled=bundledBridgePath(this.resourcesDir);
    return{enabled:this.config.enabled,name:this.config.name,fps:this.config.fps,audio:this.config.audio,running:this.running,starting:this.starting,bridgeAvailable:fs.existsSync(bridge)||fs.existsSync(bundled),bridgePath:bridge,bridgeStable:this.bridgeIsStable||bridge===stableBridgePath(this.dataDir),bridgeDeployError:this.bridgeDeployError||'',runtimeDetected:!!runtime,runtimePath:runtime||'',connections:this.connections,error:this.error||'',framesSent:this.framesSent,audioPackets:this.audioPackets,droppedVideo:this.droppedVideo,droppedAudio:this.droppedAudio,lastFrameAt:this.lastFrameAt,lastAudioAt:this.lastAudioAt,mode:'ndi-high-bandwidth',resolution:'follow-output'};
  }
  emit(){try{this.onState(this.status());}catch{}}
  parseLine(line){
    let p;try{p=JSON.parse(line);}catch{return;}
    if(p&&p.type==='ready'){this.running=true;this.starting=false;this.error='';if(p.path)this.runtimePath=String(p.path);this.log('OUTPUT_NDI','ready · '+this.config.name+' · '+this.config.fps+' fps · '+(this.runtimePath||'runtime'));this.emit();}
    else if(p&&p.type==='connections'){this.connections=Math.max(0,Number(p.value)||0);this.emit();}
    else if(p&&p.type==='error'){this.error=String(p.message||'Error NDI');if(p.path)this.runtimePath=String(p.path);this.log('OUTPUT_NDI_ERROR',this.error);this.emit();}
  }
  attach(child){
    if(child.stderr){child.stderr.setEncoding('utf8');child.stderr.on('data',chunk=>{this.stderrBuf+=chunk;let i;while((i=this.stderrBuf.indexOf('\n'))>=0){const line=this.stderrBuf.slice(0,i).trim();this.stderrBuf=this.stderrBuf.slice(i+1);if(line)this.parseLine(line);}});}
    if(child.stdin)child.stdin.on('error',e=>{if(!this.stopping){this.error='NDI pipe: '+(e.message||e);this.emit();}});
    child.on('error',e=>{this.error='No se pudo iniciar el bridge NDI: '+(e.message||e);this.starting=false;this.running=false;this.emit();});
    child.on('exit',(code,signal)=>{if(this.child===child)this.child=null;const expected=this.stopping||!this.config.enabled;this.running=false;this.starting=false;this.connections=0;if(!expected&&code!==0&&!this.error)this.error='NDI bridge terminó con código '+code+(signal?' ('+signal+')':'')+'.';this.emit();if(!expected&&this.config.enabled){clearTimeout(this.restartTimer);this.restartTimer=setTimeout(()=>this.start().catch(()=>{}),2500);}});
  }
  async start(){
    clearTimeout(this.restartTimer);
    if(!this.config.enabled){await this.stop(false);return this.status();}
    if(this.child&&this.running)return this.status();
    if(this.starting)return this.status();
    const prep=this.prepareBridge(),exe=prep.path;if(!prep.ok||!exe||!fs.existsSync(exe)){this.error=prep.error||'Bridge NDI no incluido en este build.';this.running=false;this.starting=false;this.emit();return this.status();}
    this.stopping=false;this.starting=true;this.error='';this.connections=0;this.emit();
    let child;
    try{child=spawn(exe,['--name',this.config.name,'--fps',String(this.config.fps),'--audio',this.config.audio?'1':'0'],{windowsHide:true,stdio:['pipe','ignore','pipe'],env:{...process.env}});}
    catch(e){this.starting=false;this.error=e.message||String(e);this.emit();return this.status();}
    this.child=child;this.attach(child);
    const started=Date.now();while(this.child===child&&!this.running&&!this.error&&Date.now()-started<8000)await new Promise(r=>setTimeout(r,80));
    if(!this.running&&!this.error){this.error='NDI bridge no confirmó inicio en 8 s.';this.emit();try{child.kill();}catch{}}
    return this.status();
  }
  async stop(emit=true){
    clearTimeout(this.restartTimer);this.restartTimer=null;this.stopping=true;const child=this.child;this.child=null;this.running=false;this.starting=false;this.connections=0;
    if(child){try{if(child.stdin)child.stdin.end();}catch{}await new Promise(resolve=>{let done=false;const finish=()=>{if(done)return;done=true;resolve();};child.once('exit',finish);setTimeout(()=>{try{child.kill();}catch{}finish();},1200);});}
    this.stopping=false;if(emit)this.emit();return this.status();
  }
  async configure(patch={}){
    const prev={...this.config};
    if(patch.enabled!=null)this.config.enabled=patch.enabled===true;
    if(patch.name!=null)this.config.name=cleanName(patch.name);
    if(patch.fps!=null){const f=Number(patch.fps);this.config.fps=[15,25,30,50,60].includes(f)?f:30;}
    if(patch.audio!=null)this.config.audio=patch.audio!==false;
    this.saveConfig();
    const restart=prev.name!==this.config.name||prev.fps!==this.config.fps||prev.audio!==this.config.audio||prev.enabled!==this.config.enabled;
    if(!this.config.enabled)await this.stop(false);else if(restart){await this.stop(false);await this.start();}else if(!this.running)await this.start();
    this.emit();return this.status();
  }
  canAcceptVideo(){return!!(this.running&&this.connections>0&&this.child&&this.child.stdin&&!this.child.stdin.destroyed&&this.child.stdin.writableLength<10*1024*1024);}
  writePacket(p,kind){
    const stdin=this.child&&this.child.stdin;if(!this.running||!stdin||stdin.destroyed)return false;
    const limit=kind==='video'?10*1024*1024:32*1024*1024;
    if(stdin.writableLength>limit){if(kind==='video')this.droppedVideo++;else this.droppedAudio++;return false;}
    try{stdin.cork();stdin.write(p.header);stdin.write(p.data);stdin.uncork();return true;}catch(e){try{stdin.uncork();}catch{}this.error='NDI pipe: '+(e.message||e);this.emit();return false;}
  }
  sendVideo(bitmap,width,height){
    if(!this.canAcceptVideo()){this.droppedVideo++;return false;}
    const b=Buffer.isBuffer(bitmap)?bitmap:Buffer.from(bitmap);if(b.length!==width*height*4){this.droppedVideo++;return false;}
    const ok=this.writePacket(packet(1,width,height,this.config.fps,b),'video');if(ok){this.framesSent++;this.lastFrameAt=Date.now();}return ok;
  }
  sendAudio(data,sampleRate,channels,samples){
    if(!this.config.audio||!this.running||this.connections<1)return false;
    const b=Buffer.isBuffer(data)?data:Buffer.from(data);if(b.length!==channels*samples*4){this.droppedAudio++;return false;}
    const ok=this.writePacket(packet(2,sampleRate,channels,samples,b),'audio');if(ok){this.audioPackets++;this.lastAudioAt=Date.now();}return ok;
  }
}
module.exports={OutputNdi,cleanName,runtimeCandidates,findRuntime,packet,bundledBridgePath,stableBridgePath,deployStableBridge};
