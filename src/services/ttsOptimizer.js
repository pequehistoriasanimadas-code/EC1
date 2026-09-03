'use strict';

const THREAD_STEPS=[2,4,6,8,10,12];

function safeThreadCap(logicalCpus,{absoluteMax=12,fraction=.5}={}){
  const logical=Math.max(1,Math.floor(Number(logicalCpus)||1));
  const byFraction=Math.max(1,Math.floor(logical*Math.max(.1,Math.min(1,Number(fraction)||.5))));
  return Math.max(1,Math.min(Math.max(1,Math.floor(Number(absoluteMax)||12)),byFraction));
}

function candidateThreads(logicalCpus,options={}){
  const cap=safeThreadCap(logicalCpus,options),steps=THREAD_STEPS.filter(x=>x<=cap);
  return steps.length?steps:[1];
}

function median(values){
  const nums=(Array.isArray(values)?values:[]).map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
  if(!nums.length)return 0;
  const mid=Math.floor(nums.length/2);
  return nums.length%2?nums[mid]:(nums[mid-1]+nums[mid])/2;
}

function selectEfficientCandidate(results,{tolerance=.03}={}){
  const valid=(Array.isArray(results)?results:[]).filter(x=>x&&x.safe!==false&&!x.error&&Number.isFinite(Number(x.realtimeFactor))&&Number(x.realtimeFactor)>0);
  if(!valid.length)return null;
  const best=Math.min(...valid.map(x=>Number(x.realtimeFactor))),limit=best*(1+Math.max(0,Number(tolerance)||0));
  const efficient=valid.filter(x=>Number(x.realtimeFactor)<=limit).sort((a,b)=>Number(a.threads)-Number(b.threads)||Number(a.realtimeFactor)-Number(b.realtimeFactor));
  return efficient[0]||valid.sort((a,b)=>Number(a.realtimeFactor)-Number(b.realtimeFactor))[0];
}

module.exports={THREAD_STEPS,safeThreadCap,candidateThreads,median,selectEfficientCandidate};
