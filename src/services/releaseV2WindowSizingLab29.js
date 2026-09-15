'use strict';
const {app,screen}=require('electron');
let installed=false;
const TARGET_WIDTH=1700,TARGET_HEIGHT=1000,MIN_WIDTH=1100,MIN_HEIGHT=720,WORK_MARGIN=48;

function isControlWindow(win){
  try{return !!win&&!win.isDestroyed()&&String(win.getTitle?.()||'')==='EC Automatic News';}catch{return false;}
}
function fit(value,target,min){
  const available=Math.max(1,Number(value)||0);
  return Math.max(Math.min(min,available),Math.min(target,Math.max(1,available-WORK_MARGIN)));
}
function sizeControlWindow(win){
  if(!isControlWindow(win))return false;
  try{
    const display=screen.getDisplayMatching(win.getBounds())||screen.getPrimaryDisplay();
    const workArea=display?.workArea;if(!workArea)return false;
    const width=Math.round(fit(workArea.width,TARGET_WIDTH,MIN_WIDTH));
    const height=Math.round(fit(workArea.height,TARGET_HEIGHT,MIN_HEIGHT));
    const x=Math.round(workArea.x+(workArea.width-width)/2);
    const y=Math.round(workArea.y+(workArea.height-height)/2);
    win.setBounds({x,y,width,height},false);
    return true;
  }catch{return false;}
}
function installReleaseV2WindowSizingLab29(){
  if(installed)return;installed=true;
  app.on('browser-window-created',(_,win)=>{
    if(sizeControlWindow(win))return;
    // El título del control se define al crearlo; un reintento corto cubre hosts que lo actualicen después del evento.
    setTimeout(()=>sizeControlWindow(win),80);
  });
}
module.exports={installReleaseV2WindowSizingLab29,sizeControlWindow};
