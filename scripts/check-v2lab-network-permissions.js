'use strict';
const fs=require('fs');
const path=require('path');
const root=path.join(__dirname,'..');
let failed=0;
function fail(msg){failed++;console.error('FAIL:',msg);}
function ok(cond,msg){if(!cond)fail(msg);else console.log('OK:',msg);}
function read(rel){const file=path.join(root,rel);if(!fs.existsSync(file)){fail(`missing ${rel}`);return'';}return fs.readFileSync(file,'utf8');}

const helper=read('src/native/network_permissions.cpp');
ok(helper.includes('GEC Automatic News - NDI Bridge'),'helper owns exact NDI firewall rule');
ok(helper.includes('GEC Automatic News - Output LAN'),'helper owns exact LAN firewall rule');
ok(helper.includes('LocalSubnet'),'firewall rules are limited to LocalSubnet');
ok(helper.includes('NET_FW_PROFILE2_DOMAIN')&&helper.includes('NET_FW_PROFILE2_PRIVATE'),'helper limits automatic rules to Domain/Private profiles');
ok(helper.includes('--status')&&helper.includes('--configure')&&helper.includes('--self-test'),'helper exposes status/configure/self-test modes');
ok(/TokenElevation|isElevated|IsElevated/.test(helper),'configure path validates an elevated token');
ok(!/\bsystem\s*\(|\bWinExec\s*\(/.test(helper),'native helper does not run arbitrary shell commands');

const outputNdi=read('src/services/outputNdi.js');
ok(outputNdi.includes('stableBridgePath')&&outputNdi.includes('deployStableBridge'),'NDI service exposes stable bridge deployment');
ok(outputNdi.includes('LOCALAPPDATA')&&outputNdi.includes('EC Automatic News')&&outputNdi.includes('Network'),'stable NDI bridge is deployed under LocalAppData/EC Automatic News/Network');
ok(outputNdi.includes('bundledBridgePath')||outputNdi.includes("runtime','ndi','gec-ndi-bridge.exe"),'bundled NDI bridge remains available as fallback');

const net=read('src/services/networkPermissions.js');
ok(net.includes('Start-Process')&&net.includes('-Verb RunAs'),'network service requests elevation through Windows runas');
ok(net.includes('windowsHide:true'),'elevation orchestration does not open a visible console');
ok(net.includes('status()')||net.includes('async status('),'network service exposes non-elevated status');
ok(net.includes('configure()')||net.includes('async configure('),'network service exposes one configure operation');
ok(net.includes('classifyElevationFailure'),'Lab.28 classifies cancellation separately from policy/elevation blocks');
ok(/policyManaged|policy-blocked/.test(net),'Lab.28 reports policy-managed elevation failures explicitly');
ok(!/password|contrase(?:n|ñ)a/i.test(net),'network service does not handle administrator passwords');

const release=read('src/services/releaseV2NetworkPermissions.js');
ok(release.includes("ipcMain.handle('output:networkPermissionsStatus'"),'V2 release registers network permission status IPC');
ok(release.includes("ipcMain.handle('output:networkPermissionsConfigure'"),'V2 release registers network permission configure IPC');
ok(release.includes('output-lan.json'),'network permission status follows the configured Output LAN port');

const bootstrap=read('src/bootstrap-v2lab.js');
ok(bootstrap.includes('releaseV2NetworkPermissions'),'V2 bootstrap installs network permissions integration');

const preload=read('src/preload.js');
ok(preload.includes('outputNetworkPermissionsStatus'),'preload exposes read-only network permission status');
ok(preload.includes('configureOutputNetworkPermissions'),'preload exposes one configure action');

const renderer=read('src/renderer-lan-output.js');
const lab28Renderer=read('src/renderer-stabilization-lab28.js');
ok(renderer.includes('Permisos de red'),'Emisión UI includes network permissions card');
ok(renderer.includes('Configurar permisos de red'),'UI has the single combined configure action');
ok(renderer.includes('ecNetworkPermissionsConfigure'),'combined configure button has a stable id');
ok(!/type=["']password["']/i.test(renderer+lab28Renderer),'renderer contains no administrator credential field');
ok(renderer.includes('refreshNetworkPermissions'),'renderer can refresh permission state');
ok(/async function applyLan\([\s\S]*?refreshNetworkPermissions\(\)/.test(renderer),'changing Output LAN configuration refreshes firewall permission status');
ok(lab28Renderer.includes('SOLICITANDO')&&lab28Renderer.includes('Esperando a Windows'),'Lab.28 gives immediate visible feedback while UAC/elevation is pending');
ok(lab28Renderer.includes('política')||lab28Renderer.includes('organización'),'Lab.28 explains policy-managed UAC blocking to the operator');

const css=read('src/control-lan-output.css');
ok(css.includes('ec-network-permissions'),'network permission card has dedicated compact styling');

const pkgText=read('package.json');
let pkg={};try{pkg=JSON.parse(pkgText);}catch(e){fail('package.json parses: '+e.message);}
ok(pkg?.build?.portable?.requestExecutionLevel==='user','Portable continues to run as a normal user');
ok(String(pkg?.scripts?.check||'').includes('check-v2lab-network-permissions.js'),'npm check gates the network permission regression check');
ok((pkg?.build?.files||[]).includes('scripts/packaged-v2lab-network-permissions-smoke.js'),'packaged smoke script is included');

const workflow=read('.github/workflows/build-windows.yml');
ok(workflow.includes('network_permissions.cpp')&&workflow.includes('gec-network-permissions.exe'),'Windows workflow compiles the network permission helper');
ok(workflow.includes('gec-network-permissions.exe --self-test')||workflow.includes('& $helper --self-test'),'Windows workflow self-tests helper without changing firewall state');
ok(!workflow.includes('gec-network-permissions.exe --configure'),'CI workflow never executes firewall configuration');

const smoke=read('scripts/packaged-v2lab-network-permissions-smoke.js');
ok(smoke.includes('gec-network-permissions.exe'),'packaged smoke verifies helper presence');
ok(smoke.includes('--self-test'),'packaged smoke runs non-destructive self-test');
ok(!smoke.includes('--configure'),'packaged smoke never changes firewall rules');

if(failed){console.error(`\n${failed} network permission check(s) failed.`);process.exit(1);}console.log('\nNetwork permission regression checks passed.');