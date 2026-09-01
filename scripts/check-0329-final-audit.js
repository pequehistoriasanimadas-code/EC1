'use strict';
const assert=require('assert');
const {Providers}=require('../src/services/providers');
let checks=0;const ok=(v,m)=>{checks++;assert.ok(v,m);},eq=(a,b,m)=>{checks++;assert.deepStrictEqual(a,b,m);};

// Install the final wrapper over a deterministic provider failure implementation.
let physicalCancels=0;
Providers.prototype.generateBuilt=async function(){const e=new Error('mixed final failure');e.code='ALL_PROVIDERS_FAILED';throw e;};
Providers.prototype.cancelActiveRequests=function(){physicalCancels++;return{ok:true};};
const final=require('../src/services/releaseAuditFinal0329');
final.installReleaseAuditFinal0329();

(async()=>{
  const p=Object.create(Providers.prototype);p.__ec0329CircuitUntil=0;
  for(let i=1;i<=2;i++){try{await p.generateBuilt({}, {}, []);}catch(e){eq(e.code,'ALL_PROVIDERS_FAILED',`fallo final ${i} conserva código`);ok(!(Number(p.__ec0329CircuitUntil)>Date.now()),`fallo ${i} aislado no pausa toda la preparación`);}}
  let third;try{await p.generateBuilt({}, {}, []);}catch(e){third=e;}
  eq(third?.code,'ALL_PROVIDERS_FAILED','tercer fallo conserva causa editorial/mixta');ok(Number(p.__ec0329CircuitUntil)>Date.now(),'tres fallos finales consecutivos abren pausa de seguridad');ok(Number(third?.retryAfter)>=15,'tercer fallo comunica espera mínima');eq(Number(third?.finalFailureStreak),3,'se expone la racha final para diagnóstico');
  p.cancelActiveRequests('profile-switch');eq(physicalCancels,1,'cancelación final preserva la cancelación previa');eq(Number(p.__ec0329FinalFailureStreak),0,'cambiar/cancelar limpia la racha de fallos finales');

  const rows=[
    {id:'a',name:'El Comercio',color:'#F7C600'},
    {id:'b',name:'El Comercio (importado)',color:'#22C55E'},
    {id:'c',name:'El Comercio (importado)',color:'#3B82F6'}
  ];
  const manager={
    list:()=>rows.map(x=>({...x})),
    update:(id,payload)=>{const row=rows.find(x=>x.id===id);if(!row)throw new Error('missing');if(rows.some(x=>x.id!==id&&x.name.toLocaleLowerCase('es')===payload.name.toLocaleLowerCase('es')))throw new Error('duplicate');row.name=payload.name;row.color=payload.color;return{...row};}
  };
  const changed=final.normalizeImportedNames(manager,['c']);eq(changed.length,1,'Keep Both repetido renombra el perfil recién importado');eq(rows.find(x=>x.id==='c').name,'El Comercio (importado 2)','Keep Both genera nombre visible único y estable');
  const candidate=final.importedCandidate('Un nombre extremadamente largo '.repeat(5),24);ok(candidate.length<=80,'nombre importado respeta máximo de 80 caracteres');ok(/\(importado 24\)$/.test(candidate),'nombre truncado conserva sufijo de conflicto');
  console.log(`GEC 0.3.29 final audit OK · ${checks} verificaciones`);
})().catch(e=>{console.error(e.stack||e);process.exit(1);});
