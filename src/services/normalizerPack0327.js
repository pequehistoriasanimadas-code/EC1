'use strict';

const fs=require('fs');
const path=require('path');
const {app,dialog}=require('electron');
const {VERSION:ENGINE_VERSION,SCHEMA,structuralPreNormalize,validateRulePack}=require('./speechRules0327');
const REMOTE_URL='https://raw.githubusercontent.com/pequehistoriasanimadas-code/EC1/main/src/assets/normalizer-es-PE-current.json';

function dataRoot(){const portable=process.env.PORTABLE_EXECUTABLE_DIR;if(portable)return path.join(portable,'EC Automatic News Data');if(app.isPackaged)return path.join(path.dirname(process.execPath),'EC Automatic News Data');return path.join(app.getPath('userData'),'EC Automatic News Data');}
function atomicWrite(file,text){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=`${file}.tmp`;fs.writeFileSync(tmp,text,'utf8');try{fs.renameSync(tmp,file);}catch{fs.copyFileSync(tmp,file);try{fs.rmSync(tmp,{force:true});}catch{}}}
function semverTuple(v){return String(v||'0').split(/[.-]/).slice(0,3).map(x=>Number(x)||0);}
function engineCompatible(min){const a=semverTuple(ENGINE_VERSION),b=semverTuple(min);for(let i=0;i<3;i++){if(a[i]>b[i])return true;if(a[i]<b[i])return false;}return true;}

class NormalizerPack0327{
  constructor(){this.root=path.join(dataRoot(),'normalizer');this.active=path.join(this.root,'rules.json');this.previous=path.join(this.root,'rules.previous.json');this.bundled=path.join(__dirname,'..','assets','normalizer-es-PE-0327.json');this.cache=null;this.cacheMtime=0;this.ensure();}
  ensure(){fs.mkdirSync(this.root,{recursive:true});if(!fs.existsSync(this.active)&&fs.existsSync(this.bundled))atomicWrite(this.active,fs.readFileSync(this.bundled,'utf8'));}
  readFile(file){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return null;}}
  validate(pack){const basic=validateRulePack(pack);if(!basic.ok)return basic;if(!engineCompatible(pack.minimumEngine||'0'))return{ok:false,error:`Este paquete requiere motor ${pack.minimumEngine}`};const tests=Array.isArray(pack.tests)?pack.tests:[];if(tests.length>500)return{ok:false,error:'Demasiadas pruebas'};for(const t of tests){const input=String(t?.input??''),expected=String(t?.expected??''),got=structuralPreNormalize(input,{rules:pack.rules||[]}).text;if(got!==expected)return{ok:false,error:`Prueba falló: ${input} → ${got}; esperado: ${expected}`};}return{ok:true,tests:tests.length};}
  load(){this.ensure();try{const st=fs.statSync(this.active);if(this.cache&&st.mtimeMs===this.cacheMtime)return this.cache;const pack=this.readFile(this.active)||this.readFile(this.bundled)||{schema:SCHEMA,rules:[],rulesVersion:'integrada'};const check=this.validate(pack);if(!check.ok)throw new Error(check.error);this.cache=pack;this.cacheMtime=st.mtimeMs;return pack;}catch{return this.readFile(this.bundled)||{schema:SCHEMA,rules:[],rulesVersion:'integrada'};}}
  status(){const pack=this.load(),hasPrevious=fs.existsSync(this.previous);return{ok:true,engineVersion:ENGINE_VERSION,schema:SCHEMA,rulesVersion:String(pack.rulesVersion||'integrada'),ruleCount:Array.isArray(pack.rules)?pack.rules.length:0,testCount:Array.isArray(pack.tests)?pack.tests.length:0,hasPrevious,activeFile:this.active,updateMode:'importable'};}
  activate(pack){const check=this.validate(pack);if(!check.ok)throw new Error(check.error);if(fs.existsSync(this.active))try{fs.copyFileSync(this.active,this.previous);}catch{}atomicWrite(this.active,JSON.stringify(pack,null,2));this.cache=null;this.cacheMtime=0;return{...this.status(),validatedTests:check.tests||0};}
  async importDialog(){const result=await dialog.showOpenDialog({title:'Importar reglas del Normalizador ES-PE',properties:['openFile'],filters:[{name:'Paquete JSON',extensions:['json']}]});if(result.canceled||!result.filePaths?.[0])return{cancelled:true,...this.status()};const pack=this.readFile(result.filePaths[0]);if(!pack)throw new Error('El archivo no contiene JSON válido');return{cancelled:false,...this.activate(pack)};}
  async remotePack(){const r=await fetch(REMOTE_URL,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(8000)});if(!r.ok)throw new Error(`Actualización HTTP ${r.status}`);const pack=await r.json();const check=this.validate(pack);if(!check.ok)throw new Error(check.error);return pack;}
  async checkRemote(){try{const remote=await this.remotePack(),local=this.load(),available=String(remote.rulesVersion||'')!==String(local.rulesVersion||'');return{ok:true,available,currentVersion:String(local.rulesVersion||''),remoteVersion:String(remote.rulesVersion||''),remoteTests:Array.isArray(remote.tests)?remote.tests.length:0};}catch(e){return{ok:false,available:false,error:e.message||String(e),currentVersion:String(this.load().rulesVersion||'')};}}
  async updateRemote(){const remote=await this.remotePack();if(String(remote.rulesVersion||'')===String(this.load().rulesVersion||''))return{ok:true,updated:false,...this.status()};return{ok:true,updated:true,...this.activate(remote)};}
  restore(){if(!fs.existsSync(this.previous))return{ok:false,error:'No hay una versión anterior guardada',...this.status()};const pack=this.readFile(this.previous);const check=this.validate(pack);if(!check.ok)throw new Error(`La copia anterior no es válida: ${check.error}`);const current=fs.existsSync(this.active)?fs.readFileSync(this.active,'utf8'):'';atomicWrite(this.active,JSON.stringify(pack,null,2));if(current)atomicWrite(this.previous,current);this.cache=null;this.cacheMtime=0;return{ok:true,...this.status()};}
}

module.exports={NormalizerPack0327,dataRoot};
