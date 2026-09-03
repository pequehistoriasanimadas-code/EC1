'use strict';
const fs=require('fs');
const path=require('path');
const {app}=require('electron');
const base=process.env.PORTABLE_EXECUTABLE_DIR||(!app.isPackaged?path.join(__dirname,'..'):path.dirname(process.execPath));
const labBase=path.join(base,'GEC V2 TTS Lab');
try{fs.mkdirSync(labBase,{recursive:true});}catch{}
process.env.PORTABLE_EXECUTABLE_DIR=labBase;
process.env.GEC_V2_TTS_LAB='1';
require('./bootstrap-0331');
require('./services/releaseV2Lab').installReleaseV2Lab();
require('./services/releaseV2Optimization').installV2Optimization();
