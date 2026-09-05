'use strict';
const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
let checks=0;const ok=(v,m)=>{checks++;assert.ok(v,m);};const eq=(a,b,m)=>{checks++;assert.deepStrictEqual(a,b,m);};

const {ProfileManager0329,atomicJson,readJson}=require('../src/services/profileManager0329');
const rel=require('../src/services/release0330');
const ed=require('../src/services/editorial0330');
const finalQueue=require('../src/services/release0330Final');

// 1) La optimización física nunca pertenece al perfil.
const legacy={
  optimization0321:{fingerprint:'pc-a',at:'2026-08-30T10:00:00Z'},
  ai:{primary:'local',backup1:'claude',localResourceMode:'tuned',localAutoTuned:true,localTunedConfig:{gpuLayers:48,threads:4},lastLocalBenchmark:{tokensPerSec:100},editorialInstructions:'deportes'},
  tts:{voice:'ef_dora',speed:1.05,resourceMode:'performance',performanceThreads:8,lastBenchmark:{rtf:.6}},
  rssFeeds:[{id:'x',url:'https://example.com'}]
};
const stripped=rel.stripProfilePhysical(legacy);
ok(!('optimization0321'in stripped),'optimization0321 no debe quedar en perfil');
ok(!('localResourceMode'in stripped.ai)&&!('localAutoTuned'in stripped.ai)&&!('localTunedConfig'in stripped.ai)&&!('lastLocalBenchmark'in stripped.ai),'tuning Qwen no debe quedar en perfil');
eq(stripped.ai.primary,'local','la estrategia de proveedor sí pertenece al perfil');
eq(stripped.ai.backup1,'claude','los respaldos sí pertenecen al perfil');
eq(stripped.ai.editorialInstructions,'deportes','las instrucciones editoriales sí pertenecen al perfil');
eq(stripped.tts,{voice:'ef_dora',speed:1.05},'solo voz y velocidad TTS permanecen en perfil');
const physical=rel.physicalFrom(legacy);eq(physical.ai.localTunedConfig.gpuLayers,48,'se extrae el tuning global');eq(physical.tts.performanceThreads,8,'se extrae rendimiento TTS global');
const exported=rel.sanitizeExportPhysical(legacy);ok(!exported.optimization0321&&!exported.ai.localTunedConfig&&!exported.tts.performanceThreads,'el backup no transporta tuning/benchmark físico');

// 2) Migración: gana el tuning más reciente del MISMO hardware, no otro PC.
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gec0330-'));
try{
  const m=new ProfileManager0329(tmp),defaults={ai:{primary:'local',backup1:'none',backup2:'none',localResourceMode:'safe_streaming'},tts:{voice:'ef_dora',speed:1,resourceMode:'safe_streaming'},visual:{queueColors:{}},canned:{},documents:{processed:{}},automation:{},rssFeeds:[]};
  const a=m.create({name:'El Comercio',color:'#F7C600',defaults}),b=m.create({name:'Depor',color:'#22C55E',defaults}),c=m.create({name:'Correo',color:'#EF4444',defaults});
  atomicJson(m.profileSettingsFile(a.id),{ai:{primary:'local',localAutoTuned:true,localTunedConfig:{gpuLayers:28,threads:4},localResourceMode:'tuned'},tts:{voice:'ef_dora',speed:1},optimization0321:{fingerprint:'same-pc',at:'2026-08-20T12:00:00Z',summary:'vieja'}});
  atomicJson(m.profileSettingsFile(b.id),{ai:{primary:'local',localAutoTuned:true,localTunedConfig:{gpuLayers:48,threads:6},localResourceMode:'tuned'},tts:{voice:'ef_dora',speed:1},optimization0321:{fingerprint:'same-pc',at:'2026-09-01T12:00:00Z',summary:'correcta'}});
  atomicJson(m.profileSettingsFile(c.id),{ai:{primary:'local',localAutoTuned:true,localTunedConfig:{gpuLayers:99,threads:8},localResourceMode:'tuned'},tts:{voice:'ef_dora',speed:1},optimization0321:{fingerprint:'other-pc',at:'2026-09-02T12:00:00Z',summary:'otra pc'}});
  const r=rel.migrateOptimizationForFingerprint(m,'same-pc');ok(r.ok&&r.matched&&r.source===b.id,'debe elegir la optimización más reciente de esta PC');
  const g=readJson(m.globalSettingsFile,{});eq(g.optimization0321.summary,'correcta','optimización válida migrada a global');eq(g.ai.localTunedConfig.gpuLayers,48,'configuración Qwen correcta migrada');
  for(const p of [a,b,c]){const raw=readJson(m.profileSettingsFile(p.id),{});ok(!raw.optimization0321&&!raw.ai?.localTunedConfig&&!raw.ai?.localAutoTuned,'todos los perfiles quedan libres de tuning físico');}
  const pa=rel.applyPhysical(m.effectiveSettings(defaults),rel.physicalFrom(g));m.activate(b.id);const pb=rel.applyPhysical(m.effectiveSettings(defaults),rel.physicalFrom(g));m.activate(c.id);const pc=rel.applyPhysical(m.effectiveSettings(defaults),rel.physicalFrom(g));
  eq(pa.ai.localTunedConfig,pb.ai.localTunedConfig,'A y B heredan mismo tuning');eq(pb.ai.localTunedConfig,pc.ai.localTunedConfig,'B y C heredan mismo tuning');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}

// 3) Listas: feriados/horóscopo largos se resumen; una enumeración cruda falla.
const holidays=Array.from({length:12},(_,i)=>`LISTA: ${i+1} de enero - Feriado ${i+1}`).join('\n');
const h=ed.detectListStructure({title:'Lista de feriados del año'},{body:holidays});ok(h.listMode&&h.longList,'feriados extensos deben detectarse como lista larga');
const zodiac='Aries Tauro Géminis Cáncer Leo Virgo Libra Escorpio Sagitario Capricornio Acuario Piscis';const z=ed.detectListStructure({title:'Horóscopo de hoy'},{body:zodiac});ok(z.listMode&&z.longList,'horóscopo completo debe detectarse como lista larga');
let rawRejected=false;try{ed.validateListResult({status:'OK',script:'Esta es la lista: uno; dos; tres; cuatro; cinco; seis; siete; ocho.'},{__ec0330ListMode:true,__ec0330LongList:true});}catch(e){rawRejected=['FORMAT_GARBAGE','TOO_LONG'].includes(e.code);}ok(rawRejected,'lista cruda debe activar reintento editorial');
ok(ed.validateListResult({status:'OK',script:'El calendario concentra varios feriados importantes durante el año. Entre los más próximos destacan las fechas señaladas por la fuente. La relación completa puede consultarse en el medio de origen.'},{__ec0330ListMode:true,__ec0330LongList:true}), 'síntesis periodística debe aceptarse');

// 4) Proyección de cola: la UI sigue el mismo patrón de exclusivas que el consumidor.
const mk=(title,exclusive=false)=>({id:title,sourceType:'rss',status:'LISTA',story:{title},result:{title,isExclusive:exclusive}});
const engine={queue:[mk('E1',true),mk('E2',true),mk('N1'),mk('N2'),mk('N3'),mk('N4')],newsSinceExclusive:0};
const projected=rel.projectedNews(engine,{automation:{exclusiveEveryNews:4}});eq(projected.map(x=>x.title),['N1','N2','N3','E1','N4','E2'],'la cola visual debe proyectar la selección real y espaciar exclusivas cuando hay normales');
const plans=[{title:'Contenido',sourceType:'content',planAfter:2},{title:'Anuncio',sourceType:'ad',planAfter:2}];eq(finalQueue.insertPlanGroup(projected,plans).map(x=>x.title).slice(0,5),['N1','N2','Contenido','Anuncio','N3'],'contenido y anuncio deben mantener su pareja y orden');

// 5) Páginas dinámicas: mismo contenido = misma versión; cambio factual = nueva versión.
const ds={title:'Feriados 2026',link:'https://medio.test/feriados'};ok(rel.dynamicStory(ds),'feriados deben tratarse como página dinámica');const d1=rel.dynamicEventId(ds,{contentFingerprint:'abc123'}),d2=rel.dynamicEventId(ds,{contentFingerprint:'abc123'}),d3=rel.dynamicEventId(ds,{contentFingerprint:'xyz789'});eq(d1,d2,'mismo contenido debe mantener id');ok(d1!==d3,'contenido actualizado debe producir nueva versión');ok(!rel.dynamicStory({title:'Sismos',link:'https://medio.test/lbposting/sismos'}),'liveblog debe conservar su camino eventId especializado');

// 6) Reset de pipeline solo después de quiescencia: limpia tails y flags.
const fake={aiStageTail:Promise.reject(new Error('old')).catch(()=>{}),voiceStageTail:Promise.resolve(1),localHeavyTail:Promise.resolve(2),aiStageBusy:true,voiceStageBusy:true,localHeavyRunning:true,providers:{localRuntime:{generationTail:Promise.resolve(3),generationActive:true}},kokoro:{generationTail:Promise.resolve(4)}};rel.resetPipeline(fake);ok(!fake.aiStageBusy&&!fake.voiceStageBusy&&!fake.localHeavyRunning&&!fake.providers.localRuntime.generationActive,'reset limpia flags físicos');ok(fake.aiStageTail&&fake.voiceStageTail&&fake.providers.localRuntime.generationTail,'reset reconstruye tails');

// 7) Auditoría estática de orden/lifecycle/UI.
const boot=read('src/bootstrap-0330.js'),releaseSrc=read('src/services/release0330.js'),switchSrc=read('src/services/release0330SwitchFinal.js'),queueSrc=read('src/services/release0330Final.js'),renderer=read('src/renderer-0330.js'),css=read('src/control-0330.css'),preload=read('src/preload.js'),pkg=JSON.parse(read('package.json'));
ok(boot.indexOf("editorial0330")<boot.indexOf("bootstrap-0329"),'editorial 0330 debe instalarse antes de que providers desestructure funciones');ok(boot.lastIndexOf('release0330SwitchFinal')>boot.indexOf('release0330Final'),'coordinador de switch final se instala al final');
ok(switchSrc.indexOf('discardPendingDocuments(engine)')<switchSrc.indexOf('quiet(engine,2500)'),'documentos pendientes se descartan antes de esperar quiescencia');ok(switchSrc.includes('quiet(engine,2500)')&&switchSrc.includes('quiet(engine,5500)')&&switchSrc.includes('PROFILE_SWITCH_RESTART_REQUIRED'),'switch hace cierre breve, hard-stop y conserva aviso final de reinicio');
ok(queueSrc.includes("if(this.emissionRunning")&&queueSrc.includes('plannedMediaRows'),'contenido programado no aparece durante mera preparación');ok(releaseSrc.includes("if(!this.emissionRunning)return''"),'contenido/recovery solo puede dispararse durante emisión activa');ok(releaseSrc.includes("this.__ec0330ContentAnchorNews")&&releaseSrc.includes("this.__ec0328AdReservation=null"),'omitir contenido reancla ciclo y elimina anuncio pendiente');
ok(renderer.includes("if(!st?.hasProfiles)location.reload()"),'cancelar primer perfil restaura onboarding');ok(renderer.includes('ec0330-preparing-divider')&&renderer.includes('displayPosition'),'UI separa preparación y usa posiciones efectivas');ok(css.includes('container-type:inline-size')&&css.includes('@container (max-width: 720px)')&&css.includes('@container (max-width: 520px)'),'tipografías responden al ancho real del panel');ok(preload.includes('optimizationMigrateGlobal')&&preload.includes('renderer-0330.js')&&preload.includes('control-0330.css'),'bridge y assets 0330 están cargados');
ok(pkg.version==='0.3.30','package version debe ser 0.3.30');ok(pkg.main==='src/bootstrap-0330.js','main debe apuntar a bootstrap 0.3.30');

console.log(`GEC 0.3.30 audit OK · ${checks} verificaciones`);
