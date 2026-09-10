'use strict';
(function installNdiAudioTap(){
  const params=new URLSearchParams(location.search);if(params.get('ndi')!=='1')return;
  if(window.__GEC_NDI_AUDIO_TAP__)return;window.__GEC_NDI_AUDIO_TAP__='lab25';
  const start=()=>{
    if(!window.ECAPI||typeof window.ECAPI.ndiAudioChunk!=='function'){setTimeout(start,100);return;}
    const AudioCtx=window.AudioContext||window.webkitAudioContext;if(!AudioCtx)return;
    let ctx;try{ctx=new AudioCtx({sampleRate:48000,latencyHint:'interactive'});}catch{try{ctx=new AudioCtx();}catch{return;}}
    const mix=ctx.createGain(),processor=ctx.createScriptProcessor(1024,2,2),silent=ctx.createGain();silent.gain.value=0;mix.connect(processor);processor.connect(silent);silent.connect(ctx.destination);
    const attached=new WeakSet(),rows=[];
    const attach=el=>{
      if(!el||attached.has(el))return;attached.add(el);
      try{const source=ctx.createMediaElementSource(el),gain=ctx.createGain();source.connect(gain);gain.connect(mix);rows.push({el,gain});}catch{}
    };
    const scan=root=>{if(root&&root.matches&&root.matches('audio,video'))attach(root);for(const el of root&&root.querySelectorAll?root.querySelectorAll('audio,video'):[])attach(el);};
    scan(document);
    const observer=new MutationObserver(records=>{for(const r of records)for(const n of r.addedNodes)if(n.nodeType===1)scan(n);});observer.observe(document.documentElement,{childList:true,subtree:true});
    const sync=()=>{for(const row of rows){const v=row.el.muted?0:Math.max(0,Math.min(1,Number(row.el.volume)));if(Math.abs(row.gain.gain.value-v)>.001)row.gain.gain.value=v;}requestAnimationFrame(sync);};requestAnimationFrame(sync);
    processor.onaudioprocess=e=>{
      try{
        const input=e.inputBuffer,samples=input.length;if(!samples)return;
        const planar=new Float32Array(samples*2),left=input.numberOfChannels>0?input.getChannelData(0):null,right=input.numberOfChannels>1?input.getChannelData(1):left;
        if(left)planar.set(left,0);if(right)planar.set(right,samples);
        window.ECAPI.ndiAudioChunk({sampleRate:Math.round(ctx.sampleRate)||48000,channels:2,samples,data:planar.buffer});
      }catch{}
    };
    const resume=()=>{if(ctx.state!=='running')ctx.resume().catch(()=>{});};resume();setInterval(resume,1500);
    window.addEventListener('beforeunload',()=>{observer.disconnect();try{processor.disconnect();mix.disconnect();silent.disconnect();ctx.close();}catch{}},{once:true});
  };
  start();
})();
