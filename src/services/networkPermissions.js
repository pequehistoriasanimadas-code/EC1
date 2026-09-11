'use strict';
const fs=require('fs');
const path=require('path');
const {spawn}=require('child_process');
const {deployStableBridge,stableBridgePath}=require('./outputNdi');

function clampPort(value){const n=Math.round(Number(value)||8787);return Math.max(1024,Math.min(65535,n));}
function runHidden(exe,args=[],options={}){
  return new Promise(resolve=>{
    let stdout='',stderr='',settled=false;
    const finish=result=>{if(settled)return;settled=true;clearTimeout(timer);resolve(result);};
    let child;
    try{child=spawn(exe,args,{windowsHide:true,stdio:['ignore','pipe','pipe'],env:options.env||process.env});}
    catch(e){return finish({ok:false,code:-1,stdout:'',stderr:String(e?.message||e),spawnError:true});}
    child.stdout?.setEncoding('utf8');child.stderr?.setEncoding('utf8');
    child.stdout?.on('data',d=>{stdout+=String(d);if(stdout.length>65536)stdout=stdout.slice(-65536);});
    child.stderr?.on('data',d=>{stderr+=String(d);if(stderr.length>65536)stderr=stderr.slice(-65536);});
    child.on('error',e=>finish({ok:false,code:-1,stdout,stderr:String(e?.message||e),spawnError:true}));
    child.on('exit',code=>finish({ok:Number(code)===0,code:Number(code)||0,stdout:stdout.trim(),stderr:stderr.trim()}));
    const timer=setTimeout(()=>{try{child.kill();}catch{}finish({ok:false,code:-2,stdout:stdout.trim(),stderr:'Tiempo de espera agotado.',timeout:true});},Math.max(1000,Number(options.timeoutMs)||15000));
  });
}
function parseStatus(text){
  const rows=String(text||'').trim().split(/\r?\n/).filter(Boolean);
  for(let i=rows.length-1;i>=0;i--)try{const value=JSON.parse(rows[i]);if(value&&typeof value==='object')return value;}catch{}
  return null;
}
function classifyElevationFailure(result={}){
  const code=Number(result.code),text=String(result.stderr||result.stdout||'').trim(),low=text.toLowerCase();
  if(code===1223||/cancel(?:led|ed|ar|ado|ada)|operaci[oó]n.*cancel/.test(low))return{kind:'cancelled',code,text};
  if(code===740||code===5||/group policy|directiva|pol[ií]tica|administrator|administrador|elevation|elevaci[oó]n|privilege|privilegio|access is denied|acceso denegado|blocked|bloquead/.test(low))return{kind:'policy-blocked',code,text};
  if(result.timeout)return{kind:'timeout',code,text};
  if(result.spawnError)return{kind:'spawn-error',code,text};
  return{kind:result.ok?'ok':'failed',code,text};
}
class NetworkPermissions{
  constructor({dataDir,resourcesDir,log}={}){
    this.dataDir=path.resolve(dataDir||'.');this.resourcesDir=path.resolve(resourcesDir||'.');this.log=log||(()=>{});
  }
  helperPath(){return path.join(this.resourcesDir,'runtime','network','gec-network-permissions.exe');}
  deploy(){return deployStableBridge({dataDir:this.dataDir,resourcesDir:this.resourcesDir,log:this.log});}
  async status(lanPort=8787){
    const port=clampPort(lanPort),helper=this.helperPath(),deployment=this.deploy(),expectedBridge=stableBridgePath(this.dataDir);
    if(process.platform!=='win32')return{ok:true,supported:false,configured:false,ndiConfigured:false,lanConfigured:false,lanPort:port,bridgePath:deployment.path||expectedBridge,bridgeStable:false,message:'Los permisos automáticos de red solo se configuran en Windows.'};
    if(!fs.existsSync(helper))return{ok:false,supported:true,configured:false,ndiConfigured:false,lanConfigured:false,lanPort:port,bridgePath:deployment.path||expectedBridge,bridgeStable:deployment.stable===true,error:'El helper de permisos de red no está incluido en este build.'};
    if(deployment.stable!==true)return{ok:false,supported:true,configured:false,ndiConfigured:false,lanConfigured:false,lanPort:port,bridgePath:deployment.path||expectedBridge,bridgeStable:false,error:deployment.error||'No se pudo preparar la ruta estable de NDI.'};
    const result=await runHidden(helper,['--status',`--bridge=${deployment.path}`,`--lan-port=${port}`],{timeoutMs:15000});
    const parsed=parseStatus(result.stdout);
    if(!parsed)return{ok:false,supported:true,configured:false,ndiConfigured:false,lanConfigured:false,lanPort:port,bridgePath:deployment.path,bridgeStable:true,error:result.stderr||'No se pudo consultar Windows Firewall.'};
    return{...parsed,ok:parsed.ok!==false&&result.ok,supported:true,lanPort:port,bridgePath:deployment.path,bridgeStable:true,helperPath:helper,error:parsed.error||(!result.ok?(result.stderr||'No se pudo consultar Windows Firewall.'):'')};
  }
  async configure(lanPort=8787){
    const port=clampPort(lanPort),before=await this.status(port);
    if(before.supported===false||before.configured===true)return before;
    if(before.bridgeStable!==true)return before;
    const helper=this.helperPath(),bridge=before.bridgePath||stableBridgePath(this.dataDir);
    if(!fs.existsSync(helper))return before;
    const script=`$ErrorActionPreference='Stop'; try { $b=$env:GEC_NETWORK_BRIDGE.Replace('"',''); $a='--configure --bridge="'+$b+'" --lan-port='+$env:GEC_NETWORK_PORT; $p=Start-Process -FilePath $env:GEC_NETWORK_HELPER -ArgumentList $a -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ErrorAction Stop; exit $p.ExitCode } catch { $m=$_.Exception.Message; [Console]::Error.WriteLine($m); if($m -match 'cancel|cancelad') { exit 1223 }; exit 5 }`;
    const env={...process.env,GEC_NETWORK_HELPER:helper,GEC_NETWORK_BRIDGE:bridge,GEC_NETWORK_PORT:String(port)};
    let elevated;
    try{elevated=await runHidden('powershell.exe',['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-Command',script],{env,timeoutMs:300000});}
    catch(e){elevated={ok:false,code:-1,stderr:String(e?.message||e)};}
    const failure=classifyElevationFailure(elevated);
    if(failure.kind==='cancelled')return{...before,ok:false,cancelled:true,elevationState:'cancelled',error:'La autorización de Windows fue cancelada. GEC continúa funcionando normalmente.'};
    const after=await this.status(port);
    if(after.configured===true)return{...after,ok:true,configured:true,changed:true,elevationState:'configured'};
    if(!elevated.ok){
      if(failure.kind==='policy-blocked')return{...after,ok:false,policyManaged:true,elevationState:'policy-blocked',error:'Windows bloqueó la solicitud de administrador o no permite modificar estas reglas. La configuración puede estar administrada por tu organización; solicita autorización a Sistemas.'};
      if(failure.kind==='timeout')return{...after,ok:false,elevationState:'timeout',error:'Windows no respondió a la solicitud de permisos dentro del tiempo esperado.'};
      const detail=failure.text?` · ${failure.text}`:'';return{...after,ok:false,elevationState:'failed',error:`Windows no pudo completar la solicitud de permisos${detail}`};
    }
    return{...after,ok:false,policyManaged:true,elevationState:'policy-blocked',error:after.error||'Windows finalizó la configuración, pero las reglas de red no quedaron activas. Una política de la organización puede estar reemplazándolas.'};
  }
}
module.exports={NetworkPermissions,clampPort,runHidden,parseStatus,classifyElevationFailure};