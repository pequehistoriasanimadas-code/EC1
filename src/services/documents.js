const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const mammoth=require('mammoth');
const {pathToFileURL}=require('url');

const DOC_EXTENSIONS=new Set(['.txt','.docx']);
const IMAGE_EXTENSIONS=['.jpg','.jpeg','.png','.webp'];
const CATEGORY_MAP=new Map([
  ['POLITICA','POLÍTICA'],['POLÍTICA','POLÍTICA'],['ECONOMIA','ECONOMÍA'],['ECONOMÍA','ECONOMÍA'],
  ['LIMA','LIMA'],['MUNDO','MUNDO'],['DEPORTES','DEPORTES'],['DEPORTE','DEPORTES'],
  ['TECNOLOGIA','TECNOLOGÍA'],['TECNOLOGÍA','TECNOLOGÍA'],['ACTUALIDAD','ACTUALIDAD'],
  ['PERU','PERÚ'],['PERÚ','PERÚ'],['SOCIEDAD','SOCIEDAD'],['ESPECTACULOS','ESPECTÁCULOS'],['ESPECTÁCULOS','ESPECTÁCULOS'],
  ['NEGOCIOS','NEGOCIOS']
]);

function cleanName(value){return String(value||'').replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim();}
function normalizeKey(value){return String(value||'').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
function canonicalCategory(value){const raw=String(value||'').trim();if(!raw)return'';return CATEGORY_MAP.get(raw.toUpperCase())||CATEGORY_MAP.get(normalizeKey(raw))||'';}
function safeStat(file){try{return fs.statSync(file);}catch{return null;}}
function fingerprint(file,st=safeStat(file)){if(!st)return'';return crypto.createHash('sha1').update(`${path.resolve(file)}|${st.size}|${Math.round(st.mtimeMs)}`).digest('hex');}
function findImageForBase(dir,base){
  for(const ext of IMAGE_EXTENSIONS){const p=path.join(dir,`${base}${ext}`);if(fs.existsSync(p))return p;}
  let entries=[];try{entries=fs.readdirSync(dir);}catch{return'';}
  const target=normalizeKey(base);
  for(const name of entries){const ext=path.extname(name).toLowerCase();if(!IMAGE_EXTENSIONS.includes(ext))continue;if(normalizeKey(path.basename(name,ext))===target)return path.join(dir,name);}
  return'';
}
function resolveImage(file){
  const dir=path.dirname(file),base=path.basename(file,path.extname(file));
  const own=findImageForBase(dir,base);if(own)return{path:own,source:'document'};
  const folderName=path.basename(dir);const category=findImageForBase(dir,folderName);if(category)return{path:category,source:'category'};
  for(const alias of ['_categoria','categoria','cover','folder']){const p=findImageForBase(dir,alias);if(p)return{path:p,source:'category'};}
  return{path:'',source:'fallback'};
}
function parseDateCandidate(value){
  const s=String(value||'').trim();if(!s)return'';let m=s.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if(m){const d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3],12));return Number.isNaN(d.getTime())?'':d.toISOString();}
  m=s.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})\b/);
  if(m){const d=new Date(Date.UTC(+m[3],+m[2]-1,+m[1],12));return Number.isNaN(d.getTime())?'':d.toISOString();}
  return'';
}
function extractExplicitDate(text){for(const line of String(text||'').split(/\r?\n/).slice(0,18)){const m=line.match(/^\s*(?:FECHA|DATE)\s*:\s*(.+)$/i);if(m){const d=parseDateCandidate(m[1]);if(d)return d;}}return'';}
function extractExplicitTitle(text){
  const lines=String(text||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean).slice(0,12);
  for(const line of lines){const m=line.match(/^\s*(?:T[IÍ]TULO|TITULAR|TITLE)\s*:\s*(.+)$/i);if(m&&m[1].trim())return m[1].trim();}
  const first=lines.find(x=>!/^\s*(?:FECHA|DATE|CATEGOR[IÍ]A|CATEGORY)\s*:/i.test(x));return first&&first.length<=180?first:'';
}
function stripMetadataLines(text){return String(text||'').split(/\r?\n/).filter(line=>!/^\s*(?:FECHA|DATE|CATEGOR[IÍ]A|CATEGORY|T[IÍ]TULO|TITULAR|TITLE)\s*:/i.test(line)).join('\n').trim();}

class DocumentLibrary{
  scan(folder){
    const root=String(folder||'').trim();if(!root||!fs.existsSync(root))return{ok:false,folder:root,count:0,files:[],message:root?'La carpeta no existe':'Selecciona una carpeta'};
    const files=[];
    const walk=(dir,depth=0)=>{if(depth>4||files.length>=500)return;let entries=[];try{entries=fs.readdirSync(dir,{withFileTypes:true});}catch{return;}for(const e of entries){if(files.length>=500)break;const full=path.join(dir,e.name);if(e.isDirectory()){walk(full,depth+1);continue;}if(!e.isFile()||/^~\$/.test(e.name))continue;const ext=path.extname(e.name).toLowerCase();if(!DOC_EXTENSIONS.has(ext))continue;const st=safeStat(full);if(!st)continue;const img=resolveImage(full),folderName=path.basename(path.dirname(full));files.push({id:fingerprint(full,st),fingerprint:fingerprint(full,st),path:full,name:e.name,ext,title:cleanName(path.basename(e.name,ext)),categoryFromFolder:canonicalCategory(folderName),folderName,imagePath:img.path,imageUrl:img.path?pathToFileURL(img.path).href:'',imageSource:img.source,sizeBytes:st.size,sizeKB:Number((st.size/1024).toFixed(1)),mtimeMs:st.mtimeMs});}};
    walk(root,0);files.sort((a,b)=>a.path.localeCompare(b.path,'es',{sensitivity:'base'}));return{ok:true,folder:root,count:files.length,files,message:files.length?'':'No se encontraron archivos TXT o DOCX'};
  }
  async read(file){
    const full=String(file||'').trim();if(!full||!fs.existsSync(full))throw new Error('El documento ya no existe');const ext=path.extname(full).toLowerCase();let text='';
    if(ext==='.txt')text=fs.readFileSync(full,'utf8');else if(ext==='.docx'){const r=await mammoth.extractRawText({path:full});text=String(r.value||'');}else throw new Error('Formato de documento no compatible');
    text=String(text||'').replace(/\u0000/g,'').trim();if(!text)throw new Error('El documento está vacío');
    return{path:full,text:stripMetadataLines(text),rawText:text,explicitDate:extractExplicitDate(text),explicitTitle:extractExplicitTitle(text),fingerprint:fingerprint(full),image:resolveImage(full)};
  }
}

require('./documentAutoPolicy').installDocumentAutoPolicy();
require('./broadcastSchedulerPolicy').installBroadcastSchedulerPolicy();
module.exports={DocumentLibrary,DOC_EXTENSIONS,IMAGE_EXTENSIONS,canonicalCategory,extractExplicitDate,extractExplicitTitle,resolveImage,fingerprint};
