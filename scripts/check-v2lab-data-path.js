'use strict';
const fs=require('fs');
const os=require('os');
const path=require('path');
const assert=require('assert');
const {LAB_DIR_NAME,DATA_DIR_NAME,canonicalLabBase,dataDirForLabBase,readProfileRegistry,recoverNestedLabData}=require('../src/services/v2LabDataPath');

function registry(ids,active=ids[0]||''){
  return{schemaVersion:1,activeProfileId:active,profiles:ids.map((id,i)=>({id,name:`Perfil ${i+1}`,color:'#F7C600',schemaVersion:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),active:false})),updatedAt:new Date().toISOString()};
}
function writeProfiles(dataDir,ids){
  fs.mkdirSync(path.join(dataDir,'profiles'),{recursive:true});
  fs.writeFileSync(path.join(dataDir,'profiles.json'),JSON.stringify(registry(ids),null,2));
  for(const id of ids){
    const dir=path.join(dataDir,'profiles',id);
    fs.mkdirSync(dir,{recursive:true});
    fs.writeFileSync(path.join(dir,'settings.json'),JSON.stringify({visual:{output:{musicVolume:17}}}));
  }
}

const root=fs.mkdtempSync(path.join(os.tmpdir(),'gec-v2-path-'));
try{
  const exeDir=path.join(root,'portable');
  fs.mkdirSync(exeDir,{recursive:true});
  const once=canonicalLabBase(exeDir);
  const twice=path.join(once,LAB_DIR_NAME);
  const thrice=path.join(twice,LAB_DIR_NAME);
  assert.strictEqual(once,path.join(exeDir,LAB_DIR_NAME),'Primer arranque debe crear una sola carpeta V2 Lab');
  assert.strictEqual(canonicalLabBase(once),once,'Un relaunch no debe añadir otra carpeta V2 Lab');
  assert.strictEqual(canonicalLabBase(twice),once,'Debe colapsar una ruta V2 Lab duplicada heredada');
  assert.strictEqual(canonicalLabBase(thrice),once,'Debe colapsar múltiples duplicaciones heredadas');
  assert.strictEqual(dataDirForLabBase(once),path.join(once,DATA_DIR_NAME),'Data root canónico incorrecto');

  // Reproduce the real failure: imported profiles live in a nested V2 Lab
  // path created by an old app.relaunch(), while the canonical location has
  // no registry. Recovery must restore the profiles without deleting source.
  const nestedData=path.join(twice,DATA_DIR_NAME);
  const ids=['34f5e1b8-e738-4910-9ad3-53293038487a','3557dda8-b51c-4765-a156-7acecc524cf1'];
  writeProfiles(nestedData,ids);
  fs.writeFileSync(path.join(nestedData,'keep-me.txt'),'preserve');
  const recovered=recoverNestedLabData(once);
  assert.strictEqual(recovered.recovered,true,'No recuperó perfiles de la carpeta V2 anidada');
  assert.strictEqual(recovered.canonicalProfiles,2,'Cantidad de perfiles recuperados incorrecta');
  const canonicalData=path.join(once,DATA_DIR_NAME);
  assert.strictEqual(readProfileRegistry(canonicalData).count,2,'El registry canónico debe contener los perfiles');
  assert(fs.existsSync(path.join(canonicalData,'profiles',ids[1],'settings.json')),'Faltan settings del perfil recuperado');
  assert(fs.existsSync(path.join(canonicalData,'keep-me.txt')),'Los recursos faltantes deben recuperarse');
  assert(fs.existsSync(nestedData),'La recuperación no debe borrar la copia antigua');

  // If canonical already has profiles, an older/deeper copy must never
  // overwrite them.
  const deeperData=path.join(thrice,DATA_DIR_NAME);
  writeProfiles(deeperData,['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']);
  const second=recoverNestedLabData(once);
  assert.strictEqual(second.recovered,false,'No debe migrar cuando el registry canónico ya es válido');
  assert.strictEqual(readProfileRegistry(canonicalData).count,2,'Una copia anidada no debe sobrescribir perfiles canónicos');

  console.log('check-v2lab-data-path: OK · relaunch idempotente · perfiles anidados recuperables · registry canónico protegido');
}finally{
  fs.rmSync(root,{recursive:true,force:true});
}
