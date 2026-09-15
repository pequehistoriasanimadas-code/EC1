'use strict';
const assert=require('assert');
const {AutomationEngine}=require('../src/services/automation0325');

const wait=ms=>new Promise(r=>setTimeout(r,ms));
const settings={
  rssFeeds:[{id:'feed',enabled:true,url:'https://example.test/rss',accessMode:'auto'}],
  automation:{exclusiveEveryNews:4,exclusiveReserveMax:10,avoidRepeats:false,bufferReady:15,maxAgeHours:24},
  canned:{enabled:false,interval:0,emergency:false,insertAdAfterContent:true,folder:'',adsFolder:''},
  visual:{pauseSeconds:0.001},
  tts:{voice:'test',speed:1},
  ai:{primary:'local'}
};
const history={
  state:{exclusiveHasEmitted:false,newsSinceExclusive:0},
  getAutomationState(){return {...this.state};},
  setAutomationState(v){this.state={...this.state,...v};},
  has(){return false;},
  add(){},
};
let engine;
const played=[];
engine=new AutomationEngine({
  rss:{loadAll:async()=>[]},
  fetchArticle:async()=>({}),
  providers:{},
  kokoro:{cleanupAudio(){}},
  pronunciation:null,
  canned:{},
  ads:{},
  history,
  localRuntime:null,
  getSettings:()=>settings,
  getFallbackUrl:()=>'',isOutputReady:()=>true,
  controlOutput:()=>{},
  sendAutomaticOutput:p=>{played.push(p.title);setTimeout(()=>engine.outputPlayback({source:'automatic',type:'ended'}),1);return true;}
});
function item(title,isExclusive=false){
  return{id:title,sourceType:'rss',status:'LISTA',story:{title,link:'https://example.test/'+title,feedId:'feed',feedName:'Fuente',category:'ACTUALIDAD',pubDate:new Date().toISOString()},result:{title,summary:'',script:'',category:'ACTUALIDAD',isExclusive,accessStatus:isExclusive?'SUBSCRIBER_ONLY':'PUBLIC'},audio:{url:'file:///fake.wav',durationSec:1},metrics:{audioDurationSec:1},isExclusive};
}
engine.queue=[
  item('E1',true),item('E2',true),item('E3',true),item('E4',true),
  ...Array.from({length:12},(_,i)=>item('P'+(i+1),false))
];
const samples=[];
engine.on('state',s=>samples.push(Number(s?.session?.newsEmitted)||0));

(async()=>{
  engine.startEmission();
  const deadline=Date.now()+8000;
  while(engine.newsEmitted<16&&Date.now()<deadline)await wait(20);
  engine.stopEmission();
  assert.strictEqual(engine.newsEmitted,16,'sesión larga debe contabilizar todas las noticias terminadas');
  assert.strictEqual(engine.getState().session.newsEmitted,16,'snapshot debe conservar el contador real');
  assert.deepStrictEqual(played,[
    'P1','P2','P3','E1',
    'P4','P5','P6','E2',
    'P7','P8','P9','E3',
    'P10','P11','P12','E4'
  ],'emisión 1 cada 4 debe mantener P-P-P-E durante una sesión continua');
  const increments=[...new Set(samples.filter(n=>n>0))];
  assert.strictEqual(increments.at(-1),16,'eventos de estado deben propagar el contador hasta 16');
  for(let i=1;i<increments.length;i++)assert(increments[i]>=increments[i-1],'contador visible no puede retroceder');
  console.log('check-v2lab-long-session: OK · 16 emisiones · contador vivo · P-P-P-E sostenido');
})().catch(e=>{console.error(e.stack||e);process.exit(1);});
