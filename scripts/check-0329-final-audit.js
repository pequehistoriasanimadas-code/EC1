'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os');
const {Providers}=require('../src/services/providers');
let checks=0;const ok=(v,m)=>{checks++;assert.ok(v,m);},eq=(a,b,m)=>{checks++;assert.deepStrictEqual(a,b,m);};

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

  const dirty={ai:{primary:'local',claudeKey:'PLAINTEXT',claudeKeyEnc:'ENCRYPTED',geminiKey:'GEMINI',geminiKeyEnc:'ENC2',hasClaudeKey:true,editorialPrompt:'ok'},nested:{apiKey:'SECRET_API',accessToken:'SECRET_TOKEN',safe:'keep'},visual:{output:{tokenLabel:'normal-ui-label'}}};
  const clean=final.scrubSecrets(dirty),serialized=JSON.stringify(clean);ok(!/PLAINTEXT|ENCRYPTED|GEMINI|ENC2|SECRET_API|SECRET_TOKEN/.test(serialized),'scrubber elimina secretos legacy, cifrados y tokens');eq(clean.ai.primary,'local','scrubber conserva configuración no secreta');eq(clean.ai.editorialPrompt,'ok','scrubber conserva prompt editorial');eq(clean.nested.safe,'keep','scrubber conserva campos normales');
  const payload=final.scrubPackageSettings({globalSettings:{ai:{claudeKeyEnc:'GLOBAL_SECRET',primary:'local'}},profiles:[{settings:{ai:{geminiKey:'PROFILE_SECRET',backup1:'gemini'}}}],resources:[{path:'asset.bin',data:'UNCHANGED_RESOURCE'}]});const ptxt=JSON.stringify(payload);ok(!ptxt.includes('GLOBAL_SECRET')&&!ptxt.includes('PROFILE_SECRET'),'gecprofile/gecpack no contienen claves aunque un JSON antiguo las tenga');eq(payload.resources[0].data,'UNCHANGED_RESOURCE','scrubber no procesa ni altera recursos binarios/base64');

  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gec-final-audit-'));
  try{
    const {ProfileManager0329}=require('../src/services/profileManager0329'),{ProfilePackage0329,readPackage}=require('../src/services/profilePackage0329');
    const dataDir=path.join(tmp,'data'),m=new ProfileManager0329(dataDir),defaults={rssFeeds:[],ai:{primary:'local',backup1:'claude',backup2:'gemini'},tts:{voice:'ef_dora',speed:1},visual:{queueColors:{},output:{}},canned:{},documents:{processed:{}},automation:{}};
    const original=m.create({name:'El Comercio',color:'#F7C600',defaults});m.writeProfileSettings(original.id,{...m.readProfileSettings(original.id),ai:{primary:'local',backup1:'claude',backup2:'gemini',claudeKey:'LEGACY_PLAIN',claudeKeyEnc:'LEGACY_ENCRYPTED'},tts:{voice:'ef_dora',speed:1}});
    const pkg=new ProfilePackage0329({manager:m,dataDir}),file=path.join(tmp,'ec.gecprofile');pkg.exportProfile(original.id,file);const exported=readPackage(file),exportText=JSON.stringify(exported);ok(!exportText.includes('LEGACY_PLAIN')&&!exportText.includes('LEGACY_ENCRYPTED'),'exportProfile real elimina secretos legacy del perfil');
    const one=pkg.importFile(file,'keep'),two=pkg.importFile(file,'keep');ok(one.imported.length===1&&two.imported.length===1,'dos Keep Both reales importan dos perfiles independientes');const names=m.list().map(x=>x.name);eq(new Set(names.map(x=>x.toLocaleLowerCase('es'))).size,names.length,'registro real mantiene todos los nombres visibles únicos');ok(names.includes('El Comercio (importado)')&&names.includes('El Comercio (importado 2)'),'Keep Both real escala sufijos importados de forma predecible');
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
  console.log(`GEC 0.3.29 final audit OK · ${checks} verificaciones`);
})().catch(e=>{console.error(e.stack||e);process.exit(1);});
