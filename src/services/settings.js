const fs=require('fs');
const path=require('path');
const {safeStorage}=require('electron');

const DEFAULT_CLAUDE_MODEL='claude-haiku-4-5-20251001';
function sourceWebFromUrl(value){
  try{return new URL(String(value||'').trim()).hostname.toLowerCase().replace(/^(?:www|m|amp)\./,'').trim();}catch{return'';}
}
function publisherNameFromWeb(web){
  const base=String(web||'').split('.')[0].toLowerCase(),known={elcomercio:'El Comercio',gestion:'Gestión',rpp:'RPP',larepublica:'La República',peru21:'Perú 21',andina:'Andina'};
  if(known[base])return known[base];return base.replace(/[-_]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
}

class SettingsStore{
  constructor(baseDir){this.baseDir=baseDir;this.file=path.join(baseDir,'settings.json');this.backupFile=path.join(baseDir,'settings.json.bak');fs.mkdirSync(baseDir,{recursive:true});}
  defaults(){return{
    rssFeeds:[{id:'ec-ultimas',name:'Últimas Noticias',url:'https://elcomercio.pe/arc/outboundfeeds/rss/category/ultimas-noticias/?outputType=xml',enabled:true,priority:100,sourceMode:'auto',accessMode:'auto'}],
    rssPartialClose:{enabled:true,template:'Para más información, visita {web}.'},
    exclusiveClose:{enabled:true,template:'Este contenido es exclusivo de {medio}. Para leer la nota, visita {web}.'},
    ai:{primary:'local',backup1:'claude',backup2:'gemini',claudeKeyEnc:'',claudeModel:DEFAULT_CLAUDE_MODEL,geminiKeyEnc:'',geminiModel:'',targetSeconds:60,localBackupMode:'on_demand',localIdleMinutes:5,localResourceMode:'safe_streaming',editorialPrompt:'',lastValidEditorialPrompt:'',editorialInstructions:''},
    tts:{voice:'ef_dora',fallbackVoice:'ef_dora',speed:1.0,resourceMode:'safe_streaming',performanceThreads:6,pronunciationSmart:true,pronunciationClaudeVerify:true,pronunciationMaxSeconds:15,persistent:true,persistentIdleMinutes:5,autoTune:true,autoTuned:false},
    visual:{fallbackImage:'',pauseSeconds:2.5,showSummary:true,theme:{yellow:'#F7C600',black:'#000000',white:'#FFFFFF'},queueColors:{rss:'#2E7D32',generated:'#2563EB',content:'#D97706',ad:'#7C3AED',error:'#B91C1C'},output:{
      format:'16:9',fontFamily:'Arial',titleFontFamily:'Arial',summaryFontFamily:'Arial',categoryFontFamily:'Arial',dateFontFamily:'Arial',exclusiveFontFamily:'Arial',
      titleFontSize:64,summaryFontSize:30,categoryFontSize:22,dateFontSize:18,exclusiveFontSize:18,
      titleFontWeight:800,summaryFontWeight:400,categoryFontWeight:900,dateFontWeight:500,exclusiveFontWeight:800,
      titleColor:'#FFFFFF',summaryColor:'#F3F3F3',dateColor:'#F3F3F3',categoryBgColor:'#F7C600',categoryTextColor:'#000000',lowerBgColor:'#000000',lowerOpacity:.88,
      exclusiveEnabled:true,exclusiveText:'EXCLUSIVO',exclusiveTextColor:'#000000',exclusiveBgColor:'#F7C600',exclusiveBorderColor:'#F7C600',exclusiveBorderWidth:0,exclusiveRadius:5,exclusivePosition:'meta',
      animation:'auto',motionSpeed:'normal',tiktokSafe:true,showSafeGuides:true,verticalVideoBackground:'',musicFile:'',musicEnabled:false,musicLoop:true,musicVolume:20,voiceVolume:100,cannedVolume:100,transitionEnabled:true,transitionType:'fade',transitionDuration:.7}},
    canned:{enabled:false,folder:'',adsFolder:'',insertAdAfterContent:true,emergency:true,interval:10,adaptiveDuration:true},
    documents:{folder:'',watch:false,targetSeconds:60,categoryMode:'auto',batchDate:'',priority:'normal',processed:{}},
    automation:{updateMinutes:2,maxAgeHours:6,bufferReady:15,queueMax:30,avoidRepeats:true,onlyMainImage:true,activeFeedIds:[],recoveryAutonomyMin:8,criticalAutonomyMin:3,targetAutonomyMin:15,generatedEveryRss:5}
  };}
  readRawFile(file){try{if(!fs.existsSync(file))return null;const parsed=JSON.parse(fs.readFileSync(file,'utf8'));return parsed&&typeof parsed==='object'?parsed:null;}catch{return null;}}
  load(){
    let data=this.defaults(),raw=this.readRawFile(this.file);if(!raw)raw=this.readRawFile(this.backupFile);if(raw)data=this.merge(data,raw);data.ai=data.ai||{};data.tts=data.tts||{};data.visual=data.visual||{};data.visual.output=data.visual.output||{};data.visual.queueColors=data.visual.queueColors||{};data.canned=data.canned||{};data.documents=data.documents||{};data.documents.processed=data.documents.processed&&typeof data.documents.processed==='object'?data.documents.processed:{};data.automation=data.automation||{};
    data.rssPartialClose={enabled:data.rssPartialClose?.enabled!==false,template:String(data.rssPartialClose?.template||'Para más información, visita {web}.').trim()||'Para más información, visita {web}.'};
    data.exclusiveClose={enabled:data.exclusiveClose?.enabled!==false,template:String(data.exclusiveClose?.template||'Este contenido es exclusivo de {medio}. Para leer la nota, visita {web}.').trim()||'Este contenido es exclusivo de {medio}. Para leer la nota, visita {web}.'};
    data.rssFeeds=(Array.isArray(data.rssFeeds)?data.rssFeeds:[]).map((f,i)=>{const id=String(f?.id||`rss-${i}`),url=String(f?.url||'').trim(),name=f?.name==null?'Fuente':String(f.name),publisherWeb=sourceWebFromUrl(url),publisherName=String(f?.publisherName||publisherNameFromWeb(publisherWeb)||name||'').trim(),sourceMode=['auto','rss','web'].includes(String(f?.sourceMode||'').toLowerCase())?String(f.sourceMode).toLowerCase():'auto',accessMode=['auto','public','exclusive'].includes(String(f?.accessMode||'').toLowerCase())?String(f.accessMode).toLowerCase():'auto';return{...f,id,name,url,enabled:f?.enabled!==false,priority:Number(f?.priority)||50,publisherName,publisherWeb,sourceMode,accessMode,partialCtaEnabled:data.rssPartialClose.enabled,partialCtaTemplate:data.rssPartialClose.template,exclusiveCtaEnabled:data.exclusiveClose.enabled,exclusiveCtaTemplate:data.exclusiveClose.template};});
    if(!String(data.ai.claudeModel||'').trim())data.ai.claudeModel=DEFAULT_CLAUDE_MODEL;data.ai.editorialPrompt=String(data.ai.editorialPrompt||'');data.ai.lastValidEditorialPrompt=String(data.ai.lastValidEditorialPrompt||'');data.ai.editorialInstructions=String(data.ai.editorialInstructions||'');
    data.tts.pronunciationMaxSeconds=Math.max(5,Math.min(30,Number(data.tts.pronunciationMaxSeconds)||15));data.tts.persistentIdleMinutes=Math.max(1,Math.min(30,Number(data.tts.persistentIdleMinutes)||5));data.tts.performanceThreads=Math.max(1,Math.min(12,Number(data.tts.performanceThreads)||6));data.tts.fallbackVoice=String(data.tts.fallbackVoice||'ef_dora');
    const o=data.visual.output,legacyFont=String(o.fontFamily||'Arial');for(const key of ['titleFontFamily','summaryFontFamily','categoryFontFamily','dateFontFamily','exclusiveFontFamily'])if(!o[key])o[key]=legacyFont;if(!o.dateColor)o.dateColor=o.summaryColor||'#F3F3F3';o.transitionType=o.transitionType==='none'?'none':'fade';o.transitionEnabled=o.transitionType!=='none';
    o.titleFontSize=Math.max(20,Math.min(120,Number(o.titleFontSize)||64));o.summaryFontSize=Math.max(12,Math.min(72,Number(o.summaryFontSize)||30));o.categoryFontSize=Math.max(10,Math.min(48,Number(o.categoryFontSize)||22));o.dateFontSize=Math.max(10,Math.min(48,Number(o.dateFontSize)||18));o.exclusiveFontSize=Math.max(10,Math.min(48,Number(o.exclusiveFontSize)||18));
    o.titleFontWeight=Math.max(100,Math.min(900,Number(o.titleFontWeight)||800));o.summaryFontWeight=Math.max(100,Math.min(900,Number(o.summaryFontWeight)||400));o.categoryFontWeight=Math.max(100,Math.min(900,Number(o.categoryFontWeight)||900));o.dateFontWeight=Math.max(100,Math.min(900,Number(o.dateFontWeight)||500));o.exclusiveFontWeight=Math.max(100,Math.min(900,Number(o.exclusiveFontWeight)||800));
    data.documents.targetSeconds=Math.max(30,Math.min(180,Number(data.documents.targetSeconds)||60));data.automation.recoveryAutonomyMin=Math.max(2,Math.min(30,Number(data.automation.recoveryAutonomyMin)||8));data.automation.criticalAutonomyMin=Math.max(1,Math.min(data.automation.recoveryAutonomyMin,Number(data.automation.criticalAutonomyMin)||3));data.automation.targetAutonomyMin=Math.max(3,Math.min(60,Number(data.automation.targetAutonomyMin)||15));const generatedRaw=Number(data.automation.generatedEveryRss);data.automation.generatedEveryRss=Number.isFinite(generatedRaw)?Math.max(0,Math.min(50,generatedRaw)):5;data.canned.adaptiveDuration=data.canned.adaptiveDuration!==false;
    if(raw?.ai&&raw.ai.localResourceMode===undefined){data.ai.localResourceMode='safe_streaming';if(Number(raw.ai.localIdleMinutes)===10)data.ai.localIdleMinutes=5;}if(raw?.automation&&Number(raw.automation.bufferReady)===5&&Number(raw.automation.queueMax)===12){data.automation.bufferReady=15;data.automation.queueMax=30;}return data;
  }
  merge(base,extra){if(!extra||typeof extra!=='object')return base;const out=Array.isArray(base)?[...extra]:{...base};for(const[k,v]of Object.entries(extra)){if(v&&typeof v==='object'&&!Array.isArray(v)&&base[k]&&typeof base[k]==='object'&&!Array.isArray(base[k]))out[k]=this.merge(base[k],v);else out[k]=v;}return out;}
  save(settings){
    fs.mkdirSync(this.baseDir,{recursive:true});const tmp=`${this.file}.tmp`,feeds=(Array.isArray(settings?.rssFeeds)?settings.rssFeeds:[]).map(f=>{const{publisherName,publisherWeb,partialCtaEnabled,partialCtaTemplate,exclusiveCtaEnabled,exclusiveCtaTemplate,...clean}=f||{};return clean;}),payload={...settings,rssFeeds:feeds,rssPartialClose:{enabled:settings?.rssPartialClose?.enabled!==false,template:String(settings?.rssPartialClose?.template||'Para más información, visita {web}.').trim()||'Para más información, visita {web}.'},exclusiveClose:{enabled:settings?.exclusiveClose?.enabled!==false,template:String(settings?.exclusiveClose?.template||'Este contenido es exclusivo de {medio}. Para leer la nota, visita {web}.').trim()||'Este contenido es exclusivo de {medio}. Para leer la nota, visita {web}.'}};fs.writeFileSync(tmp,JSON.stringify(payload,null,2),'utf8');if(fs.existsSync(this.file)){try{fs.copyFileSync(this.file,this.backupFile);}catch{}}try{fs.renameSync(tmp,this.file);}catch{fs.copyFileSync(tmp,this.file);try{fs.rmSync(tmp,{force:true});}catch{}}
  }
  encryptSecret(value){if(!value)return'';if(safeStorage.isEncryptionAvailable())return safeStorage.encryptString(value).toString('base64');return Buffer.from(value,'utf8').toString('base64');}
  decryptSecret(value){if(!value)return'';try{const buf=Buffer.from(value,'base64');if(safeStorage.isEncryptionAvailable())return safeStorage.decryptString(buf);return buf.toString('utf8');}catch{return'';}}
}
module.exports={SettingsStore,DEFAULT_CLAUDE_MODEL,sourceWebFromUrl,publisherNameFromWeb};
