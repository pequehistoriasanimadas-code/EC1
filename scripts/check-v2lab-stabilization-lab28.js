'use strict';
const {spawnSync}=require('child_process');
const path=require('path');

const checks=[
  'check-v2lab-profile-compat.js',
  'check-v2lab-runtime-isolation.js',
  'check-v2lab-long-session.js',
  'check-v2lab-responsive.js',
  'check-v2lab-monitor-production.js',
  'check-v2lab-youtube-promo.js',
  'check-v2lab-lab29-youtube-monitor.js',
  'check-v2lab-emission-layout.js',
  'check-v2lab-emission-design-v2.js',
  'check-v2lab-manual-content-selection.js',
  'check-v2lab-network-permissions.js',
  'check-v2lab-lan-output.js',
  'check-v2lab-ndi.js',
  'check-v2lab-production-fidelity.js',
  'check-v2lab-pipeline.js',
  'check-v2lab-regression-matrix.js',
  'check-v2lab-hardening.js',
  'check-v2lab-voice-consistency.js',
  'check-v2lab-latam-only.js',
  'check-v2lab-qwen-speed.js',
  'check-v2lab-qwen-finetuned.js'
];

for(const file of checks){
  const p=spawnSync(process.execPath,[path.join(__dirname,file)],{stdio:'inherit'});
  if(p.status!==0)process.exit(p.status||1);
}
console.log('V2 Lab stabilization gate: OK');
