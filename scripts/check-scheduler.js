'use strict';
const assert=require('assert');
const {AutomationEngine}=require('../src/services/automation');
const {installBroadcastSchedulerPolicy,recoveryTargetSeconds}=require('../src/services/broadcastSchedulerPolicy');
const {bestDurationIndex}=require('../src/services/canned');

installBroadcastSchedulerPolicy();

assert.strictEqual(bestDurationIndex([{durationSec:60},{durationSec:180},{durationSec:300}],150),1,'Debe escoger el video más corto que cubra la recuperación');
assert.strictEqual(bestDurationIndex([{durationSec:60},{durationSec:180},{durationSec:300}],400),2,'Si ninguno alcanza, debe escoger el más largo');
assert.strictEqual(bestDurationIndex([{durationSec:60},{durationSec:180},{durationSec:300}],Infinity),2,'Emergencia debe preferir el más largo');

const settings={
  automation:{generatedEveryRss:5,targetAutonomyMin:15,bufferReady:15,recoveryAutonomyMin:8,criticalAutonomyMin:3},
  canned:{enabled:false,interval:10,adaptiveDuration:true,insertAdAfterContent:true,adsFolder:''},
  visual:{pauseSeconds:0},documents:{}
};
const engine=new AutomationEngine({
  rss:{},fetchArticle:async()=>({}),providers:{},kokoro:{cleanupAudio(){}},pronunciation:null,canned:null,ads:null,
  history:{add(){},has(){return false;}},getSettings:()=>settings,getFallbackUrl:()=>'',sendAutomaticOutput:()=>true,isOutputReady:()=>true,controlOutput(){}
});
engine.on('state',()=>{});
const item=(id,type)=>({id,sourceType:type,story:{title:id,link:`https://x/${id}`},result:{title:id,category:'ACTUALIDAD',summary:'',script:''},status:'LISTA',metrics:{elapsedMs:60000,pronunciationElapsedMs:10000,ttsElapsedMs:70000,audioDurationSec:45},audio:{durationSec:45},stage:'ready'});
engine.queue=[item('r1','rss'),item('r2','rss'),item('r3','rss'),item('r4','rss'),item('r5','rss'),item('g1','generated'),item('g2','generated')];
engine.state();
assert(engine.queue.every(x=>Number(x.sessionSeq)>0),'Cada noticia debe recibir un número fijo de sesión');
const seqBefore=engine.queue.map(x=>x.sessionSeq);
for(let i=0;i<5;i++)engine.addEmissionHistory('rss',`rss ${i}`,'EMITIDA',{durationSec:45});
engine.state();
assert.strictEqual(engine.queue[0].sourceType,'generated','Después de 5 RSS una Nota Generada lista debe pasar al siguiente turno');
assert.deepStrictEqual([...engine.queue].sort((a,b)=>a.sessionSeq-b.sessionSeq).map(x=>x.sessionSeq),[...seqBefore].sort((a,b)=>a-b),'Reordenar no debe cambiar los números fijos');
engine.addEmissionHistory('generated','g1','EMITIDA',{durationSec:45});
engine.state();
assert.strictEqual(engine.queue[0].sourceType,'rss','Después de una Nota Generada debe volver a priorizar RSS');
const visible=engine.displayQueue(settings);assert(!visible.some(x=>x.history||x.status==='EMITIDA'),'La cola activa no debe mezclar historial emitido');
settings.canned.enabled=true;settings.canned.interval=5;const recovery=recoveryTargetSeconds(engine,settings,'scheduled');assert(Number.isFinite(recovery)&&recovery>=30,'La recuperación programada debe calcular una duración válida');
console.log(`SCHEDULER CHECK OK · recuperación objetivo ${Math.round(recovery)} s`);
