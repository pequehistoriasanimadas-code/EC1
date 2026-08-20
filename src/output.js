const viewport=document.getElementById('viewport');
const stage=document.getElementById('stage');
const storyLayer=document.getElementById('storyLayer');
const cannedLayer=document.getElementById('cannedLayer');
const cannedBg=document.getElementById('cannedBg');
const cannedVideo=document.getElementById('cannedVideo');
const img=document.getElementById('image');
const cat=document.getElementById('cat');
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
let design={
  format:'16:9',fontFamily:'Arial',titleColor:'#FFFFFF',summaryColor:'#F3F3F3',categoryBgColor:'#F7C600',categoryTextColor:'#000000',lowerBgColor:'#000000',lowerOpacity:.88,
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
  if(!music.paused)music.volume=volume(design.musicVolume==null?20:design.musicVolume);
}
function applyDesign(next={}){
  design={...design,...next};
  document.documentElement.style.setProperty('--font-family',`${design.fontFamily},sans-serif`);
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
async function transitionSwap(fn){
  const enabled=design.transitionEnabled!==false&&design.transitionType!=='none';
  const total=clamp(design.transitionDuration||.7,.2,2)*1000;
  if(!enabled){await fn();stage.style.opacity='1';return;}
  const half=total/2;
  stage.style.transition=`opacity ${half}ms ease-in-out`;
  stage.style.opacity='0';
  await sleep(half);
  await fn();
  stage.getBoundingClientRect();
  stage.style.opacity='1';
  await sleep(half);
}
async function startMusicForNews(){
  const url=String(design.musicUrl||'');
  if(!design.musicEnabled||!url){music.pause();return;}
  if(music.src!==url){music.src=url;music.currentTime=0;music.load();}
  music.loop=design.musicLoop!==false;
  if(music.ended){try{music.currentTime=0;}catch{}}
  const target=volume(design.musicVolume==null?20:design.musicVolume);
  if(music.paused){
    music.volume=0;
    try{await music.play();await fadeMedia(music,target,350);}catch{}
  }else music.volume=target;
}
async function stopMusicForCanned(){
  if(music.paused)return;
  try{await fadeMedia(music,0,300);}catch{}
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
async function showStory(p,serial){
  await stopMusicForCanned();
  if(serial!==contentSerial)return;
  await transitionSwap(async()=>{
    if(serial!==contentSerial)return;
    clearCannedVideo();
    cannedLayer.classList.add('hidden-layer');storyLayer.classList.remove('hidden-layer');
    activeKind='news';stage.dataset.kind='news';
    cat.textContent=(p.category||'ACTUALIDAD').toUpperCase();title.textContent=p.title||'';summary.textContent=p.summary||'';
    fallback=p.fallbackImage||'';
    const nextSrc=p.image||fallback||'';
    if(nextSrc&&preloaded&&preloaded.complete&&preloaded.src===nextSrc)img.src=preloaded.src;else img.src=nextSrc;
    preload(p.preloadImage||'');
  });
  if(serial!==contentSerial)return;
  await startMusicForNews();
  audio.volume=volume(design.voiceVolume==null?100:design.voiceVolume);
  if(p.audioUrl){
    audio.src=p.audioUrl;audio.currentTime=0;
    audio.play().catch(e=>playback('error',e.message||'Autoplay bloqueado'));
  }else playback('ended');
}
async function showCanned(p,serial){
  audio.pause();audio.currentTime=0;
  await stopMusicForCanned();
  if(serial!==contentSerial)return;
  suppressVideoError=true;
  cannedVideo.src=p.videoUrl||'';cannedVideo.volume=volume(design.cannedVolume==null?100:design.cannedVolume);cannedVideo.load();
  await waitVideoReady();
  suppressVideoError=false;
  if(serial!==contentSerial)return;
  await transitionSwap(async()=>{
    if(serial!==contentSerial)return;
    activeKind='canned';stage.dataset.kind='canned';
    applyCannedBackground();storyLayer.classList.add('hidden-layer');cannedLayer.classList.remove('hidden-layer');
  });
  if(serial!==contentSerial)return;
  cannedVideo.play().catch(e=>playback('error',e.message||'No se pudo reproducir el enlatado'));
}

img.addEventListener('load',restartMotion);
img.addEventListener('error',()=>{if(fallback&&img.src!==fallback)img.src=fallback;});
audio.addEventListener('ended',()=>{if(activeKind==='news')playback('ended');});
audio.addEventListener('error',()=>{if(activeKind==='news'&&audio.src)playback('error','No se pudo cargar el audio');});
cannedVideo.addEventListener('ended',()=>{if(activeKind==='canned')playback('ended');});
cannedVideo.addEventListener('error',()=>{if(!suppressVideoError&&activeKind==='canned')playback('error','No se pudo cargar el video enlatado');});
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
