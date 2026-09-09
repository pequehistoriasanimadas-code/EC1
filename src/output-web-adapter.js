'use strict';
(function(){
  const listeners=new Map(),params=new URLSearchParams(location.search),key=params.get('k')||'',monitor=params.get('monitor')==='1';
  const q=s=>document.querySelector(s),withKey=url=>url+(url.includes('?')?'&':'?')+'k='+encodeURIComponent(key)+(monitor?'&monitor=1':'');
  function emit(channel,payload){for(const cb of listeners.get(channel)||[])try{cb(payload);}catch{}}
  window.ECAPI={
    getSettings:async()=>{const r=await fetch(withKey('/api/settings'),{cache:'no-store'});if(!r.ok)throw new Error('No se pudo cargar el diseño');return r.json();},
    outputPlayback:e=>{if(e?.type==='error')fetch(withKey('/api/client-playback'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'error',message:String(e.message||'Error de reproducción'),monitor})}).catch(()=>{});},
    on:(channel,cb)=>{if(typeof cb!=='function')return()=>{};if(!listeners.has(channel))listeners.set(channel,new Set());listeners.get(channel).add(cb);return()=>listeners.get(channel)?.delete(cb);}
  };
  function connect(){const es=new EventSource(withKey('/events'));es.onmessage=e=>{try{const m=JSON.parse(e.data);emit(m.channel,m.payload);}catch{}};es.onerror=()=>{};window.__GEC_OUTPUT_EVENTSOURCE__=es;}
  connect();window.__GEC_OUTPUT_WEB_MODE__={monitor,key};
})();