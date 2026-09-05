'use strict';
const electron=require('electron');

function installVersion0317RendererLoader(){
  const app=electron?.app;if(!app?.on||app.__ec0317RendererLoaderInstalled)return;if(!Object.isExtensible(app))return;Object.defineProperty(app,'__ec0317RendererLoaderInstalled',{value:true});
  app.on('web-contents-created',(_,contents)=>{
    if(!contents?.on)return;contents.on('did-finish-load',()=>{
      try{const url=String(contents.getURL?.()||'');if(!/control\.html(?:\?|$)/i.test(url))return;contents.executeJavaScript(`(()=>{if(window.__ec0317LoaderInjected)return;window.__ec0317LoaderInjected=true;const s=document.createElement('script');s.src='renderer-0317.js';s.onerror=()=>console.error('No se pudo cargar renderer-0317.js');document.body.appendChild(s);})()`,true).catch(()=>{});}catch{}
    });
  });
}
module.exports={installVersion0317RendererLoader};
