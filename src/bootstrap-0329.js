'use strict';
const {app,BrowserWindow}=require('electron');
const locked=app.requestSingleInstanceLock();
if(!locked){app.quit();}else{
  app.on('second-instance',()=>{try{const w=BrowserWindow.getAllWindows().find(x=>!x.isDestroyed()&&!/OUTPUT/i.test(x.getTitle?.()||''));if(w){if(w.isMinimized())w.restore();w.show();w.focus();}}catch{}});
  require('./bootstrap-0328');
  require('./services/profileCompatibility0329').installProfileCompatibility0329();
  require('./services/profilePolicy0329').installVersion0329Profiles();
  require('./services/profileSwitchSafety0329').installProfileSwitchSafety0329();
}
