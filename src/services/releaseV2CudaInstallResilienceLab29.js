'use strict';
const fs=require('fs');
const path=require('path');
const core=require('./ttsLabRuntime');

const {TTSLabRuntime,CUDA_RUNTIME,CUDA_CRITICAL_FILES}=core;
const CUDA_VALIDATE_TIMEOUT_MS=3*60*1000;
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));

function samePath(a,b){try{return path.resolve(String(a||''))===path.resolve(String(b||''));}catch{return String(a||'')===String(b||'');}}
function manifestMatches(saved,current){
  if(!saved||!current)return false;
  return CUDA_CRITICAL_FILES.every(rel=>saved[rel]&&current[rel]&&Number(saved[rel].size)===Number(current[rel].size)&&String(saved[rel].fingerprint||'')===String(current[rel].fingerprint||''));
}
function candidateRoot(runtime){return path.join(runtime.root,`${CUDA_RUNTIME.slot}.candidate`);}
function stageCandidateMarker(runtime,site){
  const root=path.dirname(path.resolve(site));
  if(!samePath(root,candidateRoot(runtime)))return null;
  const manifest=runtime.cudaManifestForSite(site);if(!manifest)return null;
  const old=runtime.readJson(runtime.cudaMarker(root))||{};
  if(old.validationPending!==true&&old.manifest&&manifestMatches(old.manifest,manifest))return old;
  const marker={...old,revision:CUDA_RUNTIME.revision,slot:CUDA_RUNTIME.slot,torch:CUDA_RUNTIME.torch,torchaudio:CUDA_RUNTIME.torchaudio,indexUrl:CUDA_RUNTIME.indexUrl,manifest,validationPending:true,validationTimeoutMs:CUDA_VALIDATE_TIMEOUT_MS,stagedAt:old.stagedAt||new Date().toISOString()};
  runtime.writeJson(runtime.cudaMarker(root),marker);return marker;
}
function pendingCandidateReusable(runtime,root=candidateRoot(runtime)){
  const marker=runtime.readJson(runtime.cudaMarker(root));
  if(marker?.validationPending!==true)return false;
  if(Number(marker.revision||0)!==CUDA_RUNTIME.revision||String(marker.slot||'')!==CUDA_RUNTIME.slot||String(marker.torch||'')!==CUDA_RUNTIME.torch||String(marker.torchaudio||'')!==CUDA_RUNTIME.torchaudio)return false;
  const current=runtime.cudaManifestForSite(path.join(root,'site-packages'));
  return manifestMatches(marker.manifest,current);
}
function clearPendingActive(runtime,info={}){
  const root=runtime.cudaRoot,marker=runtime.readJson(runtime.cudaMarker(root));
  if(marker?.validationPending!==true)return;
  runtime.writeJson(runtime.cudaMarker(root),{...marker,validationPending:false,validatedAt:new Date().toISOString(),runtime:clone(info)});
}
function decorateTimeout(error){
  const e=error instanceof Error?error:new Error(String(error||'Error'));
  if(/Validación CUDA excedió\s+\d+\s*s/i.test(String(e.message||''))||String(e.code||'')==='PROCESS_TIMEOUT'){
    e.code='PROCESS_TIMEOUT';e.timeoutMs=CUDA_VALIDATE_TIMEOUT_MS;e.retryable=true;
  }
  return e;
}

function installReleaseV2CudaInstallResilienceLab29(){
  const p=TTSLabRuntime.prototype;if(p.__ecLab29CudaInstallResilience)return;
  Object.defineProperty(p,'__ecLab29CudaInstallResilience',{value:true});
  core.CUDA_VALIDATE_TIMEOUT_MS=CUDA_VALIDATE_TIMEOUT_MS;

  p.cudaValidationTimeoutMs=function(){return CUDA_VALIDATE_TIMEOUT_MS;};
  p.cudaCandidateReusable=function(root=candidateRoot(this)){return pendingCandidateReusable(this,root);};

  p.validateCudaSite=async function(site=this.cudaSite){
    stageCandidateMarker(this,site);
    const code="import json,torch,torch.torch_version,torchaudio; print(json.dumps({'torch':str(torch.__version__).split('+')[0],'torchaudio':str(torchaudio.__version__).split('+')[0],'cuda':bool(torch.cuda.is_available()),'torch_cuda':str(torch.version.cuda or '')}))";
    let r;
    try{r=await this.runProcess(this.python,['-c',code],{timeoutMs:CUDA_VALIDATE_TIMEOUT_MS,label:'Validación CUDA',env:this.cudaEnvFor(site)});}
    catch(error){throw decorateTimeout(error);}
    if(r.status!==0)throw new Error(`Runtime CUDA inválido: ${String(r.stderr||r.stdout||'').trim().slice(-1600)}`);
    let info;try{info=JSON.parse(String(r.stdout||'').trim().split(/\r?\n/).filter(Boolean).pop());}catch{throw new Error('Runtime CUDA no devolvió un diagnóstico válido');}
    if(String(info.torch||'')!==CUDA_RUNTIME.torch||String(info.torchaudio||'')!==CUDA_RUNTIME.torchaudio)throw new Error(`Runtime CUDA cargó versiones inesperadas: Torch ${info.torch||'?'} / Torchaudio ${info.torchaudio||'?'}`);
    if(await this.nvidiaPresent()&&!info.cuda)throw new Error('Se detectó NVIDIA pero PyTorch CUDA no está disponible');
    if(samePath(site,this.cudaSite))clearPendingActive(this,info);
    return{ok:true,...info};
  };

  const baseRecover=p.recoverCudaTransaction;
  p.recoverCudaTransaction=async function(onProgress=null){
    const journal=this.readJson(this.cudaJournal());
    if(journal){
      const candidate=String(journal.candidate||candidateRoot(this));
      const activeQuick=this.cudaQuickHealth(this.cudaRoot);
      if(!activeQuick.ok&&pendingCandidateReusable(this,candidate)){
        this.progress(onProgress,'candidate-validation-pending','Runtime CUDA ya descargado · reintentando solo la validación…',{journalStage:journal.stage,reused:true,validationTimeoutMs:CUDA_VALIDATE_TIMEOUT_MS});
        return{ok:true,recovered:true,action:'candidate-validation-pending',candidate};
      }
    }
    return baseRecover.call(this,onProgress);
  };

  const baseSetOperationError=p.setOperationError;
  p.setOperationError=function(phase,error,extra={}){
    const e=decorateTimeout(error),out=baseSetOperationError.call(this,phase,e,extra);
    if(e.code==='PROCESS_TIMEOUT'&&out?.error){
      out.error.retryable=true;out.error.downloadReusable=this.cudaCandidateReusable();out.error.validationTimeoutMs=CUDA_VALIDATE_TIMEOUT_MS;
      this.operationState=out;this.writeJson(this.operationStateFile(),out);
    }
    return out;
  };
}

module.exports={CUDA_VALIDATE_TIMEOUT_MS,installReleaseV2CudaInstallResilienceLab29,pendingCandidateReusable,stageCandidateMarker};
