const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {spawn}=require('child_process');

function safeJson(file,fallback=[]){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return fallback;}}
function cleanName(value){return String(value||'').replace(/[\r\n\t]+/g,' ').replace(/\s+/g,' ').trim().slice(0,80);}

class CustomVoiceManager{
  constructor({resourcesDir,dataDir}){
    this.resourcesDir=resourcesDir;this.dataDir=dataDir;
    this.python=path.join(resourcesDir,'runtime','python','python.exe');
    this.official=path.join(resourcesDir,'runtime','kokoro','voices-v1.0.bin');
    const externalTool=path.join(resourcesDir,'runtime','kokoro','voice_tools.py'),sourceTool=path.join(__dirname,'..','voice_tools.py');this.tool=fs.existsSync(externalTool)?externalTool:sourceTool;
    this.dir=path.join(dataDir,'voices');this.customDir=path.join(this.dir,'custom');
    this.manifestFile=path.join(this.dir,'manifest.json');this.combined=path.join(this.dir,'voices-ec-custom.bin');
    fs.mkdirSync(this.customDir,{recursive:true});
    if(!fs.existsSync(this.manifestFile))fs.writeFileSync(this.manifestFile,'[]','utf8');
  }
  list(){const raw=safeJson(this.manifestFile,[]),items=Array.isArray(raw)?raw:[];return items.filter(x=>x&&x.id&&x.file&&fs.existsSync(x.file)).map(x=>({...x,name:cleanName(x.name)||x.id}));}
  save(items){fs.mkdirSync(this.dir,{recursive:true});fs.writeFileSync(this.manifestFile,JSON.stringify(items,null,2),'utf8');}
  run(args,timeoutMs=90000){return new Promise((resolve,reject)=>{if(!fs.existsSync(this.python))return reject(new Error('Python portable de Kokoro no está disponible'));if(!fs.existsSync(this.tool))return reject(new Error('Conversor de voces no está disponible'));const p=spawn(this.python,[this.tool,...args],{windowsHide:true,cwd:this.resourcesDir,env:{...process.env,PYTHONNOUSERSITE:'1',PYTHONUTF8:'1'}});let out='',err='',done=false;const finish=(fn,v)=>{if(done)return;done=true;clearTimeout(timer);fn(v);};const timer=setTimeout(()=>{try{p.kill();}catch{}finish(reject,new Error('La conversión de voz excedió el tiempo esperado'));},timeoutMs);p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);p.on('error',e=>finish(reject,e));p.on('exit',code=>{let parsed=null;try{parsed=JSON.parse(String(out||'').trim().split(/\r?\n/).filter(Boolean).pop()||'{}');}catch{}if(code===0&&parsed?.ok)return finish(resolve,parsed);finish(reject,new Error(parsed?.error||err.slice(-800)||`Conversor de voz terminó con código ${code}`));});});}
  async rebuild(){const items=this.list();this.save(items);if(!fs.existsSync(this.official))throw new Error('Archivo oficial de voces Kokoro no encontrado');if(!items.length){try{fs.rmSync(this.combined,{force:true});}catch{}return{ok:true,custom:[],archive:this.official};}await this.run(['merge','--official',this.official,'--manifest',this.manifestFile,'--output',this.combined]);return{ok:true,custom:items.map(x=>x.id),archive:this.combined};}
  effectiveArchive(){return fs.existsSync(this.combined)?this.combined:this.official;}
  async importPt(src,name=''){
    const file=String(src||'').trim();if(!file||!fs.existsSync(file))throw new Error('No se encontró el archivo de voz');if(path.extname(file).toLowerCase()!=='.pt')throw new Error('Selecciona una voz .pt exportada por Kokoro Voice Designer');
    const display=cleanName(name)||cleanName(path.basename(file,'.pt'))||'Voz personalizada';const existing=this.list();if(existing.some(x=>x.name.toLowerCase()===display.toLowerCase()))throw new Error(`Ya existe una voz llamada “${display}”`);
    const id=`ecv_${crypto.createHash('sha1').update(`${display}|${Date.now()}|${Math.random()}`).digest('hex').slice(0,12)}`,dest=path.join(this.customDir,`${id}.npz`),sourceFile=path.join(this.customDir,`${id}.pt`);
    await this.run(['import-pt','--input',file,'--official',this.official,'--output',dest]);fs.copyFileSync(file,sourceFile);
    const item={id,name:display,file:dest,sourceFile,source:'Kokoro Voice Designer (.pt)',createdAt:new Date().toISOString()};existing.push(item);this.save(existing);try{await this.rebuild();}catch(e){this.save(existing.filter(x=>x.id!==id));for(const p of [dest,sourceFile])try{fs.rmSync(p,{force:true});}catch{}throw e;}return item;
  }
  async rename(id,name){const display=cleanName(name);if(!display)throw new Error('Escribe un nombre para la voz');const items=this.list(),item=items.find(x=>x.id===id);if(!item)throw new Error('Voz personalizada no encontrada');if(items.some(x=>x.id!==id&&x.name.toLowerCase()===display.toLowerCase()))throw new Error(`Ya existe una voz llamada “${display}”`);item.name=display;this.save(items);return item;}
  async remove(id){const items=this.list(),item=items.find(x=>x.id===id);if(!item)throw new Error('Voz personalizada no encontrada');this.save(items.filter(x=>x.id!==id));for(const p of [item.file,item.sourceFile])if(p)try{fs.rmSync(p,{force:true});}catch{}await this.rebuild();return item;}
  exportFile(id,dest){const item=this.list().find(x=>x.id===id);if(!item)throw new Error('Voz personalizada no encontrada');const requestedExt=path.extname(String(dest||'')).toLowerCase(),source=requestedExt==='.pt'&&item.sourceFile&&fs.existsSync(item.sourceFile)?item.sourceFile:item.file;if(!source||!fs.existsSync(source))throw new Error('Archivo de voz personalizada no encontrado');fs.copyFileSync(source,dest);return{ok:true,path:dest,name:item.name,format:path.extname(source).toLowerCase().replace('.','')};}
  has(id){return this.list().some(x=>x.id===id);}
}

module.exports={CustomVoiceManager};
