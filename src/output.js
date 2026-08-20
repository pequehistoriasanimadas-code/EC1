const viewport=document.getElementById('viewport');
const stage=document.getElementById('stage');
const storyLayer=document.getElementById('storyLayer');
const cannedLayer=document.getElementById('cannedLayer');
const cannedBg=document.getElementById('cannedBg');
const cannedVideo=document.getElementById('cannedVideo');
const img=document.getElementById('image');
const cat=document.getElementById('cat');
const pubDate=document.getElementById('pubDate');
const title=document.getElementById('title');
const summary=document.getElementById('summary');
const audio=document.getElementById('audio');
const music=document.getElementById('music');
let fallback='';
let source='none';
let activeKind='news';
let preloaded=null;
let contentSerial=0;
let suppressVideoError=false;
let loopFadeBusy=false;
let design={
  format:'16:9',fontFamily:'Arial',dateFontFamily:'Arial',titleColor:'#FFFFFF',summaryColor:'#F3F3F3',categoryBgColor:'#F7C600',categoryTextColor:'#000000',lowerBgColor:'#000000',lowerOpacity:.88,
  animation:'auto',motionSpeed:'normal',tiktokSafe:true,
  verticalVideoBackgroundUrl:'',musicUrl:'',musicEnabled:false,musicLoop:true,musicVolume:20,voiceVolume:100,cannedVolume:100,
  transitionEnabled:true,transitionType:'fade',transitionDuration:.7
};

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const clamp=(v,min,max)=>Math.max(min,Math.min(max,Number(v)||0));
const volume=v=>clamp(v,0,100)/100;
function hexRgba(hex,opacity){
  const m=String(hex||'#000').replace('#','');const h=m.length===3?m.split('').map(x=>x+x).join(''):m;const n=parseInt(h,16);
  if(Number.isNaN(n))return `rgba(0,0,0,${opacity})`;
  return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${opacity})`;
}
function formatDate(value){
  if(!value)return'';
  const d=new Date(value);if(Number.isNaN(d.getTime()))return'';
  try{return new Intl.DateTimeFormat('es-PE',{day:'2-digit',month:'short',year:'numeric'}).format(d).replace(/\./g,'').toUpperCase();}
  catch{return'';}
}
function fitStage(){
  const vertical=design.format==='9:16',w=vertical?1080:1920,h=vertical?1920:1080;
  stage.style.width=`${w}px`;stage.style.height=`${h}px`;stage.dataset.format=vertical?'9:16':'16:9';
  const scale=Math.min(window.innerWidth/w,window.innerHeight/h);
  stage.style.transform=`scale(${Math.max(.01,scale)})`;
  applyCannedBackground();
}
function restartMotion(){applyMotion();img.style.animationPlayState='running';}
function applyMotion(){
  img.className='';
  let mode=design.animation||'auto';
  if(mode==='auto'){
    const ar=(img.naturalWidth||16)/(img.naturalHeight||9);
    mode=ar<1?'vertical':ar>1.9?'horizontal':'zoom';
  }
  const cls={vertical:'motion-vertical',horizontal:'motion-horizontal',zoom:'motion-zoom',none:'motion-none'}[mode]||'motion-zoom';
  img.classList.add(cls);
  const seconds={slow:26,normal:18,fast:11}[design.motionSpeed]||18;
  stage.style.setProperty('--motion-duration',`${seconds}s`);
}
function applyCannedBackground(){
  const url=design.format==='9:16'?String(design.verticalVideoBackgroundUrl||''):'';
  cannedBg.style.backgroundImage=url?`url("${url.replace(/"/g,'%22')}")`:'none';
  cannedBg.style.backgroundColor='#000';
}
function applyVolumes(){
  audio.volume=volume(design.voiceVolume==null?100:design.voiceVolume);
  cannedVideo.volume=volume(design.cannedVolume==null?100:design.cannedVolume);
  if(!music.paused&&!loopFadeBusy)music.volume=volume(design.musicVolume==null?20:design.musicVolume);
}
function applyDesign(next={}){
  design={...design,...next};
  document.documentElement.style.setProperty('--font-family',`${design.fontFamily},sans-serif`);
  document.documentElement.style.setProperty('--date-font-family',`${design.dateFontFamily||design.fontFamily||'Arial'},sans-serif`);
  document.documentElement.style.setProperty('--title-color',design.titleColor);
  document.documentElement.style.setProperty('--summary-color',design.summaryColor);
  document.documentElement.style.setProperty('--cat-bg',design.categoryBgColor);
  document.documentElement.style.setProperty('--cat-color',design.categoryTextColor);
  document.documentElement.style.setProperty('--lower-bg',hexRgba(design.lowerBgColor,Number(design.lowerOpacity)));
  stage.dataset.safe=design.format==='9:16'&&design.tiktokSafe?'tiktok':'none';
  fitStage();applyMotion();applyVolumes();applyCannedBackground();
  if(activeKind==='news')startMusicForNews().catch(()=>{});
}
function preload(url){
  if(!url)return;
  const next=new Image();next.decoding='async';next.src=url;preloaded=next;
}
function playback(type,message=''){window.ECAPI.outputPlayback({type,source,kind:activeKind,message});}
function transitionMs(){return clamp(design.transitionDuration||.7,.2,2)*1000;}
function transitionEnabled(){return design.transitionEnabled!==false&&design.transitionType!=='none';}

function fadeMedia(media,target,ms=300){
  target=clamp(target,0,1);
  if(!media||ms<=0){if(media)media.volume=target;return Promise.resolve();}
  const from=Number(media.volume)||0;const started=performance.now();
  return new Promise(resolve=>{
    const tick=()=>{
      const p=Math.min(1,(performance.now()-started)/ms);
      media.volume=from+(target-from)*p;
      if(p>=1)return resolve();
      setTimeout(tick,40);
    };tick();
  });
}
function makeStorySnapshot(){
  if(!img.src)return null;
  const snap=document.createElement('div');snap.className='story-snapshot';snap.dataset.format=design.format;
  const shot=document.createElement('img');shot.className='snapshot-image';shot.src=img.currentSrc||img.src;
  try{shot.style.transform=getComputedStyle(img).transform;}catch{}
  const shade=document.createElement('div');shade.className='snapshot-shade';
  const lower=document.createElement('div');lower.className='snapshot-lower';
  const content=document.createElement('div');content.className='snapshot-lower-content';
  const meta=document.createElement('div');meta.className='snapshot-meta-row';
  const c=document.createElement('div');c.className='snapshot-cat';c.textContent=cat.textContent;
  const d=document.createElement('div');d.className='snapshot-date';d.textContent=pubDate.textContent;
  const t=document.createElement('div');t.className='snapshot-title';t.textContent=title.textContent;
  const s=document.createElement('div');s.className='snapshot-summary';s.textContent=summary.textContent;
  meta.append(c,d);content.append(meta,t,s);lower.append(content);snap.append(shot,shade,lower);stage.append(snap);return snap;
}
async function revealStoryFromStory(updateFn){
  if(!transitionEnabled()){await updateFn();return;}
  const snap=makeStorySnapshot();await updateFn();if(!snap)return;
  snap.style.transition=`opacity ${transitionMs()}ms ease-in-out`;snap.getBoundingClientRect();snap.style.opacity='0';
  await sleep(transitionMs());snap.remove();
}
async function crossfadeLayers(outgoing,incoming,prepareFn){
  if(!transitionEnabled()){
    await prepareFn();
    incoming.classList.remove('hidden-layer');incoming.style.opacity='1';
    if(outgoing&&outgoing!==incoming)outgoing.classList.add('hidden-layer');
    return;
  }
  await prepareFn();
  const ms=transitionMs();
  incoming.classList.remove('hidden-layer');incoming.style.opacity='0';incoming.style.transition=`opacity ${ms}ms ease-in-out`;
  if(outgoing){outgoing.style.opacity='1';outgoing.style.transition=`opacity ${ms}ms ease-in-out`;}
  incoming.getBoundingClientRect();
  incoming.style.opacity='1';if(outgoing)outgoing.style.opacity='0';
  await sleep(ms);
  if(outgoing&&outgoing!==incoming){outgoing.classList.add('hidden-layer');outgoing.style.opacity='1';outgoing.style.transition='';}
  incoming.style.transition='';incoming.style.opacity='1';
}
async function startMusicForNews(){
  const url=String(design.musicUrl||'');
  if(!design.musicEnabled||!url){music.pause();return;}
  const target=volume(design.musicVolume==null?20:design.musicVolume);
  const current=music.getAttribute('src')||'';
  if(current!==url){music.src=url;music.currentTime=0;music.load();}
  music.loop=false;
  if(music.ended){try{music.currentTime=0;}catch{}}
  if(music.paused){
    music.volume=0;
    try{await music.play();await fadeMedia(music,target,350);}catch{}
  }else if(!loopFadeBusy)music.volume=target;
}
async function stopMusicForCanned(){
  if(music.paused)return;
  try{await fadeMedia(music,0,350);}catch{}
  music.pause();
}
function clearCannedVideo(){
  suppressVideoError=true;
  try{cannedVideo.pause();cannedVideo.removeAttribute('src');cannedVideo.load();}catch{}
  setTimeout(()=>suppressVideoError=false,100);
}
function waitVideoReady(timeout=1800){
  if(cannedVideo.readyState>=2)return Promise.resolve();
  return new Promise(resolve=>{
    let done=false;
    const finish=()=>{if(done)return;done=true;clearTimeout(timer);cannedVideo.removeEventListener('loadeddata',finish);cannedVideo.removeEventListener('canplay',finish);resolve();};
    const timer=setTimeout(finish,timeout);
    cannedVideo.addEventListener('loadeddata',finish,{once:true});cannedVideo.addEventListener('canplay',finish,{once:true});
  });
}
function setStoryContent(p){
  cat.textContent=(p.category||'ACTUALIDAD').toUpperCase();
  pubDate.textContent=formatDate(p.pubDate||p.date||'');
  title.textContent=p.title||'';summary.textContent=p.summary||'';
  fallback=p.fallbackImage||'';
  const nextSrc=p.image||fallback||'';
  if(nextSrc&&preloaded&&preloaded.complete&&preloaded.src===nextSrc)img.src=preloaded.src;else img.src=nextSrc;
  preload(p.preloadImage||'');
}
async function showStory(p,serial){
  const previous=activeKind;
  if(serial!==contentSerial)return;
  if(previous==='news'){
    await revealStoryFromStory(async()=>{if(serial===contentSerial)setStoryContent(p);});
  }else{
    await crossfadeLayers(cannedLayer,storyLayer,async()=>{if(serial===contentSerial)setStoryContent(p);});
  }
  if(serial!==contentSerial)return;
  if(previous==='canned')clearCannedVideo();
  activeKind='news';stage.dataset.kind='news';
  await startMusicForNews();
  audio.volume=volume(design.voiceVolume==null?100:design.voiceVolume);
  if(p.audioUrl){
    audio.src=p.audioUrl;audio.currentTime=0;
    audio.play().catch(e=>playback('error',e.message||'Autoplay bloqueado'));
  }else playback('ended');
}
async function showCanned(p,serial){
  audio.pause();audio.currentTime=0;
  if(serial!==contentSerial)return;
  const previous=activeKind;
  if(previous==='canned'){
    await stopMusicForCanned();
    cannedLayer.style.transition=`opacity ${transitionEnabled()?transitionMs()/2:0}ms ease-in-out`;
    if(transitionEnabled()){cannedLayer.style.opacity='0';await sleep(transitionMs()/2);}
    suppressVideoError=true;cannedVideo.src=p.videoUrl||'';cannedVideo.volume=volume(design.cannedVolume==null?100:design.cannedVolume);cannedVideo.load();await waitVideoReady();suppressVideoError=false;
    applyCannedBackground();cannedLayer.classList.remove('hidden-layer');cannedLayer.style.opacity='1';
    if(transitionEnabled())await sleep(transitionMs()/2);
    cannedLayer.style.transition='';
  }else{
    suppressVideoError=true;cannedVideo.src=p.videoUrl||'';cannedVideo.volume=volume(design.cannedVolume==null?100:design.cannedVolume);cannedVideo.load();await waitVideoReady();suppressVideoError=false;
    if(serial!==contentSerial)return;
    await Promise.all([
      stopMusicForCanned(),
      crossfadeLayers(storyLayer,cannedLayer,async()=>{applyCannedBackground();})
    ]);
  }
  if(serial!==contentSerial)return;
  activeKind='canned';stage.dataset.kind='canned';
  cannedVideo.play().catch(e=>playback('error',e.message||'No se pudo reproducir el enlatado'));
}

img.addEventListener('load',restartMotion);
img.addEventListener('error',()=>{if(fallback&&img.src!==fallback)img.src=fallback;});
audio.addEventListener('ended',()=>{if(activeKind==='news')playback('ended');});
audio.addEventListener('error',()=>{if(activeKind==='news'&&audio.src)playback('error','No se pudo cargar el audio');});
cannedVideo.addEventListener('ended',()=>{if(activeKind==='canned')playback('ended');});
cannedVideo.addEventListener('error',()=>{if(!suppressVideoError&&activeKind==='canned')playback('error','No se pudo cargar el video enlatado');});
music.addEventListener('timeupdate',async()=>{
  if(loopFadeBusy||activeKind!=='news'||!design.musicEnabled||!design.musicLoop||!Number.isFinite(music.duration)||music.duration<2)return;
  const remain=music.duration-music.currentTime;
  if(remain>0&&remain<0.8){
    loopFadeBusy=true;
    try{
      await fadeMedia(music,0,Math.max(200,Math.min(650,remain*1000)));
      if(activeKind==='news'&&design.musicEnabled&&design.musicLoop){
        music.currentTime=0;music.volume=0;await music.play();await fadeMedia(music,volume(design.musicVolume==null?20:design.musicVolume),350);
      }
    }catch{}finally{loopFadeBusy=false;}
  }
});
window.addEventListener('resize',fitStage);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)restartMotion();});

window.ECAPI.on('output:design',d=>applyDesign(d||{}));
window.ECAPI.on('output:story',p=>{
  source=p.source||'none';
  if(p.design)applyDesign(p.design);
  const serial=++contentSerial;
  if((p.kind||'news')==='canned')showCanned(p,serial).catch(e=>playback('error',e.message||String(e)));
  else showStory(p,serial).catch(e=>playback('error',e.message||String(e)));
});
window.ECAPI.on('output:control',a=>{
  if(a==='play'){
    if(activeKind==='canned')cannedVideo.play().catch(e=>playback('error',e.message||'No se pudo reproducir'));
    else{audio.play().catch(e=>playback('error',e.message||'No se pudo reproducir'));startMusicForNews().catch(()=>{});}
  }
  if(a==='pause'){
    if(activeKind==='canned')cannedVideo.pause();else audio.pause();
    music.pause();
  }
  if(a==='stop'){
    audio.pause();audio.currentTime=0;cannedVideo.pause();music.pause();
  }
  img.style.animationPlayState=a==='pause'||a==='stop'?'paused':'running';
});

(async()=>{try{const s=await window.ECAPI.getSettings();applyDesign(s.visual?.output||{});}catch{applyDesign({});}})();
