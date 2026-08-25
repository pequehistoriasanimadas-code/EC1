'use strict';
const fs=require('fs');
const path=require('path');
const os=require('os');
const cp=require('child_process');
const {app}=require('electron');

const resourcesDir=path.resolve(process.argv[2]||path.join('dist','win-unpacked','resources'));
const appRoot=path.join(resourcesDir,'app.asar');
const tempDir=path.join(os.tmpdir(),`ec-0324-packaged-${process.pid}`);
const assert=(v,m)=>{if(!v)throw new Error(m);};

app.whenReady().then(async()=>{
  try{
    fs.mkdirSync(tempDir,{recursive:true});
    for(const rel of ['src/renderer-0323.js','src/renderer-0324.js','src/renderer-final-0324.js','src/renderer-image-hydration-0324.js','src/renderer-local-model-fix-0324.js','src/output-0324.js','src/control-0324.css','src/output-0324.css','src/services/automation0324.js','src/services/articleMetadata0324.js','src/services/storyKey0324.js','src/services/accessPolicy0324.js','src/services/customVoices.js','src/services/fonts.js','src/voice_tools.py'])assert(fs.existsSync(path.join(appRoot,rel)),`Falta en app.asar: ${rel}`);
    const externalVoiceTool=path.join(resourcesDir,'runtime','kokoro','voice_tools.py'),officialVoices=path.join(resourcesDir,'runtime','kokoro','voices-v1.0.bin'),python=path.join(resourcesDir,'runtime','python','python.exe');
    for(const p of [externalVoiceTool,officialVoices,python])assert(fs.existsSync(p),`Runtime 0.3.24 ausente: ${p}`);

    const {parseHtmlGeneric}=require(path.join(appRoot,'src','services','rss.js'));
    const web=parseHtmlGeneric('<main><article><h2><a href="/politica/a">Titular político suficientemente largo para detectar</a></h2></article><article><h2><a href="/economia/b">Segundo titular económico suficientemente largo para detectar</a></h2></article></main>',{id:'w',name:'Medio',url:'https://medio.test/seccion'},'https://medio.test/seccion');
    assert(web.length===2,'Parser WEB empaquetado no detectó política/economía');

    const {parseArticleHtml}=require(path.join(appRoot,'src','services','article.js'));
    const live=parseArticleHtml('<body class="liveblog"><div class="liveblog"><article class="update"><time datetime="2026-08-25T12:30:00-05:00"></time><h3>Sismo en Arequipa, Perú</h3><p>IGP/CENSIS/RS 2026-0586. Magnitud: 4.1. Profundidad: 28 km. Hora local: 2026-08-25 12:30:00.</p></article></div></body>','https://medio.test/temblor-lbposting/');
    assert(live.liveEvent?.id==='report:IGP/CENSIS/RS 2026-0586','Liveblog empaquetado no creó ID estable por reporte');

    const {parseArticleMetadata}=require(path.join(appRoot,'src','services','articleMetadata0324.js')),meta=parseArticleMetadata('<meta property="article:published_time" content="2026-08-25T10:00:00-05:00"><body>Solo para suscriptores</body>');assert(meta.pubDate&&meta.strongLock,'Metadata empaquetada no resolvió fecha/candado');
    const {storyKey,baseStoryKey}=require(path.join(appRoot,'src','services','storyKey0324.js')),eventKey=storyKey('https://www.elcomercio.pe/nota/?utm_source=x#ec-event=A');assert(eventKey.includes('#ec-event=A')&&!baseStoryKey(eventKey).includes('#ec-event='),'StoryKey empaquetado no conserva/separa eventos liveblog');
    const {chooseNewsItem,buildExclusivePublicArticle}=require(path.join(appRoot,'src','services','automation0324.js')),exclusive={status:'LISTA',result:{isExclusive:true}},publicItem={status:'LISTA',result:{isExclusive:false}};assert(chooseNewsItem([exclusive,publicItem],4,true,0)===publicItem,'Scheduler exclusivo empaquetado no respeta separación');assert(!buildExclusivePublicArticle({description:'Vista pública suficiente.'},{description:'Bajada pública adicional.',body:'SECRETO'}).body.includes('SECRETO'),'Fuente exclusiva empaquetada expuso cuerpo protegido');

    const {SettingsStore}=require(path.join(appRoot,'src','services','settings.js')),settingsDir=path.join(tempDir,'settings');fs.mkdirSync(settingsDir,{recursive:true});fs.writeFileSync(path.join(settingsDir,'settings.json'),JSON.stringify({visual:{output:{transitionEnabled:false,transitionType:'fade'}}}),'utf8');const migrated=new SettingsStore(settingsDir).load();assert(migrated.visual.output.transitionType==='none'&&migrated.visual.output.transitionEnabled===false,'Migración empaquetada reactivó un fundido desactivado en 0.3.23');

    const {FontManager}=require(path.join(appRoot,'src','services','fonts.js')),fontManager=new FontManager(path.join(tempDir,'font-data')),fonts=await fontManager.list(true);assert(Array.isArray(fonts.installed)&&fonts.installed.length>0,'No se pudieron enumerar fuentes de Windows en el paquete');

    const manifest=path.join(tempDir,'empty-voices.json'),merged=path.join(tempDir,'voices-test.bin');fs.writeFileSync(manifest,'[]','utf8');const proc=cp.spawnSync(python,[externalVoiceTool,'merge','--official',officialVoices,'--manifest',manifest,'--output',merged],{encoding:'utf8',windowsHide:true,timeout:60000,env:{...process.env,PYTHONNOUSERSITE:'1',PYTHONUTF8:'1'}});assert(proc.status===0,`Conversor de voces empaquetado falló: ${proc.stderr||proc.stdout}`);assert(fs.existsSync(merged)&&fs.statSync(merged).size>1024*1024,'El conversor no produjo un archivo de voces válido');

    const renderer=fs.readFileSync(path.join(appRoot,'src','renderer-0324.js'),'utf8'),finalUi=fs.readFileSync(path.join(appRoot,'src','renderer-final-0324.js'),'utf8'),newsUi=fs.readFileSync(path.join(appRoot,'src','renderer-image-hydration-0324.js'),'utf8'),pronUi=fs.readFileSync(path.join(appRoot,'src','renderer-0323.js'),'utf8'),localUi=fs.readFileSync(path.join(appRoot,'src','renderer-local-model-fix-0324.js'),'utf8'),bootstrap=fs.readFileSync(path.join(appRoot,'src','bootstrap-0324.js'),'utf8'),output=fs.readFileSync(path.join(appRoot,'src','output-0324.js'),'utf8');
    assert(renderer.includes('pronDownloadBusy0324')&&renderer.includes('customVoiceManager')&&renderer.includes('fmtDuration(x.durationSec)'),'Parches de UI 0.3.24 no llegaron al paquete');assert(finalUi.includes('exclusiveEveryNews')&&finalUi.includes('queueColorExclusive'),'Controles finales de exclusivos no llegaron al paquete');assert(newsUi.includes('newsStatuses')&&newsUi.includes('Buscar por titular o bajada'),'Sincronización Noticias/Automático no llegó al paquete');assert(pronUi.includes('Guardar como manual')&&pronUi.includes('ec0323ShowNoChange'),'Gestor compacto de pronunciación no llegó al paquete');assert(localUi.includes('localModelDiagnostic0324')&&bootstrap.includes('modelState'),'Diagnóstico local verificado no llegó al paquete');assert(output.includes('exclusiveBadge'),'Output exclusivo 0.3.24 no llegó al paquete');

    fs.rmSync(tempDir,{recursive:true,force:true});console.log(`PACKAGED 0.3.24 OK · WEB · liveblog/reporte · fechas/exclusivos · News sync · pronunciación · fuentes Windows=${fonts.installed.length} · voice tools`);app.exit(0);
  }catch(e){console.error(e.stack||e);try{fs.rmSync(tempDir,{recursive:true,force:true});}catch{}app.exit(1);}
});
