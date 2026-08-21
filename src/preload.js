'use strict';
const {contextBridge,ipcRenderer}=require('electron');

const invoke=(channel,...args)=>ipcRenderer.invoke(channel,...args);
const allowedEvents=new Set([
  'automation:state','automation:itemError','automation:engineError',
  'local:event','pronunciation:event','output:story','output:control','output:design','output:state'
]);

contextBridge.exposeInMainWorld('ECAPI',{
  getSettings:()=>invoke('settings:get'),
  saveSettings:s=>invoke('settings:save',s),
  loadRss:()=>invoke('rss:load'),
  testRss:f=>invoke('rss:test',f),
  fetchArticle:u=>invoke('article:fetch',u),
  testProvider:p=>invoke('providers:test',p),
  generate:(story,article)=>invoke('providers:generate',story,article),

  localStatus:()=>invoke('local:status'),
  downloadLocalModel:()=>invoke('local:downloadModel'),
  startLocal:()=>invoke('local:start'),
  stopLocal:()=>invoke('local:stop'),

  pronunciationStatus:()=>invoke('pronunciation:status'),
  downloadPronunciationModel:()=>invoke('pronunciation:downloadModel'),
  stopPronunciation:()=>invoke('pronunciation:stop'),
  testPronunciation:()=>invoke('pronunciation:test'),
  exportPronunciationLearning:()=>invoke('pronunciation:exportLearning'),
  importPronunciationLearning:()=>invoke('pronunciation:importLearning'),
  clearPronunciationLearning:()=>invoke('pronunciation:clearLearning'),

  ttsStatus:()=>invoke('tts:status'),
  generateTts:text=>invoke('tts:generate',text),

  pickFallback:()=>invoke('fallback:pick'),
  pickVerticalVideoBackground:()=>invoke('output:pickVerticalBackground'),
  clearVerticalVideoBackground:()=>invoke('output:clearVerticalBackground'),
  pickMusic:()=>invoke('output:pickMusic'),
  clearMusic:()=>invoke('output:clearMusic'),

  cannedPickFolder:()=>invoke('canned:pickFolder'),
  cannedList:()=>invoke('canned:list'),
  cannedPickAdsFolder:()=>invoke('canned:pickAdsFolder'),
  cannedListAds:()=>invoke('canned:listAds'),
  cannedLaunchNow:()=>invoke('canned:launchNow'),

  openOutput:()=>invoke('output:open'),
  closeOutput:()=>invoke('output:close'),
  outputStatus:()=>invoke('output:status'),
  sendManualOutput:p=>invoke('output:manualSend',p),
  controlOutput:a=>ipcRenderer.send('output:control',a),
  previewOutputDesign:d=>ipcRenderer.send('output:designPreview',d),
  outputPlayback:e=>ipcRenderer.send('output:playback',e),

  automationStatus:()=>invoke('automation:status'),
  processingStart:()=>invoke('automation:processingStart'),
  processingPause:()=>invoke('automation:processingPause'),
  processingResume:()=>invoke('automation:processingResume'),
  processingStop:()=>invoke('automation:processingStop'),
  emissionStart:()=>invoke('automation:emissionStart'),
  emissionPause:()=>invoke('automation:emissionPause'),
  emissionResume:()=>invoke('automation:emissionResume'),
  emissionStop:()=>invoke('automation:emissionStop'),
  clearQueue:()=>invoke('automation:clearQueue'),
  resetSessionCounters:()=>invoke('automation:resetCounters'),
  resetHistory:()=>invoke('history:reset'),
  notify:p=>ipcRenderer.send('notify',p),

  on:(channel,cb)=>{
    if(!allowedEvents.has(channel)||typeof cb!=='function')return()=>{};
    const listener=(_,payload)=>cb(payload);
    ipcRenderer.on(channel,listener);
    return()=>ipcRenderer.removeListener(channel,listener);
  }
});
