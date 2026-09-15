'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const {AutomationEngine,exclusiveEligibilityState,exclusiveSourceArticle}=require('../src/services/automation0325');
const {projectFullQueue}=require('../src/services/release0332');

const settings={automation:{exclusiveEveryNews:4,exclusiveReserveMax:10,openExclusiveArticles:false},canned:{enabled:true,interval:3,folder:'content',adsFolder:'ads',insertAdAfterContent:true}};

function pub(id){return{id:`p${id}`,status:'LISTA',sourceType:'rss',story:{title:`Pública ${id}`,link:`https://medio.test/publica-${id}`,feedId:'f',feedName:'Medio',pubDate:new Date(Date.now()-id*1000).toISOString()},result:{title:`Pública ${id}`,isExclusive:false}};}
function ex(id){return{id:`e${id}`,status:'LISTA',sourceType:'rss',isExclusive:true,accessStatus:'SUBSCRIBER_ONLY',story:{title:`Exclusiva ${id}`,link:`https://medio.test/exclusiva-${id}`,feedId:'f',feedName:'Medio',pubDate:new Date(Date.now()-id*1000).toISOString()},result:{title:`Exclusiva ${id}`,isExclusive:true,accessStatus:'SUBSCRIBER_ONLY'}};}

// 1 cada 4 = tres públicas antes de habilitar una exclusiva, incluso la primera.
assert.deepStrictEqual(exclusiveEligibilityState(settings,0),{everyNews:4,requiredPublic:3,newsSinceExclusive:0,nonExclusiveNeeded:3,due:false});
assert.equal(exclusiveEligibilityState(settings,2).nonExclusiveNeeded,1);
assert.equal(exclusiveEligibilityState(settings,3).due,true);
assert.equal(exclusiveEligibilityState({automation:{exclusiveEveryNews:0}},0).due,true);

// "Abrir exclusivas" conserva el body completo solo cuando el extractor realmente lo obtuvo.
const secret='CUERPO_COMPLETO_SENTINELA '+('contenido '.repeat(120));
const story={title:'Nota exclusiva',description:'Bajada pública suficiente para elaborar una vista previa de la noticia.',link:'https://medio.test/exclusiva'};
const article={title:story.title,description:story.description,publicPreview:'Vista pública con datos suficientes para redactar una nota breve.',body:secret,contentState:'COMPLETE',access:{status:'SUBSCRIBER_ONLY'}};
const full=exclusiveSourceArticle(story,article,true);
assert.equal(full.mode,'full');assert.equal(full.sourceArticle.body,secret);assert.equal(full.sourceArticle.protectedBodyOmitted,false);
const preview=exclusiveSourceArticle(story,article,false);
assert.equal(preview.mode,'public-preview');assert(!preview.sourceArticle.body.includes('CUERPO_COMPLETO_SENTINELA'));assert.equal(preview.sourceArticle.protectedBodyOmitted,true);
const fallback=exclusiveSourceArticle(story,{...article,body:'corto',contentState:'SUMMARY'},true);
assert.equal(fallback.mode,'public-preview');

// Reserva separada de la cola: no consume buffer/render ni deja crecer exclusivas sin límite.
const engine=Object.create(AutomationEngine.prototype);
Object.assign(engine,{exclusiveReserve:[],exclusiveReserveKeys:new Set(),queuedUrls:new Set(),newsStatuses:new Map(),queue:[],exclusiveHasEmitted:false,newsSinceExclusive:0});
engine.state=()=>{};engine.setNewsStatus=()=>{};engine.isFeedActive=()=>true;engine.getSettings=()=>settings;
for(let i=0;i<12;i++)engine.reserveExclusive(ex(i).story,settings,{selectionScore:100-i});
assert.equal(engine.exclusiveReserve.length,10);
assert.equal(engine.queue.length,0,'Las exclusivas reservadas no deben entrar a la cola de emisión');
assert.equal(engine.queuedUrls.size,10,'La reserva debe bloquear duplicados sin inflar la cola');

// La preparación proyecta la cola futura: P,P,P exige E aunque todavía no se haya emitido nada.
engine.newsSinceExclusive=0;engine.queue=[pub(1),pub(2),pub(3)];
let prep=engine.processingSchedulerState(settings);
assert.equal(prep.due,true,'Tres públicas preparadas deben habilitar inmediatamente el cuarto slot exclusivo');
assert.equal(prep.activeNews,3);
engine.queue=[pub(1),pub(2),pub(3),ex(1)];
prep=engine.processingSchedulerState(settings);
assert.equal(prep.due,false,'La exclusiva preparada debe reiniciar la cadencia proyectada');
assert.equal(prep.nonExclusiveNeeded,3);
engine.queue=[pub(1),pub(2),pub(3),ex(1),pub(4),pub(5),pub(6)];
assert.equal(engine.processingSchedulerState(settings).due,true,'La secuencia P P P E P P P debe volver a exigir exclusiva');

// Elección estricta de emisión.
let q=[ex(1),pub(1),pub(2),pub(3)];
engine.queue=q;engine.exclusiveReserve=[];engine.exclusiveReserveKeys.clear();
engine.newsSinceExclusive=0;assert.equal(engine.chooseReadyItem(q,settings).id,'p1');
engine.newsSinceExclusive=1;assert.equal(engine.chooseReadyItem(q,settings).id,'p1');
engine.newsSinceExclusive=2;assert.equal(engine.chooseReadyItem(q,settings).id,'p1');
engine.newsSinceExclusive=3;assert.equal(engine.chooseReadyItem(q,settings).id,'e1');
engine.queue=[pub(1)];engine.exclusiveReserve=[{story:ex(9).story}];engine.newsSinceExclusive=3;assert.equal(engine.chooseReadyItem(engine.queue,settings),null,'Al cumplirse la regla debe esperar la exclusiva reservada en vez de saltársela');
engine.exclusiveReserve=[];engine.queue=[ex(1)];engine.newsSinceExclusive=1;assert.equal(engine.chooseReadyItem(engine.queue,settings),null,'Una exclusiva prematura no debe emitirse');

// La reserva no altera los cálculos de CONTENIDO/ANUNCIO porque no forma parte de baseRows.
const filesContent=[{name:'contenido.mp4',path:path.resolve('/tmp/contenido.mp4')}],filesAds=[{name:'anuncio.mp4',path:path.resolve('/tmp/anuncio.mp4')}];
const manager=files=>({list:()=>({ok:true,files}),ensureBag(){},bag:files});
const renderEngine={scheduledNewsTotal:0,cannedPlayed:0,lastScheduledCannedAt:0,currentKind:'none',canned:manager(filesContent),ads:manager(filesAds),exclusiveReserve:Array(10).fill({})};
const rows=[pub(1),pub(2),pub(3),pub(4)].map((x,i)=>({...x,displayPosition:i+1,queueGroup:'effective'}));
const projected=projectFullQueue(renderEngine,settings,rows);
assert.equal(projected.filter(x=>x.sourceType==='content').length>=1,true);
assert.equal(projected.filter(x=>x.sourceType==='ad').length>=1,true);
assert.equal(projected.filter(x=>x.sourceType==='rss').length,4);

// Cambio del switch durante emisión: el modo queda capturado por trabajo y no reinterpreta items ya generados.
const source=fs.readFileSync(path.join(__dirname,'../src/services/automation0325.js'),'utf8');
assert(source.includes("exclusiveContentModeRequested:s?.automation?.openExclusiveArticles===true?'full':'public-preview'"));
assert(source.includes("holder.exclusiveContentModeRequested==='full'"));
assert(source.includes("result:{...result,ttsScript:locution.text,exclusiveContentMode:holder.exclusiveContentMode}"));
assert(source.includes('sched=this.processingSchedulerState(s)'),'El motor base debe conservar la cadencia proyectada');

// Lab.28 corrige la regresión desde una capa compartida, sin ramas por nombre de perfil.
const stab=fs.readFileSync(path.join(__dirname,'../src/services/releaseV2Stabilization.js'),'utf8');
assert(stab.includes('p.producer=async function'),'Lab.28 debe reemplazar el productor compartido, no parchear un perfil concreto');
assert(stab.includes('exclusiveOnly:true'),'Cuando toca exclusiva debe intentarla primero');
assert(stab.includes('publicOnly:true'),'Debe existir un camino explícito de noticias públicas');
assert(stab.includes('publicFallback'),'Si no existe una exclusiva elegible, la preparación debe continuar con una noticia pública en cualquier perfil');
assert(stab.includes('continuando con noticia pública para no detener la reserva'),'El operador debe ver que se hizo fallback sin bloquear la reserva');
assert(!/\bEC\b.*producer|\bGestión\b.*producer/i.test(stab),'La corrección no debe depender del nombre EC o Gestión');
assert(!stab.includes('Turno de exclusiva pendiente · esperando una exclusiva elegible'),'La ausencia de exclusiva no debe dejar al productor bloqueado');

const ui=fs.readFileSync(path.join(__dirname,'../src/renderer-final-0324.js'),'utf8');
assert(ui.includes("#tab-auto .auto-cols > div:first-child"),'Frecuencia debe estar en Automático');
assert(ui.includes('id="openExclusiveArticles"'),'Falta Abrir exclusivas');
assert(ui.includes('solo afecta exclusivas que aún no comenzaron IA/TTS'));
assert(!ui.includes("const host=$q('#globalExclusiveClose')"),'La frecuencia ya no debe inyectarse en Ajustes');

console.log('check-v2lab-exclusive-planner: OK · preparación P-P-P-E con fallback público · reserva fuera de cola · 1/4 estricto · Abrir exclusivas futuro-only · contenido/anuncio intactos');