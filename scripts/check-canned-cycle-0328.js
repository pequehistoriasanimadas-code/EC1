'use strict';

const fs=require('fs');
const os=require('os');
const path=require('path');
const assert=require('assert');
const {snapshotFromState,keyPath}=require('../src/services/cannedCycle0328');

const root=fs.mkdtempSync(path.join(os.tmpdir(),'gec-cycle-0328-check-'));
const folder=path.join(root,'videos');
fs.mkdirSync(folder,{recursive:true});
const files=['A.mp4','B.mp4','C.mp4'].map(name=>{const p=path.join(folder,name);fs.writeFileSync(p,'x');return{name,path:p};});
const scan={ok:true,files};
const statePath=path.join(root,'canned-cycle-state.json');
const write=record=>fs.writeFileSync(statePath,JSON.stringify({version:1,folders:{[keyPath(folder)]:record}},null,2),'utf8');

try{
  write({cycleNumber:1,cycleStartedAt:'2026-09-01T00:00:00.000Z',remainingPaths:[],playedPaths:files.map(x=>x.path),recent:files.map(x=>x.path),lastPath:files[2].path,signature:''});
  let s=snapshotFromState(folder,scan,{root});
  assert.strictEqual(s.total,3);
  assert.strictEqual(s.emitted,3);
  assert.strictEqual(s.remaining,0);
  assert.strictEqual(s.complete,true);
  assert.strictEqual(s.cycleNumber,1);
  assert.strictEqual(s.last,'C.mp4');

  // Reading status must never mutate or advance the completed cycle.
  const before=fs.readFileSync(statePath,'utf8');
  s=snapshotFromState(folder,scan,{root});
  const after=fs.readFileSync(statePath,'utf8');
  assert.strictEqual(after,before,'cycle status mutated persistent state');
  assert.strictEqual(s.cycleNumber,1,'cycle status advanced the cycle');

  // A newly added file is reported as pending in the current cycle without
  // rewriting state; the next real pick will persist it through the manager.
  const d=path.join(folder,'D.mp4');fs.writeFileSync(d,'x');
  const scan4={ok:true,files:[...files,{name:'D.mp4',path:d}]};
  s=snapshotFromState(folder,scan4,{root});
  assert.strictEqual(s.total,4);
  assert.strictEqual(s.emitted,3);
  assert.strictEqual(s.remaining,1);
  assert.strictEqual(s.complete,false);
  assert.strictEqual(fs.readFileSync(statePath,'utf8'),before,'status persisted a newly discovered file');

  console.log('GEC 0.3.28 canned cycle status check OK');
}finally{
  try{fs.rmSync(root,{recursive:true,force:true});}catch{}
}
