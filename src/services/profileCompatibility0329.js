'use strict';
const fs=require('fs');
const crypto=require('crypto');
const {DocumentLibrary}=require('./documents');
const {FontManager}=require('./fonts');
const {CustomVoiceManager}=require('./customVoices');

const hashCache=new Map();
function contentFingerprint(file){try{const st=fs.statSync(file),key=`${file}|${st.size}|${Math.round(st.mtimeMs)}`,cached=hashCache.get(key);if(cached)return cached;const h=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');hashCache.set(key,h);while(hashCache.size>1200)hashCache.delete(hashCache.keys().next().value);return h;}catch{return'';}}
function installMovableDocuments(){const p=DocumentLibrary.prototype;if(p.__ec0329ContentFingerprint)return;Object.defineProperty(p,'__ec0329ContentFingerprint',{value:true});const baseScan=p.scan,baseRead=p.read;p.scan=function(folder){const r=baseScan.call(this,folder);for(const x of r.files||[]){const fp=contentFingerprint(x.path);if(fp){x.id=fp;x.fingerprint=fp;}}return r;};p.read=async function(file){const r=await baseRead.call(this,file),fp=contentFingerprint(file);return fp?{...r,fingerprint:fp}:r;};}
function installManagerCapture(){const fp=FontManager.prototype;if(!fp.__ec0329Capture){Object.defineProperty(fp,'__ec0329Capture',{value:true});const custom=fp.custom,list=fp.list;fp.custom=function(){global.__ec0329FontManager=this;return custom.call(this);};fp.list=function(...args){global.__ec0329FontManager=this;return list.apply(this,args);};}const vp=CustomVoiceManager.prototype;if(!vp.__ec0329Capture){Object.defineProperty(vp,'__ec0329Capture',{value:true});const list=vp.list,effective=vp.effectiveArchive;vp.list=function(){global.__ec0329VoiceManager=this;return list.call(this);};vp.effectiveArchive=function(){global.__ec0329VoiceManager=this;return effective.call(this);};}}
function installProfileCompatibility0329(){installMovableDocuments();installManagerCapture();}
module.exports={installProfileCompatibility0329,contentFingerprint};
