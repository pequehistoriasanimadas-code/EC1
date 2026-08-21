const fs=require('fs');
const path=require('path');

class HistoryStore{
  constructor(baseDir){
    this.file=path.join(baseDir,'history.json');
    this.data=this.read();
    this.urls=new Set((this.data.emitted||[]).map(x=>x?.url).filter(Boolean));
  }
  read(){
    try{
      const x=JSON.parse(fs.readFileSync(this.file,'utf8'));
      return{emitted:Array.isArray(x?.emitted)?x.emitted:[]};
    }catch{return{emitted:[]};}
  }
  load(){return{emitted:[...(this.data.emitted||[])]};}
  save(){
    const dir=path.dirname(this.file);fs.mkdirSync(dir,{recursive:true});
    const tmp=`${this.file}.tmp`;fs.writeFileSync(tmp,JSON.stringify(this.data,null,2),'utf8');
    try{fs.renameSync(tmp,this.file);}catch{fs.copyFileSync(tmp,this.file);try{fs.rmSync(tmp,{force:true});}catch{}}
  }
  has(url){return!!url&&this.urls.has(url);}
  add(story){
    const url=String(story?.link||'').trim();if(!url||this.urls.has(url))return;
    this.data.emitted.unshift({url,title:String(story?.title||''),at:new Date().toISOString()});
    if(this.data.emitted.length>5000){const removed=this.data.emitted.splice(5000);for(const x of removed)this.urls.delete(x.url);}
    this.urls.add(url);this.save();
  }
  reset(){this.data={emitted:[]};this.urls.clear();this.save();}
}
module.exports={HistoryStore};
