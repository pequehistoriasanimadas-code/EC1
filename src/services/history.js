const fs=require('fs'); const path=require('path');
class HistoryStore{
  constructor(baseDir){this.file=path.join(baseDir,'history.json');}
  load(){try{return JSON.parse(fs.readFileSync(this.file,'utf8'));}catch{return{emitted:[]};}}
  save(x){fs.writeFileSync(this.file,JSON.stringify(x,null,2),'utf8');}
  has(url){return this.load().emitted.some(x=>x.url===url);}
  add(story){const h=this.load(); h.emitted.unshift({url:story.link,title:story.title,at:new Date().toISOString()}); h.emitted=h.emitted.slice(0,5000); this.save(h);}
  reset(){this.save({emitted:[]});}
}
module.exports={HistoryStore};
