'use strict';
const {app,BrowserWindow}=require('electron');
const locked=app.requestSingleInstanceLock();
if(!locked){app.quit();}else{
  app.on('second-instance',()=>{try{const w=BrowserWindow.getAllWindows().find(x=>!x.isDestroyed()&&!/OUTPUT/i.test(x.getTitle?.()||''));if(w){if(w.isMinimized())w.restore();w.show();w.focus();}}catch{}});
  const stability=require('./services/profileStability0329');
  stability.installLegacyWatcherSuppression();
  require('./bootstrap-0328');
  require('./services/profileCompatibility0329').installProfileCompatibility0329();
  require('./services/profilePerformance0329').installProfilePerformance0329();
  require('./services/profilePolicy0329').installVersion0329Profiles();
  require('./services/profileSwitchSafety0329').installProfileSwitchSafety0329();
  require('./services/profileAuditHardening0329').installProfileAuditHardening0329();
  require('./services/profileAuditFixes0329').installProfileAuditFixes0329();
  require('./services/profileFinalSafety0329').installProfileFinalSafety0329();
  require('./services/profileRegistryRuntimeFinal0329').installProfileRegistryRuntimeFinal0329();
  require('./services/profileSettingsValidation0329').installProfileSettingsValidation0329();
  require('./services/profileHealthFinal0329').installProfileHealthFinal0329();
  stability.installProfileStability0329();
  require('./services/profileDocumentStatesFinal0329').installProfileDocumentStatesFinal0329();
  require('./services/profileWatcherFinal0329').installProfileWatcherFinal0329();
}
