const fs=require('fs');
const path=require('path');
const {execFile}=require('child_process');
const {pathToFileURL}=require('url');

function uniqueSorted(values){return [...new Set(values.map(x=>String(x||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base'}));}
function aliasFor(file){const base=path.basename(file,path.extname(file)).replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim()||'Fuente';return`EC Custom · ${base}`;}

class FontManager{
  constructor(dataDir){this.dataDir=dataDir;this.dir=path.join(dataDir,'fonts');this.cacheFile=path.join(this.dir,'fonts-cache.json');fs.mkdirSync(this.dir,{recursive:true});}
  windowsFonts(){return new Promise(resolve=>{if(process.platform!=='win32')return resolve(['Arial','Segoe UI','Verdana','Georgia','Impact']);const ps=`$roots=@('HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts','HKCU:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts');$o=@();foreach($r in $roots){if(Test-Path $r){(Get-ItemProperty $r).PSObject.Properties|%{$n=$_.Name -replace ' \\(TrueType\\)$','' -replace ' \\(OpenType\\)$','';if($n -and $n -notmatch '^PS'){ $o+=$n}}}};$o|Sort-Object -Unique|ConvertTo-Json -Compress`;
      execFile('powershell.exe',['-NoProfile','-NonInteractive','-Command',ps],{windowsHide:true,timeout:15000,maxBuffer:1024*1024},(err,stdout)=>{if(err)return resolve(['Arial','Segoe UI','Verdana','Georgia','Impact']);try{const parsed=JSON.parse(stdout||'[]'),arr=Array.isArray(parsed)?parsed:[parsed];resolve(uniqueSorted(arr));}catch{resolve(['Arial','Segoe UI','Verdana','Georgia','Impact']);}});});}
  custom(){const out=[];for(const name of fs.readdirSync(this.dir)){const ext=path.extname(name).toLowerCase();if(!['.ttf','.otf','.woff','.woff2'].includes(ext))continue;const file=path.join(this.dir,name);out.push({family:aliasFor(file),file,url:pathToFileURL(file).href,custom:true});}return out;}
  async list(force=false){let installed=[];if(!force){try{const c=JSON.parse(fs.readFileSync(this.cacheFile,'utf8'));if(Array.isArray(c.installed)&&Date.now()-Number(c.updatedAt||0)<7*86400000)installed=c.installed;}catch{}}if(!installed.length){installed=await this.windowsFonts();try{fs.writeFileSync(this.cacheFile,JSON.stringify({updatedAt:Date.now(),installed},null,2),'utf8');}catch{}}return{installed:uniqueSorted(installed),custom:this.custom()};}
  importFont(src){const file=String(src||'').trim(),ext=path.extname(file).toLowerCase();if(!['.ttf','.otf','.woff','.woff2'].includes(ext))throw new Error('Formato de fuente no compatible');if(!fs.existsSync(file))throw new Error('No se encontró la fuente');let dest=path.join(this.dir,path.basename(file)),n=2;while(fs.existsSync(dest)){dest=path.join(this.dir,`${path.basename(file,ext)}-${n++}${ext}`);}fs.copyFileSync(file,dest);return{family:aliasFor(dest),file:dest,url:pathToFileURL(dest).href,custom:true};}
  removeFont(family){const item=this.custom().find(x=>x.family===family);if(!item)throw new Error('Fuente personalizada no encontrada');fs.rmSync(item.file,{force:true});return item;}
}
module.exports={FontManager};
