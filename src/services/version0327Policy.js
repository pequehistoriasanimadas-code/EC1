'use strict';

const fs=require('fs');
const path=require('path');
const {app,ipcMain}=require('electron');
const {PronunciationNormalizer}=require('./pronunciation');
const {KokoroTTS}=require('./kokoro');
const {AutomationEngine}=require('./automation0325');
const {normalizeSpeech,validateSpeech}=require('./speechNormalizer0326');
const {VERSION:ENGINE_VERSION,structuralPreNormalize}=require('./speechRules0327');
const {NormalizerPack0327,dataRoot}=require('./normalizerPack0327');

function backup0327(){try{const root=dataRoot(),marker=path.join(root,'.ec-0327-backup-done');if(fs.existsSync(marker))return;const dst=path.join(root,'backups','pre-0.3.27');fs.mkdirSync(dst,{recursive:true});for(const name of ['settings.json','settings.json.bak','pronunciation-learning.json']){const src=path.join(root,name);if(fs.existsSync(src))try{fs.copyFileSync(src,path.join(dst,name));}catch{}}const norm=path.join(root,'normalizer');if(fs.existsSync(norm))try{fs.cpSync(norm,path.join(dst,'normalizer'),{recursive:true,force:true});}catch{}fs.writeFileSync(marker,JSON.stringify({at:new Date().toISOString()},null,2),'utf8');}catch{}}
function beginsVowel(text){return /^[\s“”"'¿¡(\[]*[AEIOUÁÉÍÓÚÜaeiouáéíóúü]/u.test(String(text||''));}
function packManager(){if(!global.__ec0327NormalizerPack)global.__ec0327NormalizerPack=new NormalizerPack0327();return global.__ec0327NormalizerPack;}

function installSpeechPolicy(){
  const proto=PronunciationNormalizer.prototype;if(proto.__ec0327SpeechInstalled)return;Object.defineProperty(proto,'__ec0327SpeechInstalled',{value:true});
  const baseNormalize=proto.normalize,baseStatus=proto.status;
  proto.normalize=async function(script,options={}){
    const out=await baseNormalize.call(this,script,options),old=out?.speechDiagnostic||{},after=String(old.afterPronunciation??out.text??script??''),pack=packManager().load();
    let pre={text:after,transforms:[],version:ENGINE_VERSION},finalText=String(out?.text??after),fallback='';
    try{pre=structuralPreNormalize(after,{rules:pack.rules||[]});const normalized=normalizeSpeech(pre.text,{enabled:true}),check=validateSpeech(after,normalized.text);if(check.ok)finalText=normalized.text;else{finalText=pre.text;fallback=`0327: ${check.reason||'validación'}`;}}
    catch(e){finalText=String(out?.text??after);fallback=`0327: ${e.message||e}`;}
    const diag={...old,original:String(script||'').slice(0,700),afterPronunciation:after.slice(0,900),preNormalized0327:pre.text.slice(0,900),normalized:finalText.slice(0,1100),sentToKokoro:finalText.slice(0,1100),version:ENGINE_VERSION,rulesVersion:String(pack.rulesVersion||''),transforms:[...new Set([...(old.transforms||[]),...(pre.transforms||[])])],fallbackReason:[old.fallbackReason,fallback].filter(Boolean).join(' | ')};
    if(Array.isArray(this._speechDiagnostics)&&this._speechDiagnostics.length)this._speechDiagnostics[this._speechDiagnostics.length-1]=diag;else{this._speechDiagnostics=this._speechDiagnostics||[];this._speechDiagnostics.push(diag);}return{...out,text:finalText,speechNormalizerVersion:ENGINE_VERSION,speechTransforms:diag.transforms,speechFallbackReason:diag.fallbackReason,speechDiagnostic:diag};
  };
  proto.status=function(){const s=baseStatus.call(this),pack=packManager().status(),last=(this._speechDiagnostics||[]).at(-1)||null,list=Array.isArray(s?.learningList)?s.learningList.map(x=>{const inconsistent=!!x.needsReplacement&&!String(x.pronunciation||'').trim();return inconsistent?{...x,needsReplacement:false,inconsistentEmptyAdjustment:true}:x;}):s?.learningList;const invalid=Array.isArray(s?.learningList)?s.learningList.filter(x=>x?.needsReplacement&&!String(x?.pronunciation||'').trim()).length:0;return{...s,learningList:list,inconsistentLearningEntries:invalid,speechNormalizer:{...(s.speechNormalizer||{}),enabled:true,version:ENGINE_VERSION,rulesVersion:pack.rulesVersion,ruleCount:pack.ruleCount,testCount:pack.testCount,last,lastKokoro:global.__ec0327LastKokoroInput||null}};};
}

function installKokoroDiagnostics(){
  const proto=KokoroTTS.prototype;if(proto.__ec0327DiagnosticsInstalled)return;Object.defineProperty(proto,'__ec0327DiagnosticsInstalled',{value:true});const baseGenerate=proto.generate,baseStatus=proto.status;
  proto.generate=function(text,options={}){const raw=String(text||''),settings=this.settings?.()||{},guard=settings?.tts?.initialAttackProtection!==false&&beginsVowel(raw),diag={at:new Date().toISOString(),requested:raw.slice(0,1200),synthesis:(guard?`. ${raw}`:raw).slice(0,1200),prosodicGuard:guard};global.__ec0327LastKokoroInput=diag;return Promise.resolve(baseGenerate.call(this,text,options)).then(r=>{diag.outputPath=r?.path||'';diag.ok=true;return r;},e=>{diag.ok=false;diag.error=e?.message||String(e);throw e;});};
  proto.status=function(){return{...baseStatus.call(this),lastInput0327:global.__ec0327LastKokoroInput||null};};
}

function adaptiveState(engine,s,reason){const c=s?.canned||{},a=s?.automation||{},health=engine.bufferHealth?.(s)||{seconds:0,minutes:0},targetMin=Math.max(3,Math.min(60,Number(a.targetAutonomyMin)||15)),deficitSec=Math.max(0,targetMin*60-Number(health.seconds||0)),adaptive=c.adaptiveDuration!==false&&['recovery','emergency'].includes(reason);let adDurationSec=0,adName='';if(adaptive&&c.insertAdAfterContent!==false&&String(c.adsFolder||'').trim()){try{engine.ads?.requestDuration?.(0);const ad=engine.ads?.peek?.(c.adsFolder);adDurationSec=Number(ad?.durationSec)||0;adName=ad?.name||'';}catch{}}const requestedContentSec=adaptive?Math.max(0,deficitSec-adDurationSec):0;return{reason,adaptive,targetMin,currentSec:Number(health.seconds||0),currentMin:Number(health.minutes||0),deficitSec,adDurationSec,adName,requestedContentSec,selected:null,at:Date.now()};}
function installAdaptiveCanned(){
  const proto=AutomationEngine.prototype;if(proto.__ec0327AdaptiveInstalled)return;Object.defineProperty(proto,'__ec0327AdaptiveInstalled',{value:true});const baseReason=proto.cannedReason,basePlay=proto.playCanned,baseSnapshot=proto.snapshot,baseDisplay=proto.displayQueue;
  proto.cannedReason=function(s,hasReady){const first=baseReason.call(this,s,hasReady);if(first)return first;const c=s?.canned||{};if(!c.enabled||c.emergency===false||Date.now()<Number(this.cannedUnavailableUntil||0))return'';const health=this.bufferHealth?.(s);if(!health)return'';const recoveryMin=Math.max(2,Number(s?.automation?.recoveryAutonomyMin)||8);if(Number(health.minutes)>=recoveryMin)return'';if(this.__ec0327RecoveryNewsMarker===Number(this.scheduledNewsTotal||0)&&hasReady)return'';return hasReady?'recovery':'emergency';};
  proto.__ec0327PrepareCanned=function(s,reason){const state=adaptiveState(this,s,reason);try{this.canned?.requestDuration?.(state.requestedContentSec);const selected=this.canned?.peek?.(s?.canned?.folder||'');if(selected)state.selected={name:selected.name,durationSec:Number(selected.durationSec)||0,remainingInCycle:Number(selected.remainingInCycle)||0,total:Number(selected.total)||0};}catch(e){state.error=e.message||String(e);}this.__ec0327AdaptiveSelection=state;return state;};
  proto.playCanned=async function(s,reason){const st=this.__ec0327PrepareCanned(s,reason);const result=await basePlay.call(this,s,reason);if(result&&['recovery','emergency'].includes(reason)){this.__ec0327LastRecoveryAt=Date.now();this.__ec0327RecoveryNewsMarker=Number(this.scheduledNewsTotal||0);}if(st)this.__ec0327AdaptiveSelection={...st,played:!!result,completedAt:Date.now()};return result;};
  proto.displayQueue=function(s){const anyReady=(this.queue||[]).some(x=>x.status==='LISTA'),reason=this.cannedReason(s,anyReady);if(reason)this.__ec0327PrepareCanned(s,reason);let rows=baseDisplay.call(this,s);const st=this.__ec0327AdaptiveSelection;if(st?.selected&&['recovery','emergency'].includes(st.reason)&&!rows.some(x=>x?.planned&&x.sourceType==='content'&&x.title===st.selected.name)){const row={title:st.selected.name,status:'PROGRAMADO',sourceType:'content',planned:true,stage:'',planAfter:0,planText:st.reason==='recovery'?'Recuperación de autonomía':'Respaldo por falta de noticias',planReason:st.reason,durationSec:st.selected.durationSec};const onAir=rows.findIndex(x=>x.status==='AL AIRE');rows.splice(onAir>=0?onAir+1:0,0,row);}return rows;};
  proto.snapshot=function(extra={}){const snap=baseSnapshot.call(this,extra);snap.canned={...(snap.canned||{}),adaptiveSelection:this.__ec0327AdaptiveSelection||null};return snap;};
}

function installNormalizerIpc(){if(global.__ec0327NormalizerIpc)return;global.__ec0327NormalizerIpc=true;const bind=(ch,fn)=>{try{ipcMain.removeHandler(ch);}catch{}ipcMain.handle(ch,fn);};bind('normalizer:status',()=>packManager().status());bind('normalizer:import',()=>packManager().importDialog());bind('normalizer:restore',()=>packManager().restore());bind('normalizer:checkUpdate',()=>packManager().checkRemote());bind('normalizer:update',()=>packManager().updateRemote());}
function installMenuPolicy(){if(global.__ec0327MenuPolicy)return;global.__ec0327MenuPolicy=true;app.on('browser-window-created',(_,win)=>{try{if(/OUTPUT/i.test(win.getTitle?.()||''))return;win.setAutoHideMenuBar(true);win.setMenuBarVisibility(false);}catch{}});setTimeout(()=>{for(const win of app.getAllWindows?.()||[])try{if(!/OUTPUT/i.test(win.getTitle?.()||'')){win.setAutoHideMenuBar(true);win.setMenuBarVisibility(false);}}catch{}},1000);}
function installVersion0327Policy(){backup0327();packManager();installSpeechPolicy();installKokoroDiagnostics();installAdaptiveCanned();installNormalizerIpc();installMenuPolicy();}
module.exports={installVersion0327Policy,adaptiveState};
