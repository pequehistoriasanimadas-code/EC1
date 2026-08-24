'use strict';

const {KokoroTTS}=require('./kokoro');
const {SettingsStore}=require('./settings');
const {PronunciationNormalizer}=require('./pronunciation');

const nowIso=()=>new Date().toISOString();
const keyOf=s=>String(s||'').normalize('NFKC').trim().toLocaleLowerCase('es');

function installKokoroOptimizedProfileGuard(){
  const proto=KokoroTTS.prototype;if(proto.__ec0322ProfileGuardInstalled)return;Object.defineProperty(proto,'__ec0322ProfileGuardInstalled',{value:true});
  const baseHealth=proto.healthCheck;
  proto.healthCheck=async function(force=false){
    try{
      const desired=this.profile(),desiredKey=this.profileKey(desired);
      if(this.worker&&this.workerReady&&this.workerProfileKey!==desiredKey){
        await this.stopAndWait('optimized-profile-change');force=true;
      }
    }catch{}
    return baseHealth.call(this,force);
  };
}

function installOptimizedSettingsGuard(){
  const proto=SettingsStore.prototype;if(proto.__ec0322SettingsGuardInstalled)return;Object.defineProperty(proto,'__ec0322SettingsGuardInstalled',{value:true});
  const baseSave=proto.save;
  proto.save=function(settings){
    let next=settings;
    try{
      if(next?.tts?.autoTuned===true&&next?.tts?.performanceConfig){
        next={...next,tts:{...next.tts,resourceMode:'performance'}};
      }
    }catch{}
    return baseSave.call(this,next);
  };
}

function installPronunciationLearningRestore(){
  const proto=PronunciationNormalizer.prototype;if(proto.__ec0322PronunciationInstalled)return;Object.defineProperty(proto,'__ec0322PronunciationInstalled',{value:true});
  const baseStatus=proto.status;

  // 0.3.19 reducía silenciosamente el presupuesto a 8 s y desactivaba Claude
  // cuando la IA editorial principal era local. 0.3.22 vuelve a respetar los
  // ajustes reales del usuario: normalizador local primero y Claude solo como
  // verificador de términos nuevos cuando el interruptor está activo.
  proto.normalize=async function(script,{smart=true}={}){
    const started=Date.now(),raw=String(script||''),settings=this.getSettings?.()||{};
    const maxMs=Math.max(5000,Math.min(30000,Number(settings?.tts?.pronunciationMaxSeconds)||15)*1000),deadline=started+maxMs;
    const candidates=this.candidates(raw),knownMap={},unknown=[];let cachedUsed=0,learningDirty=false;
    for(const c of candidates){
      const entry=this.learning.entries[keyOf(c.term)];
      if(entry){entry.uses=(entry.uses||0)+1;entry.updatedAt=entry.updatedAt||nowIso();learningDirty=true;cachedUsed++;if(entry.needsReplacement&&entry.pronunciation)knownMap[c.term]=entry.pronunciation;}
      else unknown.push(c);
    }

    let qwen={},qwenAttempted=false,qwenError='';
    if(smart&&unknown.length&&this.modelReady()&&Date.now()<deadline-1500){
      qwenAttempted=true;try{qwen=await this.smartMap(unknown,deadline);}catch(e){qwenError=e.message||String(e);this.onEvent({type:'pronunciation-warning',message:qwenError});}
    }

    let claude={used:false,items:[]},claudeAttempted=false,claudeError='';
    if(smart&&unknown.length&&typeof this.claudeVerify==='function'&&settings?.tts?.pronunciationClaudeVerify!==false&&Date.now()<deadline-1800){
      claudeAttempted=true;
      try{const remaining=Math.max(1500,deadline-Date.now()-300);claude=await this.claudeVerify(unknown,qwen,settings,remaining)||{used:false,items:[]};}
      catch(e){claudeError=e.message||String(e);this.onEvent({type:'pronunciation-warning',message:`Claude: ${claudeError}`});}
    }

    const learnedNow={},handled=new Set();let learnedCount=0;
    if(claude?.used){
      for(const x of claude.items||[]){
        const term=String(x.term||'').trim();if(!term)continue;handled.add(keyOf(term));
        const needs=!!x.needsReplacement,to=needs?this.validatePronunciation(term,x.pronunciation):'';if(needs&&!to)continue;
        const confidence=Math.max(0,Math.min(1,Number(x.confidence)||0));if(confidence<.65)continue;
        const local=qwen[term],source=local&&local.needsReplacement===needs&&keyOf(local.to||'')===keyOf(to||'')?'qwen+claude':'claude';
        this.learn(term,to,needs,source,confidence);learningDirty=true;learnedCount++;if(needs)learnedNow[term]=to;
      }
    }
    for(const c of unknown){
      if(handled.has(keyOf(c.term)))continue;const local=qwen[c.term];if(!local)continue;
      const confidence=Math.max(0,Math.min(1,Number(local.confidence)||0));if(confidence<.88)continue;
      const needs=!!local.needsReplacement,to=needs?this.validatePronunciation(c.term,local.to):'';if(needs&&!to)continue;
      this.learn(c.term,to,needs,'qwen',confidence);learningDirty=true;learnedCount++;if(needs)learnedNow[c.term]=to;
    }
    if(learningDirty)this.saveLearning();

    let out=this.applyMap(raw,{...knownMap,...learnedNow});out=this.basic(out);
    const smartAttempted=qwenAttempted||claudeAttempted,smartFailed=smartAttempted&&!Object.keys(qwen).length&&!(claude?.used&&claude.items?.length)&&(!!qwenError||!!claudeError),errors=[qwenError&&`Qwen: ${qwenError}`,claudeError&&`Claude: ${claudeError}`].filter(Boolean).join(' | ');
    return{text:out,elapsedMs:Date.now()-started,smartUsed:cachedUsed>0||Object.keys(learnedNow).length>0,smartAttempted,smartFailed,smartError:errors,qwenAttempted,qwenUsed:Object.keys(qwen).length>0,claudeAttempted,claudeUsed:!!claude?.used,learnedCount,modelReady:this.modelReady(),learningEntries:Object.keys(this.learning.entries).length,cacheEntries:Object.keys(this.learning.entries).length};
  };

  proto.status=function(){
    const state=baseStatus.call(this),settings=this.getSettings?.()||{},enabled=settings?.tts?.pronunciationClaudeVerify!==false;
    return{...state,localFirst:true,claudeVerifyEnabled:enabled,claudeVerifyEffective:enabled,maxSeconds:Math.max(5,Math.min(30,Number(settings?.tts?.pronunciationMaxSeconds)||15))};
  };
}

function installVersion0322Policy(){installKokoroOptimizedProfileGuard();installOptimizedSettingsGuard();installPronunciationLearningRestore();}
module.exports={installVersion0322Policy};
