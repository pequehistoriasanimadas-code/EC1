'use strict';
const fs=require('fs');
const os=require('os');
const path=require('path');
const root=path.resolve(__dirname,'..');
const ok=(v,m)=>{if(!v)throw new Error(m);};
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

const pkg=JSON.parse(read('package.json'));ok(['0.3.19','0.3.20'].includes(pkg.version),'package version debe ser 0.3.19 o posterior compatible');
const docs=read('src/services/documents.js');ok(/version0318Policy[\s\S]*version0319Policy/.test(docs),'0.3.19 debe instalarse después de 0.3.18');ok(/version0319RendererLoader/.test(docs),'falta loader UI 0.3.19');
const policy=read('src/services/version0319Policy.js');for(const token of ['pipelineOverlap','OMITIDA','short-medium-long','worstRealtimeFactor','pronunciationClaudeVerify:false','CPU conservada','IA local redacta la siguiente nota'])ok(policy.includes(token),`falta ${token} en política 0.3.19`);
const ui=read('src/renderer-0319.js');for(const token of ['Ver noticia','Abrir fuente original','OMITIDAS','Aceleración NVIDIA de Kokoro · Opcional','peor caso','Solapamiento activo'])ok(ui.includes(token),`falta ${token} en UI 0.3.19`);
const loader=read('src/services/version0319RendererLoader.js');ok(/renderer-0319\.js/.test(loader)&&/web-contents-created/.test(loader),'renderer 0.3.19 no se carga en control');

require(path.join(root,'src/services/documents.js'));
const {AutomationEngine}=require(path.join(root,'src/services/automation.js'));
const {SettingsStore}=require(path.join(root,'src/services/settings.js'));
const {select0319,BENCHMARK_TEXTS}=require(path.join(root,'src/services/version0319Policy.js'));
ok(Object.keys(BENCHMARK_TEXTS).join(',')==='short,medium,long','benchmark 0.3.19 no usa corto/medio/largo');

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ec-0319-check-'));
try{
  const store=new SettingsStore(temp),s=store.load();s.ai.primary='local';s.tts.acceleration='cuda';global.__ec0318HardwareRecommendation={settingsFile:store.file,acceleration:'cuda',summary:{}};store.save(s);ok(store.load().tts.acceleration==='cpu','IA local principal debe reservar GPU y guardar Kokoro en CPU');delete global.__ec0318HardwareRecommendation;

  const settings={ai:{primary:'local'},tts:{lastAdvancedBenchmark:{realtimeFactor:.82}},automation:{bufferReady:15,updateMinutes:2,maxAgeHours:6,avoidRepeats:true},canned:{enabled:false},visual:{pauseSeconds:0}};
  let rtf=.82,samples=4;const engine=new AutomationEngine({rss:{loadAll:async()=>({items:[],errors:[],feedStatus:[]})},fetchArticle:async()=>({}),providers:{},kokoro:{status:()=>({recentRealtimeFactor:rtf,recentSamples:samples}),cleanupAudio:()=>{}},pronunciation:null,canned:{},ads:{},history:{file:path.join(temp,'history.json'),has:()=>false,add:()=>{}},getSettings:()=>settings,getFallbackUrl:()=>'',sendAutomaticOutput:()=>{throw new Error('OMITIDA nunca debe llegar a Output');},isOutputReady:()=>true,controlOutput:()=>{}});
  engine.queue.push({id:'rss-11',sourceType:'rss',story:{title:'Nota omitida',link:'https://example.com/omitida',description:'x',pubDate:new Date().toISOString()},status:'PROCESANDO',attempts:[{provider:'local'}],stage:'ai'});engine.state();const item=engine.queue[0];engine.markOmitted(item.story,'fuente insuficiente');engine.removeItem(item);ok(engine.queue.includes(item)&&item.status==='OMITIDA','una nota omitida desaparece de la cola');const row=engine.displayQueue(settings).find(x=>x.id==='rss-11');ok(row?.status==='OMITIDA'&&/fuente insuficiente/i.test(row.reason||''),'la cola no muestra motivo de omisión');ok(!engine.readyItems().includes(item),'una omitida se considera lista para Output');ok(engine.snapshot().counts.omitted===1,'snapshot no contabiliza omitidas');

  ok(engine.__ec0319WorkerLimit(settings)===2,'IA local no habilita solapamiento con RTF estable');rtf=1.31;samples=4;ok(engine.__ec0319WorkerLimit(settings)===1,'IA local no vuelve a modo secuencial con RTF alto');

  const chosen=select0319([{id:'fast-hot',safe:true,medianRealtimeFactor:.70,worstRealtimeFactor:1.18,cpuAverage:35},{id:'stable',safe:true,medianRealtimeFactor:.74,worstRealtimeFactor:.94,cpuAverage:24},{id:'stable-heavy',safe:true,medianRealtimeFactor:.72,worstRealtimeFactor:.96,cpuAverage:50}]);ok(chosen?.id==='stable','selección 0.3.19 no prioriza estabilidad y margen de CPU');
  console.log('EC 0.3.19 checks OK · IA local solapada · omitidas visibles · Kokoro 3 longitudes · GPU avanzada/CPU local-first · Ver noticia');
}finally{try{fs.rmSync(temp,{recursive:true,force:true});}catch{}}
