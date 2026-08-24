'use strict';
const electron=require('electron');
require('./version0319SafetyPolicy').installVersion0319SafetyPolicy();
require('./version0320Policy').installVersion0320Policy();

function installVersion0319RendererLoader(){
  const app=electron?.app;if(!app?.on||app.__ec0319RendererLoaderInstalled)return;if(!Object.isExtensible(app))return;Object.defineProperty(app,'__ec0319RendererLoaderInstalled',{value:true});
  app.on('web-contents-created',(_,contents)=>{
    if(!contents?.on)return;contents.on('did-finish-load',()=>{
      try{const url=String(contents.getURL?.()||'');if(!/control\.html(?:\?|$)/i.test(url))return;contents.executeJavaScript(`(()=>{if(window.__ec0319LoaderInjected)return;window.__ec0319LoaderInjected=true;const s=document.createElement('script');s.src='renderer-0319.js';s.onerror=()=>console.error('No se pudo cargar renderer-0319.js');s.onload=()=>{if(window.__ec0320LoaderInjected)return;window.__ec0320LoaderInjected=true;const n=document.createElement('script');n.src='renderer-0320.js';n.onerror=()=>console.error('No se pudo cargar renderer-0320.js');document.body.appendChild(n);};document.body.appendChild(s);})()`,true).catch(()=>{});}catch{}
    });
  });
}
module.exports={installVersion0319RendererLoader};
