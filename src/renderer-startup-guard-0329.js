'use strict';
(function installStartupGuard0329(){
  if(window.__ec0329StartupGuardInstalled)return;
  window.__ec0329StartupGuardInstalled=true;
  // renderer-patches.js only opens the legacy migration alert when this flag is false.
  // Mark it handled before that legacy layer runs; keep normal window.alert untouched.
  window.__ec0316MigrationNoticeShown=true;
})();
