'use strict';
const fs=require('fs'),path=require('path'),os=require('os');
const {app}=require('electron');
const resourcesDir=path.resolve(process.argv[2]||path.join('dist','win-unpacked','resources')),appRoot=path.join(resourcesDir,'app.asar'),assert=(v,m)=>{if(!v)throw new Error(m);};

app.whenReady().then(async()=>{let tmp='';try{
  const required=['src/bootstrap-0332.js','src/services/release0332.js','src/renderer-0332.js','scripts/check-0332.js'];
  for(const rel of required)assert(fs.existsSync(path.join(appRoot,rel)),`Falta en app.asar: ${rel}`);
  const pkg=JSON.parse(fs.readFileSync(path.join(appRoot,'package.json'),'utf8'));
  assert(pkg.version==='0.3.32','Versión empaquetada no es 0.3.32');
  assert(pkg.main==='src/bootstrap-0332.js','Bootstrap 0.3.32 no es entry point');
  const preload=fs.readFileSync(path.join(appRoot,'src','preload.js'),'utf8');
  assert(preload.includes("renderer-0332.js"),'Preload no carga renderer-0332');
  for(const file of ['renderer-ui.js','renderer-patches.js','renderer-0324.js','renderer-0325.js','renderer-0329.js','renderer-0330.js','renderer-0331.js']){
    const src=fs.readFileSync(path.join(appRoot,'src',file),'utf8');
    assert(src.includes("__ecQueueRenderOwner==='0332'"),`${file} no respeta el renderer final 0.3.32`);
  }

  tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gec0332-pack-'));
  const contentDir=path.join(tmp,'contents'),adsDir=path.join(tmp,'ads');fs.mkdirSync(contentDir);fs.mkdirSync(adsDir);
  for(let i=1;i<=6;i++){fs.writeFileSync(path.join(contentDir,`C${i}.mp4`),'x');fs.writeFileSync(path.join(adsDir,`A${i}.mp4`),'x');}
  const {CannedManager}=require(path.join(appRoot,'src','services','canned.js'));
  const {projectFullQueue}=require(path.join(appRoot,'src','services','release0332.js'));
  const engine={scheduledNewsTotal:0,cannedPlayed:0,lastScheduledCannedAt:-1,__ec0330ContentAnchorNews:0,currentKind:'none',canned:new CannedManager(),ads:new CannedManager()};
  const news=Array.from({length:20},(_,i)=>({id:`n${i+1}`,title:`N${i+1}`,status:'LISTA',sourceType:'rss',queueGroup:'effective'}));
  const settings={canned:{enabled:true,interval:5,folder:contentDir,adsFolder:adsDir,insertAdAfterContent:true}};
  const q1=projectFullQueue(engine,settings,news),q2=projectFullQueue(engine,settings,news);
  assert(q1.filter(x=>x.sourceType==='content').length===4,'20 noticias / cada 5 debe proyectar 4 contenidos');
  assert(q1.filter(x=>x.sourceType==='ad').length===4,'20 noticias / cada 5 debe proyectar 4 anuncios');
  const types=q1.map(x=>x.sourceType);
  assert(types.slice(0,7).join(',')==='rss,rss,rss,rss,rss,content,ad','Primer bloque no está después de la quinta noticia');
  assert(q1.filter(x=>x.planned).map(x=>x.title).join('|')===q2.filter(x=>x.planned).map(x=>x.title).join('|'),'Los nombres futuros cambian entre snapshots');

  fs.rmSync(tmp,{recursive:true,force:true});
  console.log('PACKAGED 0.3.32 OK · planificación múltiple + renderer único + nombres estables');
  app.exit(0);
}catch(e){console.error(e.stack||e);try{if(tmp)fs.rmSync(tmp,{recursive:true,force:true});}catch{}app.exit(1);}});
