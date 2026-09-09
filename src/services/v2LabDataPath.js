'use strict';
const fs=require('fs');
const path=require('path');

const LAB_DIR_NAME='GEC V2 TTS Lab';
const DATA_DIR_NAME='EC Automatic News Data';

function cleanResolved(value){
  return path.resolve(String(value||'.').trim()||'.');
}
function isLabDir(value){
  return path.basename(cleanResolved(value)).toLocaleLowerCase('en')===LAB_DIR_NAME.toLocaleLowerCase('en');
}
function canonicalLabBase(rawBase){
  let base=cleanResolved(rawBase);
  // app.relaunch() inherits the process environment. Older V2 builds could
  // therefore append "GEC V2 TTS Lab" again on every relaunch. Collapse only
  // adjacent trailing V2 Lab folders, preserving every other parent folder.
  while(isLabDir(base)&&isLabDir(path.dirname(base)))base=path.dirname(base);
  return isLabDir(base)?base:path.join(base,LAB_DIR_NAME);
}
function dataDirForLabBase(labBase){
  return path.join(canonicalLabBase(labBase),DATA_DIR_NAME);
}
function readProfileRegistry(dataDir){
  try{
    const raw=JSON.parse(fs.readFileSync(path.join(dataDir,'profiles.json'),'utf8'));
    const profiles=Array.isArray(raw?.profiles)?raw.profiles.filter(x=>x&&x.id&&x.name):[];
    return{count:profiles.length,activeProfileId:String(raw?.activeProfileId||''),profiles};
  }catch{return{count:0,activeProfileId:'',profiles:[]};}
}
function mergeMissing(src,dst){
  if(!src||!fs.existsSync(src))return;
  const st=fs.statSync(src);
  if(st.isDirectory()){
    fs.mkdirSync(dst,{recursive:true});
    for(const name of fs.readdirSync(src))mergeMissing(path.join(src,name),path.join(dst,name));
    return;
  }
  if(!fs.existsSync(dst)){
    fs.mkdirSync(path.dirname(dst),{recursive:true});
    fs.copyFileSync(src,dst);
  }
}
function nestedDataCandidates(labBase,maxDepth=4){
  const out=[];
  let current=canonicalLabBase(labBase);
  for(let depth=1;depth<=maxDepth;depth++){
    current=path.join(current,LAB_DIR_NAME);
    const dataDir=path.join(current,DATA_DIR_NAME);
    if(fs.existsSync(dataDir)){
      let mtime=0;
      try{mtime=fs.statSync(path.join(dataDir,'profiles.json')).mtimeMs||0;}catch{}
      out.push({depth,labBase:current,dataDir,registry:readProfileRegistry(dataDir),mtime});
    }
  }
  return out;
}
function recoverNestedLabData(labBase){
  const canonical=canonicalLabBase(labBase),canonicalData=path.join(canonical,DATA_DIR_NAME);
  const canonicalRegistry=readProfileRegistry(canonicalData);
  const candidates=nestedDataCandidates(canonical);
  const usable=candidates.filter(x=>x.registry.count>0).sort((a,b)=>b.registry.count-a.registry.count||b.mtime-a.mtime||a.depth-b.depth);
  if(canonicalRegistry.count>0||!usable.length){
    return{recovered:false,canonicalLabBase:canonical,canonicalData,canonicalProfiles:canonicalRegistry.count,nestedCandidates:candidates.map(x=>({depth:x.depth,dataDir:x.dataDir,profiles:x.registry.count}))};
  }
  const source=usable[0];
  fs.mkdirSync(canonicalData,{recursive:true});
  // Preserve any canonical files already present. The only authoritative
  // overwrite is the profile registry/profile folders because canonical has
  // zero registered profiles and the nested copy has a valid registry.
  mergeMissing(source.dataDir,canonicalData);
  const srcProfiles=path.join(source.dataDir,'profiles'),dstProfiles=path.join(canonicalData,'profiles');
  if(fs.existsSync(srcProfiles))fs.cpSync(srcProfiles,dstProfiles,{recursive:true,force:true});
  fs.copyFileSync(path.join(source.dataDir,'profiles.json'),path.join(canonicalData,'profiles.json'));
  const recoveredRegistry=readProfileRegistry(canonicalData);
  return{recovered:recoveredRegistry.count>0,sourceData:source.dataDir,canonicalLabBase:canonical,canonicalData,canonicalProfiles:recoveredRegistry.count,nestedCandidates:candidates.map(x=>({depth:x.depth,dataDir:x.dataDir,profiles:x.registry.count}))};
}

module.exports={LAB_DIR_NAME,DATA_DIR_NAME,canonicalLabBase,dataDirForLabBase,readProfileRegistry,nestedDataCandidates,recoverNestedLabData};
