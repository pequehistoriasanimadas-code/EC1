'use strict';
const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const http=require('http');
const {pathToFileURL}=require('url');
const {OutputLanServer}=require('../src/services/outputLanServer');

function req(url,opts={}){return new Promise((resolve,reject)=>{const u=new URL(url),r=http.request({hostname:u.hostname,port:u.port,path:u.pathname+u.search,method:opts.method||'GET',headers:opts.headers||{}},res=>{const chunks=[];res.on('data',d=>chunks.push(d));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));});r.on('error',reject);if(opts.body)r.write(opts.body);r.end();});}
(async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gec-lan-check-')),media=path.join(tmp,'sample.mp4');fs.writeFileSync(media,Buffer.from('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'));
 const design={format:'16:9',standbyVideoUrl:pathToFileURL(media).href,musicEnabled:false,customFonts:[]};
 const server=new OutputLanServer({srcDir:path.join(__dirname,'../src'),dataDir:tmp,getDesign:()=>design});
 server.config.enabled=false;server.config.port=0;await server.start();
 const st=server.status();assert(st.localUrl.includes('/output?monitor=1'),'monitor local URL missing');assert.equal(st.lanUrl,'','LAN URL must stay hidden while disabled');
 const html=await req(st.localUrl);assert.equal(html.status,200);assert(html.body.toString().includes('output-web-adapter.js'));assert(html.body.toString().includes('output-0331.js'));
 const registered=server.register(pathToFileURL(media).href);assert(registered.startsWith('/asset/'));assert(!registered.includes(tmp),'LAN URL must not expose local filesystem path');
 const assetUrl=`http://127.0.0.1:${st.actualPort}${registered}`,range=await req(assetUrl,{headers:{Range:'bytes=5-9'}});assert.equal(range.status,206);assert.equal(range.body.toString(),'56789');assert.equal(range.headers['accept-ranges'],'bytes');
 assert.equal(server.allow({socket:{remoteAddress:'192.168.1.55'}},new URL('/output','http://local')),false,'remote client must be rejected while LAN disabled');
 server.config.enabled=true;assert.equal(server.allow({socket:{remoteAddress:'192.168.1.55'}},new URL('/output?x=1','http://local')),false,'remote output requires key');
 assert.equal(server.allow({socket:{remoteAddress:'192.168.1.55'}},new URL('/output?k='+encodeURIComponent(server.config.key),'http://local')),true,'keyed remote output should be allowed');
 assert.equal(server.allow({socket:{remoteAddress:'192.168.1.55'}},new URL('/output.js','http://local')),true,'static renderer files may load after keyed output page');
 server.config.enabled=false;
 const webDesign=server.publishDesign(design);assert(webDesign.standbyVideoUrl.startsWith('/asset/'));
 const p=server.publishStory({source:'automatic',kind:'canned',mediaRole:'ad',title:'Spot',videoUrl:pathToFileURL(media).href});assert(p.payload.videoUrl.startsWith('/asset/'));assert.equal(server.currentProgram.id,p.id);
 server.updateMasterPlayback({source:'automatic',type:'progress',currentSec:12.5,durationSec:30});assert.equal(server.masterProgress.currentSec,12.5);
 server.publishControl('pause');assert.equal(server.currentProgram.paused,true);server.publishControl('play');assert.equal(server.currentProgram.paused,false);
 await server.stop(false);

 const main=fs.readFileSync(path.join(__dirname,'../src/main.js'),'utf8'),preload=fs.readFileSync(path.join(__dirname,'../src/preload.js'),'utf8'),renderer=fs.readFileSync(path.join(__dirname,'../src/renderer-lan-output.js'),'utf8'),web=fs.readFileSync(path.join(__dirname,'../src/output-web-adapter.js'),'utf8'),mode=fs.readFileSync(path.join(__dirname,'../src/output-web-mode.js'),'utf8'),out26=fs.readFileSync(path.join(__dirname,'../src/output-0326.js'),'utf8'),outBase=fs.readFileSync(path.join(__dirname,'../src/output.js'),'utf8');
 assert(main.includes("createOutputWindow(false)"),'automatic emission must create hidden master output');
 assert(main.includes("setAudioMuted(true)")||main.includes("setAudioMuted(!show)"),'hidden master must be muted, not paused');
 assert(!main.includes("outputWindow=null;automation?.outputClosed()"),'hiding local output must not pause automation');
 assert(main.includes("outputLan?.publishStory(enriched)"),'same program must be fanned out to LAN');
 assert(main.includes("outputLan?.publishControl(action)"),'pause/play/stop must fan out to LAN spectators');
 assert(main.includes("outputLan?.updateMasterPlayback(event)"),'master progress must drive reconnection timing');
 assert(preload.includes('outputLanStatus')&&preload.includes('outputLanConfigure'),'LAN IPC bridge missing');
 assert(renderer.includes('Monitor de emisión')&&renderer.includes('Output por red local'),'monitor/LAN UI missing');
 assert(renderer.includes('function ensureMonitorFrame()')&&renderer.includes("window.addEventListener('load'")&&renderer.includes("document.readyState==='complete'"),'monitor iframe debe montarse después del load principal para no bloquear CONTROL_READY');
 assert(renderer.includes('una sola')||renderer.includes('este único enlace'),'UI must expose one LAN link');
 assert(web.includes("outputPlayback:e=>{if(e?.type==='error')"),'web viewer must never report ended/progress into master queue');
 assert(mode.includes("let muted=monitor"),'monitor audio must default to muted');
 assert(mode.includes("muted=!muted"),'monitor must allow local audio toggle');
 assert(out26.includes('p.startAtSec')&&outBase.includes('p.startAtSec'),'LAN reconnect must seek news and videos');
 console.log('check-v2lab-lan-output: OK · one LAN link · audio · local monitor mute toggle · hidden master · range streaming · no double queue authority');
})().catch(e=>{console.error(e);process.exit(1);});
