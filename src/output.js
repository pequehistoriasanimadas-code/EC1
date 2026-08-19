const img=document.getElementById('image'),cat=document.getElementById('cat'),title=document.getElementById('title'),summary=document.getElementById('summary'),audio=document.getElementById('audio');
let fallback='';
function motion(){img.className='';const ar=(img.naturalWidth||16)/(img.naturalHeight||9);img.classList.add(ar<1?'vertical':ar>1.9?'wide':'normal');}
img.addEventListener('load',motion);img.addEventListener('error',()=>{if(fallback&&img.src!==fallback)img.src=fallback;});
audio.addEventListener('ended',()=>window.ECAPI.outputEnded());
window.ECAPI.on('output:story',p=>{cat.textContent=(p.category||'ACTUALIDAD').toUpperCase();title.textContent=p.title||'';summary.textContent=p.summary||'';fallback=p.fallbackImage||'';img.src=p.image||fallback||'';if(p.audioUrl){audio.src=p.audioUrl;audio.currentTime=0;audio.play().catch(()=>{});}});
window.ECAPI.on('output:control',a=>{if(a==='play')audio.play().catch(()=>{});if(a==='pause')audio.pause();if(a==='stop'){audio.pause();audio.currentTime=0;}img.style.animationPlayState=a==='pause'||a==='stop'?'paused':'running';});
