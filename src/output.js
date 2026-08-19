const viewport=document.getElementById('viewport');
const stage=document.getElementById('stage');
const img=document.getElementById('image');
const cat=document.getElementById('cat');
const title=document.getElementById('title');
const summary=document.getElementById('summary');
const audio=document.getElementById('audio');
let fallback='';
let source='none';
let design={format:'16:9',fontFamily:'Arial',titleColor:'#FFFFFF',summaryColor:'#F3F3F3',categoryBgColor:'#F7C600',categoryTextColor:'#000000',lowerBgColor:'#000000',lowerOpacity:.88,animation:'auto',motionSpeed:'normal',tiktokSafe:true};

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
}
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
function applyDesign(next={}){
  design={...design,...next};
  document.documentElement.style.setProperty('--font-family',`${design.fontFamily},sans-serif`);
  document.documentElement.style.setProperty('--title-color',design.titleColor);
  document.documentElement.style.setProperty('--summary-color',design.summaryColor);
  document.documentElement.style.setProperty('--cat-bg',design.categoryBgColor);
  document.documentElement.style.setProperty('--cat-color',design.categoryTextColor);
  document.documentElement.style.setProperty('--lower-bg',hexRgba(design.lowerBgColor,Number(design.lowerOpacity)));
  stage.dataset.safe=design.format==='9:16'&&design.tiktokSafe?'tiktok':'none';
  fitStage();applyMotion();
}
function playback(type,message=''){window.ECAPI.outputPlayback({type,source,message});}
img.addEventListener('load',applyMotion);
img.addEventListener('error',()=>{if(fallback&&img.src!==fallback)img.src=fallback;});
audio.addEventListener('ended',()=>playback('ended'));
audio.addEventListener('error',()=>{if(audio.src)playback('error','No se pudo cargar el audio');});
window.addEventListener('resize',fitStage);

window.ECAPI.on('output:design',d=>applyDesign(d||{}));
window.ECAPI.on('output:story',p=>{
  source=p.source||'none';
  if(p.design)applyDesign(p.design);
  cat.textContent=(p.category||'ACTUALIDAD').toUpperCase();title.textContent=p.title||'';summary.textContent=p.summary||'';
  fallback=p.fallbackImage||'';img.src=p.image||fallback||'';
  if(p.audioUrl){
    audio.src=p.audioUrl;audio.currentTime=0;
    audio.play().catch(e=>playback('error',e.message||'Autoplay bloqueado'));
  } else playback('ended');
});
window.ECAPI.on('output:control',a=>{
  if(a==='play')audio.play().catch(e=>playback('error',e.message||'No se pudo reproducir'));
  if(a==='pause')audio.pause();
  if(a==='stop'){audio.pause();audio.currentTime=0;}
  img.style.animationPlayState=a==='pause'||a==='stop'?'paused':'running';
});

(async()=>{try{const s=await window.ECAPI.getSettings();applyDesign(s.visual?.output||{});}catch{applyDesign({});}})();
