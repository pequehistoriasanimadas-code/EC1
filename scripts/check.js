const fs=require('fs');
const path=require('path');
const os=require('os');
const {spawnSync}=require('child_process');

let failed=false;
function assert(ok,message){if(!ok)throw new Error(message);}
function walk(dir){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const p=path.join(dir,entry.name);
    if(entry.isDirectory())walk(p);
    else if(p.endsWith('.js')){
      const r=spawnSync(process.execPath,['--check',p],{encoding:'utf8'});
      if(r.status!==0){failed=true;console.error(`Syntax error: ${p}`);console.error(r.stderr);}
    }
  }
}
walk('src');walk('scripts');if(failed)process.exit(1);

try{
  const {parseFeed}=require('../src/services/rss');
  const sample=`<?xml version="1.0"?><rss><channel><item><title><![CDATA[Noticia de prueba]]></title><link>https://example.com/nota</link><description>Descripción</description><pubDate>Wed, 19 Aug 2026 10:00:00 GMT</pubDate></item></channel></rss>`;
  const items=parseFeed(sample,{id:'test',name:'Test'});assert(items.length===1&&items[0].link==='https://example.com/nota','RSS parser smoke test failed');

  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ec-news-0311-check-'));
  const videos=path.join(tmp,'videos');fs.mkdirSync(videos);
  for(const name of ['a.mp4','b.mp4','c.webm'])fs.writeFileSync(path.join(videos,name),'x');
  const {CannedManager}=require('../src/services/canned');
  const contents=new CannedManager(),ads=new CannedManager();
  assert(contents.list(videos).count===3,'Contents folder scan failed');assert(ads.list(videos).count===3,'Ads folder scan failed');
  assert(new Set([contents.pick(videos).name,contents.pick(videos).name,contents.pick(videos).name]).size===3,'Contents random bag repeated early');
  assert(new Set([ads.pick(videos).name,ads.pick(videos).name,ads.pick(videos).name]).size===3,'Ads random bag repeated early');

  const legacyDir=path.join(tmp,'pron');fs.mkdirSync(legacyDir);
  fs.writeFileSync(path.join(legacyDir,'pronunciation-cache.json'),JSON.stringify({Reuters:'róiters'}),'utf8');
  const {PronunciationNormalizer,LEARNING_SCHEMA}=require('../src/services/pronunciation');
  const pron=new PronunciationNormalizer({resourcesDir:tmp,dataDir:legacyDir,getSettings:()=>({tts:{pronunciationMaxSeconds:15,pronunciationClaudeVerify:true}})});
  const normalized=pron.basic('Apple TV informó un avance de 25% en YouTube. S/900 millones, US$25 millones, 30 °C y 80 km/h.');
  assert(/ápol te uve/i.test(normalized)&&/25 por ciento/i.test(normalized)&&/yutub/i.test(normalized),'Basic pronunciation rules failed');
  assert(/900 millones de soles/i.test(normalized)&&/25 millones de dólares/i.test(normalized),'Currency pronunciation failed');
  assert(/30 grados Celsius/i.test(normalized)&&/80 kilómetros por hora/i.test(normalized),'Units pronunciation failed');
  const candidates=pron.candidates('Élysée recibió a Donald Trump y Emmanuel Macron.');
  assert(candidates.some(x=>x.term==='Élysée'),'Unicode candidate Élysée missing');
  assert(candidates.some(x=>x.term==='Donald Trump'),'Multiword proper-name candidate missing');
  assert(pron.applyMap('Élysée informó.',{'Élysée':'elisé'}).startsWith('elisé'),'Unicode replacement failed');
  assert(pron.exportLearning().schemaVersion===LEARNING_SCHEMA,'Learning schema export failed');
  assert(pron.exportLearning().entries.some(x=>String(x.term).toLowerCase()==='reuters'),'Legacy pronunciation migration failed');
  const before=pron.status().learningEntries;const imported=pron.importLearning({schemaVersion:2,entries:[{term:'Huawei',pronunciation:'juáwei',needsReplacement:true,source:'claude',confidence:.97}]});
  assert(imported.total===before+1,'Learning import/merge failed');
  const parsed=pron.parseSmartResponse('{"items":[{"term":"Huawei","needs_replacement":true,"pronunciation":"juáwei","confidence":0.9}]}',['Huawei']);
  assert(parsed.Huawei?.to==='juáwei','Smart pronunciation response parse failed');
  const invalid=pron.parseSmartResponse('{"items":[{"term":"Huawei","needs_replacement":true,"pronunciation":"visita https://x.com","confidence":0.9}]}',['Huawei']);
  assert(!invalid.Huawei,'Unsafe pronunciation output was accepted');

  const {AutomationEngine}=require('../src/services/automation');
  const dummySettings={automation:{bufferReady:15,queueMax:30,maxAgeHours:6,avoidRepeats:true},ai:{primary:'claude'},tts:{voice:'ef_dora',speed:1},visual:{pauseSeconds:0},canned:{enabled:true,interval:10,emergency:true,folder:videos,adsFolder:videos,insertAdAfterContent:true}};
  const engine=new AutomationEngine({
    rss:{loadAll:async()=>({items:[],errors:[],feedStatus:[]})},fetchArticle:async()=>({}),providers:{generate:async()=>({result:{title:'x',script:'x'},attempts:[],metrics:{}})},
    kokoro:{generate:async()=>({path:'',url:'',durationSec:1}),cleanupAudio:()=>{}},pronunciation:null,canned:contents,ads,history:{has:()=>false,add:()=>{}},getSettings:()=>dummySettings,getFallbackUrl:()=>'',sendAutomaticOutput:()=>true,isOutputReady:()=>true,controlOutput:()=>{}
  });
  engine.newsEmitted=10;engine.scheduledNewsTotal=10;assert(engine.scheduledProgress(10).due,'Exact scheduled-content multiple not detected');
  engine.lastScheduledCannedAt=10;assert(!engine.scheduledProgress(10).due&&engine.scheduledProgress(10).nextIn===10,'Scheduled slot served state failed');
  engine.scheduledNewsTotal=17;engine.newsEmitted=4;engine.cannedPlayed=2;engine.adsPlayed=2;engine.resetSessionCounters();
  assert(engine.scheduledNewsTotal===17&&engine.newsEmitted===0&&engine.cannedPlayed===0&&engine.adsPlayed===0,'Visible counter reset changed scheduling state');
  const future={link:'https://example.com/future',title:'future',pubDate:new Date(Date.now()+60*60*1000).toISOString()};assert(!engine.candidateFrom([future],dummySettings),'Future-dated news was accepted');

  const preload=fs.readFileSync(path.join('src','preload.js'),'utf8');
  for(const token of ['contextBridge.exposeInMainWorld','downloadLocalModel','downloadPronunciationModel','cannedPickAdsFolder','cannedListAds','exportPronunciationLearning','importPronunciationLearning','clearPronunciationLearning','resetSessionCounters'])assert(preload.includes(token),`Preload bridge missing ${token}`);
  assert(!/document\.|window\.addEventListener|require\(['"]\.\//.test(preload),'Preload contains DOM/local-module wrapper code incompatible with sandbox');

  const main=fs.readFileSync(path.join('src','main.js'),'utf8');
  for(const token of ['sandbox:true',"preload:path.join(__dirname,'preload.js')",'runUiBridgeSelfTest','canned:pickAdsFolder','pronunciation:exportLearning','mediaRole===\'ad\'','scheduledNewsTotal'])assert(main.includes(token),`Main integration missing ${token}`);
  assert(!main.includes("require('./main-v038.js')")&&!main.includes("require('./main-v0310.js')"),'Consolidated main still chains wrappers');

  const control=fs.readFileSync(path.join('src','control.html'),'utf8');
  for(const id of ['voice','ttsPerformanceProfile','processingDetail','sessionNewsEmitted','sessionCannedEmitted','sessionAdsEmitted','resetSessionCounters','adsAfterCanned','pickAdsFolder','adsList','pronunciationClaudeVerify','pronunciationMaxSeconds','exportPronunciationLearning','importPronunciationLearning','clearPronunciationLearning','dateFontFamily'])assert(control.includes(`id="${id}"`),`Control UI missing ${id}`);
  assert(control.includes('Claude Haiku 4.5')&&control.includes('claude-haiku-4-5-20251001')&&control.includes('readonly'),'Claude Haiku 4.5 is not explicit/fixed in UI');

  const renderer=fs.readFileSync(path.join('src','renderer.js'),'utf8');
  for(const token of ['fatalInterface','preview-motion-','applyPreviewMotion','SELF_TEST','claude-haiku-4-5-20251001'])assert(renderer.includes(token),`Renderer reliability/preview feature missing ${token}`);
  const rendererUi=fs.readFileSync(path.join('src','renderer-ui.js'),'utf8');
  for(const token of ['refreshAdsList','refreshSessionCounters','ANUNCIO AL AIRE','pronunciationClaudeVerify','ttsPerformanceProfile'])assert(rendererUi.includes(token),`Renderer UI missing ${token}`);
  const rendererActions=fs.readFileSync(path.join('src','renderer-actions.js'),'utf8');
  for(const token of ['cannedPickAdsFolder','resetSessionCounters','exportPronunciationLearning','importPronunciationLearning','clearPronunciationLearning','if(!SELF_TEST)await loadNews()'])assert(rendererActions.includes(token),`Renderer actions missing ${token}`);
  const css=fs.readFileSync(path.join('src','control.css'),'utf8');for(const token of ['preview-motion-zoom','preview-motion-vertical','preview-motion-horizontal','@keyframes previewZoom'])assert(css.includes(token),`Preview CSS missing ${token}`);

  const outputHtml=fs.readFileSync(path.join('src','output.html'),'utf8');for(const id of ['cannedVideo','cannedBg','music','audio','stage','pubDate','metaRow'])assert(outputHtml.includes(`id="${id}"`),`Output missing ${id}`);
  const outputJs=fs.readFileSync(path.join('src','output.js'),'utf8');for(const token of ['makeStorySnapshot','crossfadeLayers','formatDate','dateFontFamily','loopFadeBusy','motion-vertical','motion-horizontal'])assert(outputJs.includes(token),`Output feature missing ${token}`);

  const settingsSrc=fs.readFileSync(path.join('src','services','settings.js'),'utf8');for(const token of ['pronunciationClaudeVerify','pronunciationMaxSeconds','adsFolder','insertAdAfterContent','settings.json}.tmp'])assert(settingsSrc.includes(token),`Settings hardening missing ${token}`);
  const providersSrc=fs.readFileSync(path.join('src','services','providers.js'),'utf8');for(const token of ['verifyPronunciations','DEFAULT_CLAUDE_MODEL','claude-haiku-4-5-20251001'])assert(providersSrc.includes(token),`Claude pronunciation integration missing ${token}`);
  assert(!providersSrc.includes("model=models.find(x=>/haiku")&&!providersSrc.includes("models.find(x=>/sonnet"),'Claude test still silently switches models');
  const automationSrc=fs.readFileSync(path.join('src','services','automation.js'),'utf8');for(const token of ['scheduledNewsTotal','playAdAfterCanned','outputRetries','Sin noticias nuevas elegibles','PROCESSING_CANCELLED','mediaRole:\'ad\''])assert(automationSrc.includes(token),`Automation feature missing ${token}`);
  const kokoroSrc=fs.readFileSync(path.join('src','services','kokoro.js'),'utf8');for(const token of ['cleanupOldAudio','cleanupAudio','listVoices','Kokoro excedió'])assert(kokoroSrc.includes(token),`Kokoro hardening missing ${token}`);
  const localSrc=fs.readFileSync(path.join('src','services','localRuntime.js'),'utf8');for(const token of ['downloadPromise','MIN_MODEL_BYTES','model-download-error'])assert(localSrc.includes(token),`Local runtime download hardening missing ${token}`);

  const runtimePs=fs.readFileSync(path.join('scripts','prepare-windows-runtime.ps1'),'utf8');assert(runtimePs.includes("$LlamaRelease = 'b10218'"),'llama.cpp runtime is not pinned to b10218');assert(!runtimePs.includes('releases/latest'),'Build still downloads latest llama.cpp dynamically');
  const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));assert(pkg.version==='0.3.11',`Unexpected package version ${pkg.version}`);assert(pkg.main==='src/main.js',`Unexpected package main ${pkg.main}`);

  const py=spawnSync('python',['-m','py_compile',path.join('scripts','tts.py')],{encoding:'utf8'});if(py.error==null)assert(py.status===0,`Python syntax error in tts.py: ${py.stderr}`);
  fs.rmSync(tmp,{recursive:true,force:true});
  console.log('EC 0.3.11 CHECK OK · sintaxis · RSS · Contenidos/Anuncios · programación exacta · contadores independientes · Unicode pronunciación · aprendizaje/migración · bridge sandbox · Kokoro voces · Preview motion · Claude Haiku fijo · runtime llama.cpp fijado');
}catch(e){console.error(e.stack||e);process.exit(1);}
