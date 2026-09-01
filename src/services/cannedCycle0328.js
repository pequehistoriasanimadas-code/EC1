'use strict';

const fs=require('fs');
const path=require('path');
const {CannedManager}=require('./canned');
const {dataRoot}=require('./normalizerPack0328');

function keyPath(value){
  try{return path.resolve(String(value||'')).normalize('NFKC').toLocaleLowerCase('es');}
  catch{return String(value||'').normalize('NFKC').toLocaleLowerCase('es');}
}

function readJson(file){
  try{const value=JSON.parse(fs.readFileSync(file,'utf8'));return value&&typeof value==='object'?value:null;}
  catch{return null;}
}

function stateFile(root){return path.join(root||dataRoot(),'canned-cycle-state.json');}

function snapshotFromState(folder,scan,{root}={}){
  const files=Array.isArray(scan?.files)?scan.files:[];
  if(!scan?.ok||!files.length)return{ok:false,total:0,emitted:0,remaining:0,recent:[],cycleNumber:0,complete:false};
  const all=readJson(stateFile(root));
  const record=all?.folders?.[keyPath(folder)];
  if(!record)return null;

  const byKey=new Map(files.map(item=>[keyPath(item.path),item]));
  const uniqueAvailable=list=>{
    const out=[];const seen=new Set();
    for(const raw of Array.isArray(list)?list:[]){const k=keyPath(raw);if(!byKey.has(k)||seen.has(k))continue;seen.add(k);out.push(byKey.get(k).path);}
    return out;
  };
  const remaining=uniqueAvailable(record.remainingPaths);
  const remainingKeys=new Set(remaining.map(keyPath));
  const played=uniqueAvailable(record.playedPaths).filter(p=>!remainingKeys.has(keyPath(p)));
  const known=new Set([...remaining,...played].map(keyPath));
  const added=files.map(x=>x.path).filter(p=>!known.has(keyPath(p)));
  const effectiveRemaining=[...remaining,...added];
  const recent=uniqueAvailable(record.recent).slice(-8).reverse().map(p=>byKey.get(keyPath(p))?.name||path.basename(p));
  const lastItem=byKey.get(keyPath(record.lastPath||''));
  const complete=effectiveRemaining.length===0&&played.length>=files.length;
  return{
    ok:true,
    total:files.length,
    emitted:played.length,
    remaining:effectiveRemaining.length,
    recent,
    last:lastItem?.name||'',
    cycleNumber:Math.max(1,Number(record.cycleNumber)||1),
    cycleStartedAt:String(record.cycleStartedAt||''),
    complete
  };
}

function installCycleStatusFix(){
  const proto=CannedManager.prototype;
  if(proto.__ec0328CycleStatusFixInstalled)return;
  Object.defineProperty(proto,'__ec0328CycleStatusFixInstalled',{value:true});
  const previousStatus=proto.cycleStatus;
  proto.cycleStatus=function(folder){
    const scan=this.list(folder);
    if(!scan.ok||!scan.files.length)return{ok:false,total:0,emitted:0,remaining:0,recent:[],cycleNumber:0,complete:false};
    const snapshot=snapshotFromState(folder,scan);
    // The first status read may initialize the persistent cycle. That is safe;
    // once a state exists, status becomes strictly read-only and never advances
    // a completed cycle. The next actual pick is responsible for opening it.
    if(snapshot)return snapshot;
    if(typeof previousStatus==='function')return previousStatus.call(this,folder);
    return{ok:true,total:scan.files.length,emitted:0,remaining:scan.files.length,recent:[],last:'',cycleNumber:1,cycleStartedAt:'',complete:false};
  };
}

module.exports={installCycleStatusFix,snapshotFromState,stateFile,keyPath};
