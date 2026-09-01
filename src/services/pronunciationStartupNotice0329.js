'use strict';
const {PronunciationNormalizer}=require('./pronunciation');

function installPronunciationStartupNotice0329(){
  const p=PronunciationNormalizer.prototype;
  if(p.__ec0329NonBlockingMigrationNotice)return;
  Object.defineProperty(p,'__ec0329NonBlockingMigrationNotice',{value:true});
  const base=p.status;
  p.status=function(...args){
    const out=base.apply(this,args)||{};
    if(out.migrationReport){
      out.migrationInfo={...out.migrationReport};
      delete out.migrationReport;
    }
    return out;
  };
}

module.exports={installPronunciationStartupNotice0329};
