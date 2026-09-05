'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const {projectFullQueue}=require('../src/services/release0332');

function manager(names){
  const files=names.map((name,i)=>({name,path:`C:/media/${name}`,durationSec:60+i}));
  return{bag:[...files],list:()=>({ok:true,files:[...files]}),ensureBag(){return{ok:true,files:[...files]};}};
}
function engine(newsCount=15){
  const q=Array.from({length:newsCount},(_,i)=>({id:`n${i+1}`,title:`Noticia ${i+1}`,status:'LISTA',sourceType:'rss',queueGroup:'effective',displayPosition:i+1}));
  return{queue:q,scheduledNewsTotal:0,cannedPlayed:0,lastScheduledCannedAt:-1,__ec0330ContentAnchorNews:0,currentKind:'none',canned:manager(['c1.mp4','c2.mp4','c3.mp4','c4.mp4','c5.mp4','c6.mp4']),ads:manager(['a1.mp4','a2.mp4','a3.mp4','a4.mp4','a5.mp4','a6.mp4'])};
}
const settings={canned:{enabled:true,interval:5,folder:'C:/media',adsFolder:'C:/ads',insertAdAfterContent:true}};
{
  const e=engine(15),out=projectFullQueue(e,settings,e.queue);
  assert.deepStrictEqual(out.map(x=>x.sourceType),['rss','rss','rss','rss','rss','content','ad','rss','rss','rss','rss','rss','content','ad','rss','rss','rss','rss','rss','content','ad']);
  assert.strictEqual(out.filter(x=>x.sourceType==='content').length,3);
  assert.strictEqual(out.filter(x=>x.sourceType==='ad').length,3);
  assert.deepStrictEqual(out.filter(x=>x.sourceType==='content').map(x=>x.title),['c1.mp4','c2.mp4','c3.mp4']);
  assert.deepStrictEqual(out.filter(x=>x.sourceType==='ad').map(x=>x.title),['a1.mp4','a2.mp4','a3.mp4']);
  assert.deepStrictEqual(out.filter(x=>x.displayPosition>0).map(x=>x.displayPosition),Array.from({length:21},(_,i)=>i+1));
}
{
  const e=engine(12);e.scheduledNewsTotal=3;e.__ec0330ContentAnchorNews=0;
  const out=projectFullQueue(e,settings,e.queue),contentIndexes=out.map((x,i)=>x.sourceType==='content'?i:-1).filter(i=>i>=0);
  assert.deepStrictEqual(contentIndexes,[2,9,16],'con progreso 3/5 el primer contenido debe ir tras 2 noticias y luego cada 5');
}
{
  const e=engine(10);e.queue[0].status='AL AIRE';
  const out=projectFullQueue(e,settings,e.queue);
  assert.strictEqual(out.findIndex(x=>x.sourceType==='content'),5,'la noticia al aire debe contar para el bloque de 5');
}
{
  const e=engine(15);const first=projectFullQueue(e,settings,e.queue).filter(x=>x.planned).map(x=>x.title);const second=projectFullQueue(e,settings,e.queue).filter(x=>x.planned).map(x=>x.title);
  assert.deepStrictEqual(second,first,'los nombres planificados deben permanecer estables entre snapshots');
}
{
  const e=engine(6);e.queue[1].isExclusive=true;e.queue[1].accessStatus='SUBSCRIBER_ONLY';
  const out=projectFullQueue(e,settings,e.queue);assert.strictEqual(out.find(x=>x.id==='n2').isExclusive,true,'la proyección no debe perder EXCLUSIVO');
}
for(const file of ['renderer-ui.js','renderer-patches.js','renderer-0324.js','renderer-0325.js','renderer-0329.js','renderer-0330.js','renderer-0331.js']){
  const src=fs.readFileSync(path.join(__dirname,'..','src',file),'utf8');
  assert(src.includes("__ecQueueRenderOwner==='0332'"),`${file} debe respetar el propietario final del render`);
}
const finalRenderer=fs.readFileSync(path.join(__dirname,'..','src','renderer-0332.js'),'utf8');
assert(finalRenderer.includes("window.__ecQueueRenderOwner='0332'"));
assert(!/setTimeout\(\(\)=>renderQueueDirect\(s\),80\)/.test(finalRenderer));

const output0331=fs.readFileSync(path.join(__dirname,'..','src','output-0331.js'),'utf8');
const policy0328=fs.readFileSync(path.join(__dirname,'..','src','services','version0328Policy.js'),'utf8');
assert(output0331.includes("outputMode==='standby'"),'la recuperación de música debe quedar limitada al standby real');
assert(output0331.includes("a==='skip'"),'Output debe reconocer Siguiente sin activar standby');
assert(output0331.includes('block-standby-recovery'),'contenido/anuncio deben bloquear reintentos de música de standby');
assert(policy0328.includes("this.controlOutput('skip')"),'Siguiente no debe usar stop porque stop activa el standby y su música');
assert(policy0328.includes('__ec0328LastSkipKey')&&policy0328.includes('__ec0328LastSkipAt'),'Siguiente debe ignorar pulsaciones duplicadas sobre el mismo elemento');
console.log('0.3.32 queue planner + stable renderer + safe skip audio checks OK');
