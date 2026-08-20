const fs=require('fs');
const path=require('path');
const {pathToFileURL}=require('url');

const VIDEO_EXTENSIONS=new Set(['.mp4','.m4v','.webm','.mov']);

function shuffle(items){
  const a=[...items];
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

class CannedManager{
  constructor(){
    this.signature='';
    this.bag=[];
    this.lastPath='';
  }
  reset(){this.signature='';this.bag=[];}
  list(folder){
    const dir=String(folder||'').trim();
    if(!dir||!fs.existsSync(dir))return{ok:false,folder:dir,count:0,files:[],message:dir?'La carpeta no existe':'Selecciona una carpeta'};
    let entries=[];
    try{entries=fs.readdirSync(dir,{withFileTypes:true});}catch(e){return{ok:false,folder:dir,count:0,files:[],message:e.message};}
    const files=[];
    for(const e of entries){
      if(!e.isFile())continue;
      const ext=path.extname(e.name).toLowerCase();
      if(!VIDEO_EXTENSIONS.has(ext))continue;
      const full=path.join(dir,e.name);
      try{
        const st=fs.statSync(full);
        files.push({name:e.name,path:full,url:pathToFileURL(full).href,sizeBytes:st.size,sizeMB:Number((st.size/1048576).toFixed(1)),mtimeMs:st.mtimeMs,ext});
      }catch{}
    }
    files.sort((a,b)=>a.name.localeCompare(b.name,'es',{sensitivity:'base'}));
    const signature=files.map(x=>`${x.path}|${x.sizeBytes}|${Math.round(x.mtimeMs)}`).join('||');
    if(signature!==this.signature){this.signature=signature;this.bag=[];}
    return{ok:true,folder:dir,count:files.length,files,message:files.length?'':'No se encontraron videos compatibles'};
  }
  pick(folder){
    const scan=this.list(folder);
    if(!scan.ok||!scan.files.length){
      const e=new Error(scan.message||'No hay enlatados disponibles');e.code='CANNED_EMPTY';throw e;
    }
    const currentPaths=new Set(scan.files.map(x=>x.path));
    this.bag=this.bag.filter(x=>currentPaths.has(x.path));
    if(!this.bag.length){
      this.bag=shuffle(scan.files);
      if(this.bag.length>1&&this.lastPath&&this.bag[0].path===this.lastPath){
        const swap=1+Math.floor(Math.random()*(this.bag.length-1));
        [this.bag[0],this.bag[swap]]=[this.bag[swap],this.bag[0]];
      }
    }
    const item=this.bag.shift();
    this.lastPath=item.path;
    return{...item,remainingInCycle:this.bag.length,total:scan.files.length};
  }
}

module.exports={CannedManager,VIDEO_EXTENSIONS};
