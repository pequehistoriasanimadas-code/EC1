const fs=require('fs');
const path=require('path');
const {pathToFileURL}=require('url');

const VIDEO_EXTENSIONS=new Set(['.mp4','.m4v','.webm','.mov']);
const durationCache=new Map();

function shuffle(items){
  const a=[...items];
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

function mp4Duration(file,st){
  const key=`${file}|${st?.size||0}|${Math.round(st?.mtimeMs||0)}`;
  if(durationCache.has(key))return durationCache.get(key);
  let fd=null,result=0;
  try{
    fd=fs.openSync(file,'r');const size=Number(st?.size)||fs.fstatSync(fd).size,chunkSize=1024*1024,overlap=64;let offset=0,tail=Buffer.alloc(0);
    while(offset<size){
      const len=Math.min(chunkSize,size-offset),buf=Buffer.allocUnsafe(len),read=fs.readSync(fd,buf,0,len,offset);if(!read)break;
      const data=tail.length?Buffer.concat([tail,buf.subarray(0,read)]):buf.subarray(0,read);let at=0;
      while((at=data.indexOf(Buffer.from('mvhd'),at))>=0){
        try{
          const version=data[at+4];let timescale=0,duration=0;
          if(version===1&&at+36<=data.length){timescale=data.readUInt32BE(at+24);const hi=data.readUInt32BE(at+28),lo=data.readUInt32BE(at+32);duration=hi*4294967296+lo;}
          else if(at+24<=data.length){timescale=data.readUInt32BE(at+16);duration=data.readUInt32BE(at+20);}
          if(timescale>0&&duration>0){result=duration/timescale;break;}
        }catch{}
        at+=4;
      }
      if(result>0)break;tail=data.subarray(Math.max(0,data.length-overlap));offset+=read;
    }
  }catch{}finally{if(fd!==null)try{fs.closeSync(fd);}catch{}}
  result=Number.isFinite(result)&&result>0&&result<24*3600?Number(result.toFixed(2)):0;durationCache.set(key,result);return result;
}

function mediaDuration(file,st){
  const ext=path.extname(file).toLowerCase();
  return ['.mp4','.m4v','.mov'].includes(ext)?mp4Duration(file,st):0;
}

function bestDurationIndex(items,targetSec){
  if(!items?.length)return-1;const target=Number(targetSec);
  if(!(target>0))return 0;
  const known=items.map((x,i)=>({i,d:Number(x.durationSec)||0})).filter(x=>x.d>0);if(!known.length)return 0;
  if(!Number.isFinite(target))return known.reduce((a,b)=>b.d>a.d?b:a).i;
  const enough=known.filter(x=>x.d>=target).sort((a,b)=>a.d-b.d);if(enough.length)return enough[0].i;
  return known.sort((a,b)=>b.d-a.d)[0].i;
}

class CannedManager{
  constructor(){this.signature='';this.bag=[];this.lastPath='';this.requestedDurationSec=0;}
  reset(){this.signature='';this.bag=[];this.requestedDurationSec=0;}
  list(folder){
    const dir=String(folder||'').trim();
    if(!dir||!fs.existsSync(dir))return{ok:false,folder:dir,count:0,files:[],message:dir?'La carpeta no existe':'Selecciona una carpeta'};
    let entries=[];
    try{entries=fs.readdirSync(dir,{withFileTypes:true});}catch(e){return{ok:false,folder:dir,count:0,files:[],message:e.message};}
    const files=[];
    for(const e of entries){
      if(!e.isFile())continue;
      const ext=path.extname(e.name).toLowerCase();if(!VIDEO_EXTENSIONS.has(ext))continue;
      const full=path.join(dir,e.name);
      try{const st=fs.statSync(full);files.push({name:e.name,path:full,url:pathToFileURL(full).href,sizeBytes:st.size,sizeMB:Number((st.size/1048576).toFixed(1)),mtimeMs:st.mtimeMs,ext,durationSec:mediaDuration(full,st)});}catch{}
    }
    files.sort((a,b)=>a.name.localeCompare(b.name,'es',{sensitivity:'base'}));
    const signature=files.map(x=>`${x.path}|${x.sizeBytes}|${Math.round(x.mtimeMs)}`).join('||');
    if(signature!==this.signature){this.signature=signature;this.bag=[];}
    return{ok:true,folder:dir,count:files.length,files,message:files.length?'':'No se encontraron videos compatibles'};
  }
  ensureBag(folder){
    const scan=this.list(folder);
    if(!scan.ok||!scan.files.length){const e=new Error(scan.message||'No hay contenidos disponibles');e.code='CANNED_EMPTY';throw e;}
    const byPath=new Map(scan.files.map(x=>[x.path,x]));this.bag=this.bag.filter(x=>byPath.has(x.path)).map(x=>byPath.get(x.path));
    if(!this.bag.length){
      this.bag=shuffle(scan.files);
      if(this.bag.length>1&&this.lastPath&&this.bag[0].path===this.lastPath){const swap=1+Math.floor(Math.random()*(this.bag.length-1));[this.bag[0],this.bag[swap]]=[this.bag[swap],this.bag[0]];}
    }
    return scan;
  }
  requestDuration(seconds){this.requestedDurationSec=Number(seconds)>0?Number(seconds):0;}
  peekForDuration(folder,targetSec){
    const scan=this.ensureBag(folder),i=bestDurationIndex(this.bag,targetSec),item=this.bag[i<0?0:i];
    return item?{...item,remainingInCycle:Math.max(0,this.bag.length-1),total:scan.files.length}:null;
  }
  pickForDuration(folder,targetSec){
    const scan=this.ensureBag(folder),i=bestDurationIndex(this.bag,targetSec),index=i<0?0:i,item=this.bag.splice(index,1)[0];if(!item)return null;this.lastPath=item.path;
    return{...item,remainingInCycle:this.bag.length,total:scan.files.length};
  }
  peek(folder){return this.peekForDuration(folder,this.requestedDurationSec||0);}
  pick(folder){const target=this.requestedDurationSec||0;this.requestedDurationSec=0;return this.pickForDuration(folder,target);}
}

module.exports={CannedManager,VIDEO_EXTENSIONS,bestDurationIndex,mediaDuration};
