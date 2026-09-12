'use strict';
const {pathToFileURL}=require('url');
const {TTSLabRuntime}=require('./ttsLabRuntime');

function installReleaseV2AudioUxLab29(){
  const p=TTSLabRuntime.prototype;
  if(p.__ecV2AudioUxLab29)return;
  Object.defineProperty(p,'__ecV2AudioUxLab29',{value:true});
  const baseList=p.listVoices;
  p.listVoices=function(){
    const rows=typeof baseList==='function'?baseList.call(this):[];
    return (rows||[]).map(v=>({
      ...v,
      url:v?.path?pathToFileURL(v.path).href:''
    }));
  };
}

module.exports={installReleaseV2AudioUxLab29};
