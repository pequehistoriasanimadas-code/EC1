'use strict';
const fs=require('fs');
const os=require('os');
const path=require('path');
const root=path.resolve(__dirname,'..');
const ok=(v,m)=>{if(!v)throw new Error(m);};
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

const pkg=JSON.parse(read('package.json'));ok(pkg.version==='0.3.20','package version debe ser 0.3.20');
const preload=read('src/preload.js');ok(/benchmarkLocalAI/.test(preload)&&/local:benchmark/.test(preload),'preload no expone el optimizador de IA local');
const loader=read('src/services/version0319RendererLoader.js');ok(/version0320Policy/.test(loader)&&/renderer-0320\.js/.test(loader),'0.3.20 no se carga después de 0.3.19');
const localPolicy=read('src/services/version0320LocalPolicy.js');for(const token of ['gpu-full-balanced','gpu-full-fast','BENCHMARK_CASES','short','medium','long','overlapSafe','voiceRtf','tokensPerSec','promptTokensPerSec','gpuLayers:99','ctx:4096'])ok(localPolicy.includes(token),`falta ${token} en optimizador Qwen 0.3.20`);
const policy=read('src/services/version0320Policy.js');for(const token of ['localAutoTuned','localTunedConfig','SOURCE_INSUFFICIENT','maxAttempts=pIndex===0?2:1','failureReason','UNSUPPORTED_NUMBER','benchmarkLocalAI'])ok(policy.includes(token),`falta ${token} en política 0.3.20`);
const ui=read('src/renderer-0320.js');for(const token of ['Optimizar IA local','En espera de IA local','Generando texto con IA local','PIPELINE LOCAL · SOLAPADO','Cuello de botella','Optimizar motor de voz','Ver detalles técnicos'])ok(ui.includes(token),`falta ${token} en UI 0.3.20`);

require(path.join(root,'src/services/version0319RendererLoader.js'));
const {Providers}=require(path.join(root,'src/services/providers.js'));
const {SettingsStore}=require(path.join(root,'src/services/settings.js'));
const {AutomationEngine}=require(path.join(root,'src/services/automation.js'));
const {sanitizeTunedConfig,BENCHMARK_CASES}=require(path.join(root,'src/services/version0320LocalPolicy.js'));
ok(BENCHMARK_CASES.map(x=>x.id).join(',')==='short,medium,long','Qwen no prueba las tres longitudes');
const tune=sanitizeTunedConfig({ctx:4096,gpuLayers:99,batch:512,ubatch:256,threads:6});ok(tune.ctx===4096&&tune.gpuLayers===99&&tune.parallel===1,'configuración Qwen optimizada no conserva límites esperados');

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ec-0320-check-'));
(async()=>{try{
  const store=new SettingsStore(temp),s=store.load();s.ai.localAutoTuned=true;s.ai.localTunedConfig={ctx:4096,gpuLayers:48,batch:384,ubatch:192,threads:4,label:'test'};s.ai.localResourceMode='tuned';store.save(s);const loaded=store.load();ok(loaded.ai.localAutoTuned===true&&loaded.ai.localResourceMode==='tuned'&&loaded.ai.localTunedConfig.gpuLayers===48,'ajuste Qwen no persiste');

  const makeBuilt=()=>({prompt:'PROMPT',sourceText:'Fuente suficientemente extensa sin cifras.',targetSeconds:30,inputChars:100,promptTokens:100,sourceBudgetChars:4000});
  const valid={status:'OK',sourceQuality:'COMPLETA',title:'Autoridades informan nuevas medidas para la jornada',category:'ACTUALIDAD',summary:'La información oficial detalla cambios operativos y próximos pasos sin añadir datos externos.',script:'Las autoridades informaron nuevas medidas para la jornada. El anuncio explica los principales cambios operativos y precisa que la implementación será progresiva. Los responsables señalaron que el seguimiento continuará durante los próximos días y que cualquier actualización será comunicada por los canales oficiales. La información disponible permite resumir el hecho sin incorporar cifras, fechas o afirmaciones que no estén presentes en la fuente original.'};
  const fake=Object.create(Providers.prototype);fake.cooldownUntil={};fake.setCooldown=()=>{};let localCalls=0;fake.callProvider=async provider=>{if(provider==='local'){localCalls++;const e=new Error('Cifra no respaldada');e.code='UNSUPPORTED_NUMBER';throw e;}return{model:'claude-test',result:{...valid},metrics:{elapsedMs:10}};};
  const out=await fake.generateBuilt(makeBuilt(),{ai:{}},['local','claude']);ok(out.provider==='claude','Claude no entra como respaldo después de dos fallos de Qwen');ok(localCalls===2,'Qwen principal no usa exactamente dos intentos');ok(out.attempts.length===3&&out.attempts[2].provider==='claude','historial de intentos no conserva el fallback');

  const fake2=Object.create(Providers.prototype);fake2.cooldownUntil={};fake2.setCooldown=()=>{};fake2.callProvider=async provider=>provider==='local'?{model:'local',result:{status:'FUENTE_INSUFICIENTE',sourceQuality:'PARCIAL',title:'',summary:'',script:'',category:'ACTUALIDAD'},metrics:{elapsedMs:5}}:{model:'claude',result:{...valid},metrics:{elapsedMs:6}};const rescued=await fake2.generateBuilt(makeBuilt(),{ai:{}},['local','claude']);ok(rescued.provider==='claude'&&rescued.attempts.some(x=>x.code==='SOURCE_INSUFFICIENT'),'Claude no verifica una fuente que Qwen marcó insuficiente');

  const settings={ai:{primary:'local'},tts:{lastAdvancedBenchmark:{realtimeFactor:.7}},automation:{bufferReady:15},canned:{enabled:false},visual:{}};const engine=new AutomationEngine({rss:{},fetchArticle:null,providers:null,kokoro:{status:()=>({recentRealtimeFactor:.7,recentSamples:4})},pronunciation:null,canned:{},ads:{},history:{file:path.join(temp,'history.json'),add:()=>{},has:()=>false},getSettings:()=>settings,getFallbackUrl:()=>'',sendAutomaticOutput:()=>true,isOutputReady:()=>true,controlOutput:()=>{}});const story={title:'Sismo en Perú',link:'https://example.com/sismo',description:'x',pubDate:new Date().toISOString()};const item={id:'x',sourceType:'rss',story,status:'PROCESANDO',stage:'ai',attempts:[]};engine.queue.push(item);const err=new Error('falló');err.details=[{provider:'local',attempt:1,code:'UNSUPPORTED_NUMBER',message:'Cifra no respaldada'},{provider:'local',attempt:2,code:'UNSUPPORTED_NUMBER',message:'Cifra no respaldada'},{provider:'claude',attempt:1,code:'BAD_JSON',message:'JSON inválido'}];ok(engine.isEditorialFailure(err),'fallo editorial no reconocido');engine.markOmitted(story,'generación inválida tras 2 intentos');engine.removeItem(item);const row=engine.displayQueue(settings).find(x=>x.id==='x');ok(row?.status==='OMITIDA'&&/Qwen local: cifra no respaldada/.test(row.reason||'')&&/Claude: JSON inválido/.test(row.reason||''),'motivo exacto de omisión no queda visible');ok(row.attempts?.length===3,'detalle técnico de intentos se pierde en omitida');

  console.log('EC 0.3.20 checks OK · Qwen autotune · 1 Qwen + 1 Kokoro · fallback real · omitidas explicadas · pipeline visible');
}finally{try{fs.rmSync(temp,{recursive:true,force:true});}catch{}}})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});

// Validación específica de la build Windows 0.3.20.
