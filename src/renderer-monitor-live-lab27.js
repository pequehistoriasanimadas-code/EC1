'use strict';
(function keepLab27MonitorCompatibility(){
  // Lab.28 owns monitor refresh exclusively in renderer-lan-output.js.
  // Keep this injected asset as a harmless compatibility marker so older
  // packaged layouts do not fail if they still reference the Lab.27 file.
  window.__ecLab27MonitorProductionRefresh=true;
  window.__ecLab28MonitorUsesPrimaryController=true;
})();
