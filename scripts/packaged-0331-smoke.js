'use strict';
const fs=require('fs'),path=require('path'),os=require('os');
const {app}=require('electron');
const resourcesDir=path.resolve(process.argv[2]||path.join('dist','win-unpacked','resources')),appRoot=path.join(resourcesDir,'app.asar'),assert=(v,m)=>{if(!v)throw new Error(m);};
app.whenReady().then(async()=>{let tmp='';try{
  const required=['src/bootstrap-0331.js','src/services/release0331.js','src/renderer-0331.js','src/control-0331.css','src/output-0331.js','src/output-0331.css','scripts/check-0331.js'];for(const rel of required)assert(fs.existsSync(path.join(appRoot,rel)),`Falta en app.asar: ${rel}`);
  const pkg=JSON.parse(fs.readFileSync(path.join(appRoot,'package.json'),'utf8'));assert(pkg.version==='0.3.31','Versión empaquetada no es 0.3.31');assert(pkg.main==='src/bootstrap-0331.js','Bootstrap 0.3.31 no es entry point');
  const release=require(path.join(appRoot,'src','services','release0331.js'));
  const settings={automation:{exclusiveEveryNews:4},canned:{enabled:true,insertAdAfterContent:true}};
  const e={exclusiveHasEmitted:true,newsSinceExclusive:0,queue:[
    {id:'e1',sourceType:'rss',status:'LISTA',story:{title:'E1'},result:{title:'E1',isExclusive:true,accessStatus:'SUBSCRIBER_ONLY'}},
    {id:'e2',sourceType:'rss',status:'LISTA',story:{title:'E2'},result:{title:'E2',isExclusive:true,accessStatus:'SUBSCRIBER_ONLY'}},
    {id:'n1',sourceType:'rss',status:'LISTA',story:{title:'N1'},result:{title:'N1'}},
    {id:'n2',sourceType:'rss',status:'LISTA',story:{title:'N2'},result:{title:'N2'}},
    {id:'n3',sourceType:'rss',status:'LISTA',story:{title:'N3'},result:{title:'N3'}}
  ]};
  const projected=release.strictProjected(e,settings);assert(projected.slice(0,4).map(x=>x.title).join(',')==='N1,N2,N3,E1','La separación estricta 1 cada 4 no se respeta');assert(projected[4].exclusiveBlocked===true,'La exclusiva sin separación suficiente debe quedar en espera');
  assert(release.isExclusive({accessStatus:'SUBSCRIBER_ONLY'}),'SUBSCRIBER_ONLY debe conservar identidad exclusiva');
  tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gec0331-pack-'));const contentDir=path.join(tmp,'contents'),adsDir=path.join(tmp,'ads');fs.mkdirSync(contentDir);fs.mkdirSync(adsDir);fs.writeFileSync(path.join(contentDir,'Contenido A.mp4'),'x');fs.writeFileSync(path.join(adsDir,'ANUNCIO FIJO.mp4'),'x');const {CannedManager}=require(path.join(appRoot,'src','services','canned.js'));const engine={scheduledNewsTotal:5,canned:new CannedManager(),ads:new CannedManager(),__ec0331ManualContent:{path:path.join(contentDir,'Contenido A.mp4'),name:'Contenido A.mp4'},__ec0331MediaPlan:null};const plan1=release.ensurePlan(engine,{canned:{folder:contentDir,adsFolder:adsDir,insertAdAfterContent:true}},'manual-specific'),plan2=release.ensurePlan(engine,{canned:{folder:contentDir,adsFolder:adsDir,insertAdAfterContent:true}},'manual-specific');assert(plan1?.content?.name==='Contenido A.mp4','No se reservó el contenido manual exacto');assert(plan1?.ad?.name==='ANUNCIO FIJO.mp4','No se resolvió el anuncio programado real');assert(plan1.ad.path===plan2.ad.path,'El anuncio cambió al refrescar el plan');
  fs.rmSync(tmp,{recursive:true,force:true});console.log('PACKAGED 0.3.31 AUDIT OK · exclusivas estrictas · contenido exacto · anuncio bloqueado · assets standby');app.exit(0);
}catch(e){console.error(e.stack||e);try{if(tmp)fs.rmSync(tmp,{recursive:true,force:true});}catch{}app.exit(1);}});
