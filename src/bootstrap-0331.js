'use strict';
const {app}=require('electron');
try{app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');}catch{}
require('./bootstrap-0330');
require('./services/release0331').installRelease0331();
require('./services/release0331Hotfix').installRelease0331Hotfix();
