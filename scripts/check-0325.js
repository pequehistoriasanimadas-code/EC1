'use strict';
const assert=require('assert');
const {AutomationEngine}=require('../src/services/automation0325');
const {mergeSourceItems}=require('../src/services/sourceMerge0325');
function makeEngine(){const e=Object.create(AutomationEngine.prototype);Object.assign(e,{queue:[],selectionRecent:[],urlFailures:new Map(),feedFailures:new Map(),liveBaseCooldown:new Map(),omittedSources:new Map(),queuedUrls:new Set(),newsSinceExclusive:0,exclusiveHasEmitted:false,newsStatuses:new Map(),emissionHistory:[],currentKind:'none',currentCanned:null,history:{has:()=>false},getSettings:()=>({automation:{exclusiveEveryNews:4,maxAgeHours:6,avoidRepeats:true},rssFeeds:[],canned:{enabled:false}}),isFeedActive:()=>true,addEmissionHistory:()=>{}});return e;}
const now=new Date().toISOString(),ago=min=>new Date(Date.now()-min*60000).toISOString();
{
 const link='https://example.com/noticia/?utm_source=x';const merged=mergeSourceItems([[{link,title:'Publica',feedId:'latest',feedName:'Últimas',feedAccessMode:'auto',pubDate:now}],[{link:'https://example.com/noticia/',title:'Exclusiva',feedId:'premium',feedName:'Suscriptores',feedAccessMode:'exclusive',pubDate:ago(5)}]],v=>{const u=new URL(v);u.search='';return u.href;});assert.equal(merged.length,1);assert.equal(merged[0].feedAccessMode,'exclusive');assert.equal(merged[0].feedId,'premium');assert.equal(merged[0].sourceFeeds.length,2);
}
{
 const e=makeEngine();e.selectionRecent=['a','a','a'];const s=e.getSettings(),picked=e.candidateFrom([{link:'https://a.test/1',feedId:'a',pubDate:now},{link:'https://b.test/1',feedId:'b',pubDate:ago(3)}],s);assert.equal(picked.feedId,'b');
}
{
 const e=makeEngine();const s={...e.getSettings(),rssFeeds:[{id:'x',enabled:true,url:'https://x.test',accessMode:'exclusive'},{id:'p',enabled:true,url:'https://p.test',accessMode:'auto'}]};e.getSettings=()=>s;const picked=e.candidateFrom([{link:'https://p.test/1',feedId:'p',pubDate:now},{link:'https://x.test/1',feedId:'x',feedAccessMode:'exclusive',pubDate:ago(25)}],s);assert.equal(picked.feedId,'x');assert.equal(picked.__ecSelectionReason,'reserva exclusiva');
}
{
 const e=makeEngine(),s=e.getSettings(),pub={status:'LISTA',story:{title:'P'},result:{isExclusive:false}},ex={status:'LISTA',story:{title:'E'},result:{isExclusive:true}};e.newsSinceExclusive=1;assert.equal(e.chooseReadyItem([ex,pub],s),pub);e.newsSinceExclusive=3;assert.equal(e.chooseReadyItem([pub,ex],s),ex);e.newsSinceExclusive=1;assert.equal(e.chooseReadyItem([ex],s),ex);
}
{
 const e=makeEngine(),a={link:'https://example.com/n',title:'A',description:'uno',pubDate:now},b={link:'https://example.com/n',title:'B',description:'dos',pubDate:ago(1)};e.omittedSources.set(e.omittedKey(a),Date.now());assert.equal(e.omittedKey(a),e.omittedKey(b));assert.equal(e.isOmittedBlocked(b),true);
}
{
 const e=makeEngine();e.plannedMediaRows=()=>[];e.queue=[{id:'h',sourceType:'rss',story:{link:'https://x.test/h',title:'H',feedId:'x'},status:'PROCESANDO',stage:'article',uiVisible:false},{id:'v',sourceType:'rss',story:{link:'https://x.test/v',title:'V',feedId:'x',feedName:'X',category:'Actualidad'},status:'PROCESANDO',stage:'ai',uiVisible:true}];const rows=e.displayQueue({automation:{},canned:{enabled:false},rssFeeds:[]});assert(!rows.some(x=>x.id==='h'));assert(rows.some(x=>x.id==='v'));
}
(async()=>{const e=makeEngine();e.aiStageTail=Promise.resolve();e.voiceStageTail=Promise.resolve();e.aiStageBusy=false;e.voiceStageBusy=false;e.localHeavyRunning=false;e.state=()=>{};let ai=0,voice=0,maxAI=0,maxVoice=0;const job=(kind,ms)=>e.runStage(kind,async()=>{if(kind==='ai'){ai++;maxAI=Math.max(maxAI,ai);}else{voice++;maxVoice=Math.max(maxVoice,voice);}await new Promise(r=>setTimeout(r,ms));if(kind==='ai')ai--;else voice--;});await Promise.all([job('ai',20),job('ai',20),job('voice',20),job('voice',20)]);assert.equal(maxAI,1);assert.equal(maxVoice,1);console.log('EC 0.3.25 regression checks: OK');})().catch(e=>{console.error(e);process.exit(1);});
