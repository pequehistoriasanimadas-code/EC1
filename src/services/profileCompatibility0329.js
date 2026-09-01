'use strict';
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {app}=require('electron');
const {DocumentLibrary}=require('./documents');
const {FontManager}=require('./fonts');
const {CustomVoiceManager}=require('./customVoices');

let indexLoaded=false,indexDirty=false,indexTimer=null;const index={entries:{}};
function dataRoot(){const portable=process.env.PORTABLE_EXECUTABLE_DIR;if(portable)return path.join(portable,'EC Automatic News Data');if(app.isPackaged)return path.join(path.dirname(process.execPath),'EC Automatic News Data');return path.join(app.getPath('userData'),'EC Automatic News Data');}
function indexFile(){return path.join(dataRoot(),'document-hash-index-0329.json');}
function loadIndex(){if(indexLoaded)return;indexLoaded=true;try{const x=JSON.parse(fs.readFileSync(indexFile(),'utf8'));if(x?.entries&&typeof x.entries==='object')index.entries=x.entries;}catch{}}
function scheduleSave(){indexDirty=true;if(indexTimer)return;indexTimer=setTimeout(()=>{indexTimer=null;if(!indexDirty)return;indexDirty=false;try{const file=indexFile(),tmp=`${file}.tmp`;fs.mkdirSync(path.dirname(file),{recursive:true});const rows=Object.entries(index.entries);if(rows.length>5000)for(const [k] of rows.slice(0,rows.length-5000))delete index.entries[k];fs.writeFileSync(tmp,JSON.stringify({schemaVersion:1,updatedAt:new Date().toISOString(),entries:index.entries}),'utf8');try{fs.renameSync(tmp,file);}catch{fs.copyFileSync(tmp,file);fs.rmSync(tmp,{force:true});}}catch{}},700);}
function streamHashSync(file){const fd=fs.openSync(file,'r');try{const h=crypto.createHash('sha256'),buf=Buffer.allocUnsafe(1024*1024);let pos=0;while(true){const n=fs.readSync(fd,buf,0,buf.length,pos);if(!n)break;h.update(buf.subarray(0,n));pos+=n;}return h.digest('hex');}finally{try{fs.closeSync(fd);}catch{}}}
function cachedFingerprint(file){try{loadIndex();const st=fs.statSync(file),key=path.resolve(file).toLocaleLowerCase('es'),signature=`${st.size}|${Math.round(st.mtimeMs)}`,cached=index.entries[key];return cached?.signature===signature&&/^[0-9a-f]{64}$/i.test(cached.hash||'')?cached.hash:'';}catch{return'';}}
function contentFingerprint(file){try{const cached=cachedFingerprint(file);if(cached)return cached;loadIndex();const st=fs.statSync(file),resolved=path.resolve(file),key=resolved.toLocaleLowerCase('es'),signature=`${st.size}|${Math.round(st.mtimeMs)}`,hash=streamHashSync(file);index.entries[key]={signature,hash,lastSeenAt:Date.now()};scheduleSave();return hash;}catch{return'';}}
function installMovableDocuments(){const p=DocumentLibrary.prototype;if(p.__ec0329ContentFingerprint)return;Object.defineProperty(p,'__ec0329ContentFingerprint',{value:true});const baseScan=p.scan,baseRead=p.read;p.scan=function(folder){const r=baseScan.call(this,folder);for(const x of r.files||[]){const fp=cachedFingerprint(x.path);if(fp){x.id=fp;x.fingerprint=fp;}}return r;};p.read=async function(file){const r=await baseRead.call(this,file),fp=contentFingerprint(file);return fp?{...r,fingerprint:fp}:r;};}
function installManagerCapture(){const fp=FontManager.prototype;if(!fp.__ec0329Capture){Object.defineProperty(fp,'__ec0329Capture',{value:true});const custom=fp.custom,list=fp.list;fp.custom=function(){global.__ec0329FontManager=this;return custom.call(this);};fp.list=function(...args){global.__ec0329FontManager=this;return list.apply(this,args);};}const vp=CustomVoiceManager.prototype;if(!vp.__ec0329Capture){Object.defineProperty(vp,'__ec0329Capture',{value:true});const list=vp.list,effective=vp.effectiveArchive;vp.list=function(){global.__ec0329VoiceManager=this;return list.call(this);};vp.effectiveArchive=function(){global.__ec0329VoiceManager=this;return effective.call(this);};}}
function installProfileCompatibility0329(){installMovableDocuments();installManagerCapture();}
module.exports={installProfileCompatibility0329,contentFingerprint,cachedFingerprint};
