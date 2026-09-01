'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert'),zlib=require('zlib'),crypto=require('crypto');
let checks=0;const ok=(v,m)=>{checks++;assert.ok(v,m);};
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
for(const [file,tokens] of Object.entries({
  'src/bootstrap-0329.js':['profilePerformance0329','profileAuditHardening0329','profileAuditFixes0329','profileFinalSafety0329'],
  'src/services/profilePerformance0329.js':['media-index-0329.json','__ec0329PersistentMediaIndex'],
  'src/services/profileAuditHardening0329.js':['installKokoroHardening','cancelActiveRequests','installCannedHardening','DOCUMENT_PROFILE_SWITCH','installRssConcurrency','installImportCoordinator','settingsRoot','PROFILE_SWITCH_BUSY'],
  'src/services/profileAuditFixes0329.js':['STALE_PROFILE_SETTINGS','installCompletedCyclePreview','installAsyncAssets','installAsyncProfileCrud','PROFILE_REQUIRED','__ecProfileId'],
  'src/services/profileFinalSafety0329.js':['installRegistrySanitizer','installImportDiskSafety','cleanupBackups'],
  'src/services/profileSwitchSafety0329.js':['switchPromise','cancelActiveRequests','__ec0329DiscardSessionDocuments'],
  'src/services/profileCompatibility0329.js':['document-hash-index-0329.json','streamHashSync','cachedFingerprint'],
  'src/services/profilePackage0329.js':['maxOutputLength','recoverPendingImport','restoreBackup','voiceIdMap','NormalizerPack0328','MAX_UNCOMPRESSED_BYTES','__proto__'],
  'src/preload.js':["page==='output.html'?outputApi:controlApi",'const outputApi']
})){
  const src=read(file);for(const token of tokens)ok(src.includes(token),`${file}: falta ${token}`);
}
const {readPackage,PACKAGE_SCHEMA}=require(path.join(root,'src','services','profilePackage0329.js'));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gec-audit-0329-'));
try{
  const bad={manifest:{format:'GEC_PROFILE_PACKAGE',packageSchemaVersion:PACKAGE_SCHEMA,kind:'profile'},profiles:[{meta:{id:'../../escape',name:'Bad',color:'#FFFFFF'},settings:{}}],resources:[]},file=path.join(tmp,'bad.gecprofile');fs.writeFileSync(file,zlib.gzipSync(Buffer.from(JSON.stringify(bad))));assert.throws(()=>readPackage(file),/identificador de perfil inválido/i);checks++;
  const goodId=crypto.randomUUID(),good={manifest:{format:'GEC_PROFILE_PACKAGE',packageSchemaVersion:PACKAGE_SCHEMA,kind:'profile'},profiles:[{meta:{id:goodId,name:'Ok',color:'#FFFFFF'},settings:{}}],resources:[]},file2=path.join(tmp,'ok.gecprofile');fs.writeFileSync(file2,zlib.gzipSync(Buffer.from(JSON.stringify(good))));ok(readPackage(file2).profiles[0].meta.id===goodId,'paquete válido no se lee');
  const duplicated={manifest:{format:'GEC_PROFILE_PACKAGE',packageSchemaVersion:PACKAGE_SCHEMA,kind:'profile'},profiles:[{meta:{id:goodId,name:'Uno',color:'#FFFFFF'},settings:{}},{meta:{id:goodId,name:'Dos',color:'#FFFFFF'},settings:{}}],resources:[]},file3=path.join(tmp,'dup.gecprofile');fs.writeFileSync(file3,zlib.gzipSync(Buffer.from(JSON.stringify(duplicated))));assert.throws(()=>readPackage(file3),/perfiles duplicados/i);checks++;
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
console.log(`GEC 0.3.29 audit hardening checks OK · ${checks} verificaciones`);
