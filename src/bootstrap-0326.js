'use strict';

const fs=require('fs');
const path=require('path');
const {SettingsStore}=require('./services/settings');
const {FontManager}=require('./services/fonts');
const {PronunciationNormalizer}=require('./services/pronunciation');
const {KokoroTTS}=require('./services/kokoro');
const {VERSION:SPEECH_VERSION,normalizeSpeech,validateSpeech}=require('./services/speechNormalizer0326');

function safeCopy(src,dst){try{if(!fs.existsSync(src))return;fs.mkdirSync(path.dirname(dst),{recursive:true});if(fs.statSync(src).isDirectory())fs.cpSync(src,dst,{recursive:true,force:false,errorOnExist:false});else fs.copyFileSync(src,dst);}catch{}}
function backupBefore0326(store){
  try{
    const root=store?.baseDir;if(!root)return;const marker=path.join(root,'.ec-0326-backup-done');if(fs.existsSync(marker))return;
    const backup=path.join(root,'backups','pre-0.3.26');fs.mkdirSync(backup,{recursive:true});
    for(const name of ['settings.json','settings.json.bak','pronunciation-learning.json','pronunciation-cache.json'])safeCopy(path.join(root,name),path.join(backup,name));
    safeCopy(path.join(root,'fonts'),path.join(backup,'fonts'));
    fs.writeFileSync(marker,new Date().toISOString(),'utf8');
  }catch{}
}
function normName(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/^ec custom\s*[·.-]?\s*/,'').replace(/\b(regular|medium|semibold|semi bold|bold|extra bold|extrabold|black|italic|bold italic|variablefont|variable font)\b/g,'').replace(/[^a-z0-9]+/g,'');}
function migrateLegacyFontFamily(value,faces){
  const current=String(value||'Arial');if(!/^EC Custom\s*·/i.test(current))return current;
  const needle=normName(current);let best='';for(const f of faces||[]){const fam=String(f?.family||'').trim();if(!fam)continue;const n=normName(fam);if(n&&needle&&(needle===n||needle.includes(n)||n.includes(needle))){if(n.length>normName(best).length)best=fam;}}
  return best||current;
}
function migrate0326(data,store){
  const out=data&&typeof data==='object'?data:{};out.tts=out.tts||{};
  if(out.tts.speechNormalizerEnabled==null)out.tts.speechNormalizerEnabled=true;
  if(out.tts.speechDiagnostics==null)out.tts.speechDiagnostics=true;
  if(out.tts.initialAttackProtection==null)out.tts.initialAttackProtection=true;
  out.tts.speechNormalizerVersion=SPEECH_VERSION;
  out.tts.initialAttackPaddingMs=Math.max(0,Math.min(200,Number(out.tts.initialAttackPaddingMs)||70));
  try{
    const fm=new FontManager(store.baseDir),faces=fm.custom();const visual=out.visual=out.visual||{},o=visual.output=visual.output||{};
    for(const key of ['titleFontFamily','summaryFontFamily','categoryFontFamily','dateFontFamily','exclusiveFontFamily','fontFamily'])o[key]=migrateLegacyFontFamily(o[key]||'Arial',faces);
  }catch{}
  return out;
}

if(!SettingsStore.prototype.__ec0326SettingsPatched){
  Object.defineProperty(SettingsStore.prototype,'__ec0326SettingsPatched',{value:true});
  const baseDefaults=SettingsStore.prototype.defaults,baseLoad=SettingsStore.prototype.load;
  SettingsStore.prototype.defaults=function(){return migrate0326(baseDefaults.call(this),this);};
  SettingsStore.prototype.load=function(){backupBefore0326(this);return migrate0326(baseLoad.call(this),this);};
}

function firstWord(text){const m=String(text||'').match(/^\s*[“”"'¿¡(\[]*([\p{L}\p{M}][\p{L}\p{M}'’.-]*)/u);return m?m[1]:'';}
function protectMutilatedFirstWord(original,changed){
  const a=firstWord(original),b=firstWord(changed);if(!a||!b||a===b)return changed;
  const na=a.toLocaleLowerCase('es'),nb=b.toLocaleLowerCase('es');
  if(a.length>=5&&nb.length>=2&&na.endsWith(nb)&&na.length-nb.length<=3){const idx=String(changed).indexOf(b);if(idx>=0)return String(changed).slice(0,idx)+a+String(changed).slice(idx+b.length);}
  return changed;
}
function looksPlainCapitalized(term){return /^[A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]{3,}$/u.test(String(term||''));}

if(!PronunciationNormalizer.prototype.__ec0326SpeechPatched){
  Object.defineProperty(PronunciationNormalizer.prototype,'__ec0326SpeechPatched',{value:true});
  const baseCandidates=PronunciationNormalizer.prototype.candidates;
  PronunciationNormalizer.prototype.candidates=function(text){
    const rows=baseCandidates.call(this,text),lead=String(text||'').search(/\S/);return rows.filter(c=>{
      const known=this.learning?.entries?.[String(c.term||'').normalize('NFKC').trim().toLocaleLowerCase('es')];
      if(known)return true;
      if(Number(c.index)<=Math.max(0,lead)+2&&Number(c.score)<=2&&looksPlainCapitalized(c.term))return false;
      return true;
    });
  };
  const baseNormalize=PronunciationNormalizer.prototype.normalize;
  PronunciationNormalizer.prototype.normalize=async function(script,options={}){
    const raw=String(script||''),started=Date.now();let base;
    try{base=await baseNormalize.call(this,raw,options);}catch(e){throw e;}
    const afterPronunciation=protectMutilatedFirstWord(raw,String(base?.text??raw));const settings=this.getSettings?.()||{},enabled=settings?.tts?.speechNormalizerEnabled!==false;
    let finalText=afterPronunciation,transforms=[],fallbackReason='',normalizerVersion=SPEECH_VERSION;
    if(enabled){
      try{const normalized=normalizeSpeech(afterPronunciation,{enabled:true});normalizerVersion=normalized.version;const check=validateSpeech(afterPronunciation,normalized.text);if(check.ok){finalText=normalized.text;transforms=normalized.transforms||[];}else fallbackReason=check.reason||'validación';}
      catch(e){fallbackReason=String(e?.message||e||'fallo del normalizador').slice(0,180);finalText=afterPronunciation;}
    }
    const diag={at:new Date().toISOString(),original:raw.slice(0,700),afterPronunciation:afterPronunciation.slice(0,700),normalized:finalText.slice(0,900),transforms:[...new Set(transforms)],version:normalizerVersion,fallbackReason,elapsedMs:Date.now()-started};
    this._speechDiagnostics=this._speechDiagnostics||[];this._speechDiagnostics.push(diag);if(this._speechDiagnostics.length>20)this._speechDiagnostics.splice(0,this._speechDiagnostics.length-20);
    return{...base,text:finalText,speechNormalizerVersion:normalizerVersion,speechTransforms:diag.transforms,speechFallbackReason:fallbackReason,speechDiagnostic:diag};
  };
  const baseStatus=PronunciationNormalizer.prototype.status;
  PronunciationNormalizer.prototype.status=function(){const s=baseStatus.call(this),settings=this.getSettings?.()||{};return{...s,speechNormalizer:{enabled:settings?.tts?.speechNormalizerEnabled!==false,version:SPEECH_VERSION,diagnosticsEnabled:settings?.tts?.speechDiagnostics!==false,last:(this._speechDiagnostics||[]).at(-1)||null,recent:(this._speechDiagnostics||[]).slice(-8)}};};
}

function addWavLeadingSilence(file,padMs){
  const ms=Math.max(0,Math.min(200,Number(padMs)||0));if(ms<=0)return 0;
  try{
    const buf=fs.readFileSync(file);if(buf.length<44||buf.toString('ascii',0,4)!=='RIFF'||buf.toString('ascii',8,12)!=='WAVE')return 0;
    let pos=12,fmt=null,data=null;while(pos+8<=buf.length){const id=buf.toString('ascii',pos,pos+4),size=buf.readUInt32LE(pos+4),start=pos+8;if(id==='fmt '&&size>=16)fmt={byteRate:buf.readUInt32LE(start+8),blockAlign:buf.readUInt16LE(start+12)};if(id==='data'){data={header:pos,start,size};break;}pos=start+size+(size%2);}
    if(!fmt||!data||!fmt.byteRate||!fmt.blockAlign)return 0;let bytes=Math.round(fmt.byteRate*ms/1000);bytes=Math.max(fmt.blockAlign,Math.round(bytes/fmt.blockAlign)*fmt.blockAlign);const zeros=Buffer.alloc(bytes),before=buf.subarray(0,data.start),audio=buf.subarray(data.start,data.start+data.size),after=buf.subarray(data.start+data.size),out=Buffer.concat([before,zeros,audio,after]);out.writeUInt32LE(data.size+bytes,data.header+4);out.writeUInt32LE(out.length-8,4);fs.writeFileSync(file,out);return Math.round(bytes/fmt.byteRate*1000);
  }catch{return 0;}
}
function beginsWithVowel(text){return /^[\s“”"'¿¡(\[]*[AEIOUÁÉÍÓÚÜaeiouáéíóúü]/u.test(String(text||''));}
if(!KokoroTTS.prototype.__ec0326AttackPatched){
  Object.defineProperty(KokoroTTS.prototype,'__ec0326AttackPatched',{value:true});const baseGenerate=KokoroTTS.prototype.generate;
  KokoroTTS.prototype.generate=function(text,options={}){
    const raw=String(text||''),settings=this.settings?.()||{},enabled=settings?.tts?.initialAttackProtection!==false,pad=Math.max(0,Math.min(200,Number(settings?.tts?.initialAttackPaddingMs)||70)),shouldPad=enabled&&beginsWithVowel(raw),synthesisText=shouldPad?`. ${raw}`:raw;
    const promise=baseGenerate.call(this,synthesisText,options);return Promise.resolve(promise).then(audio=>{const actual=shouldPad?addWavLeadingSilence(audio?.path,pad):0;if(actual>0&&audio){audio.durationSec=Number(audio.durationSec||0)+actual/1000;audio.attackPaddingMs=actual;audio.initialAttackProtected=true;if(audio.durationSec>0&&audio.elapsedMs>0)audio.realtimeFactor=Number(((audio.elapsedMs/1000)/audio.durationSec).toFixed(3));}else if(audio){audio.attackPaddingMs=0;audio.initialAttackProtected=!!enabled;}this.lastAttackDiagnostic={at:new Date().toISOString(),firstWord:firstWord(raw),startsWithVowel:beginsWithVowel(raw),paddingMs:actual,prosodicGuard:shouldPad,path:audio?.path||''};return audio;});
  };
}

require('./bootstrap-0325');
