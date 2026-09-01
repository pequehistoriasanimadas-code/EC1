'use strict';
const fs=require('fs');
const path=require('path');
const {app,ipcMain}=require('electron');
const {SettingsStore}=require('./settings');
const {FontManager}=require('./fonts');
const {CustomVoiceManager}=require('./customVoices');
const {getProfileManager,composeSettings}=require('./profileManager0329');
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function dataRoot(){const portable=process.env.PORTABLE_EXECUTABLE_DIR;if(portable)return path.join(portable,'EC Automatic News Data');if(app.isPackaged)return path.join(path.dirname(process.execPath),'EC Automatic News Data');return path.join(app.getPath('userData'),'EC Automatic News Data');}
function countRecursive(root,exts,limit=2000){let count=0;const walk=(dir,depth=0)=>{if(depth>5||count>=limit)return;let entries=[];try{entries=fs.readdirSync(dir,{withFileTypes:true});}catch{return;}for(const e of entries){if(count>=limit)break;const full=path.join(dir,e.name);if(e.isDirectory())walk(full,depth+1);else if(e.isFile()&&(!exts.length||exts.includes(path.extname(e.name).toLowerCase())))count++;}};walk(root);return count;}
async function profileHealth(id){if(!UUID_RE.test(String(id||'')))throw new Error('Perfil no encontrado');const m=getProfileManager(dataRoot()),meta=m.list().find(x=>x.id===id);if(!meta)throw new Error('Perfil no encontrado');const defaults=new SettingsStore(dataRoot()).defaults(),profile=m.readProfileSettings(id),global=m.globalSettings(defaults),s=composeSettings(defaults,global,profile),checks=[];
  const folder=async(type,value,exts)=>{const v=String(value||'').trim();if(!v)return checks.push({type,status:'unset',path:''});try{const st=await Promise.race([fs.promises.stat(v),new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),1800))]);if(!st.isDirectory())throw new Error('not-dir');checks.push({type,status:'ok',path:v,count:countRecursive(v,exts)});}catch{checks.push({type,status:'missing',path:v});}};await folder('content',s.canned?.folder,['.mp4','.m4v','.webm','.mov']);await folder('ads',s.canned?.adsFolder,['.mp4','.m4v','.webm','.mov']);await folder('documents',s.documents?.folder,['.txt','.docx']);
  for(const [type,v] of [['fallback',s.visual?.fallbackImage],['music',s.visual?.output?.musicFile],['verticalBackground',s.visual?.output?.verticalVideoBackground]])if(v)checks.push({type,status:fs.existsSync(v)?'ok':'missing',path:v});
  const voice=String(s.tts?.voice||'');if(voice.startsWith('ecv_')){let ok=false;try{ok=new CustomVoiceManager({resourcesDir:app.isPackaged?process.resourcesPath:path.join(__dirname,'..','..'),dataDir:dataRoot()}).has(voice);}catch{}checks.push({type:'voice',status:ok?'ok':'missing',id:voice});}
  const families=new Set(Object.entries(s.visual?.output||{}).filter(([k])=>/FontFamily$/.test(k)||k==='fontFamily').map(([,v])=>String(v||'')).filter(Boolean));if(families.size){try{const listed=await new FontManager(dataRoot()).list(),available=new Set([...(listed.installed||[]),...(listed.custom||[]).map(x=>x.family)]);for(const family of families)if(!available.has(family))checks.push({type:'font',status:'missing',name:family});}catch{}}
  const primary=String(s.ai?.primary||'local');if(primary==='claude'&&!s.ai?.claudeKeyEnc)checks.push({type:'provider',provider:'claude',status:'missing'});if(primary==='gemini'&&!s.ai?.geminiKeyEnc)checks.push({type:'provider',provider:'gemini',status:'missing'});
  return{profileId:id,ok:checks.every(x=>x.status!=='missing'),checks};}
function installProfileHealthFinal0329(){try{ipcMain.removeHandler('profiles:health');}catch{}ipcMain.handle('profiles:health',(_,id)=>profileHealth(String(id||'')));}
module.exports={installProfileHealthFinal0329,profileHealth};
