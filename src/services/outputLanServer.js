'use strict';
const http=require('http');
const fs=require('fs');
const path=require('path');
const os=require('os');
const crypto=require('crypto');
const {fileURLToPath}=require('url');

const STATIC_FILES=new Set([
  'output-web.html','output-web-adapter.js','output-web-mode.js','output-web-mode.css',
  'output.css','output-0324.css','output-0325.css','output-0331.css',
  'output.js','output-0324.js','output-0325.js','output-0326.js','output-0328.js','output-0331.js'
]);
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.mp3':'audio/mpeg','.wav':'audio/wav','.m4a':'audio/mp4','.aac':'audio/aac','.mp4':'video/mp4','.m4v':'video/mp4','.mov':'video/quicktime','.webm':'video/webm','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.gif':'image/gif','.svg':'image/svg+xml','.ttf':'font/ttf','.otf':'font/otf','.woff':'font/woff','.woff2':'font/woff2'};
function isLoopback(addr=''){const x=String(addr||'').replace(/^::ffff:/,'');return x==='127.0.0.1'||x==='::1'||x==='localhost';}
function localIPv4(){const nets=os.networkInterfaces(),rows=[];for(const list of Object.values(nets))for(const x of list||[]){if(x.family!=='IPv4'||x.internal)continue;const a=String(x.address||'');const privateIp=/^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(a);rows.push({a,privateIp});}return(rows.find(x=>x.privateIp)||rows[0]||{}).a||'127.0.0.1';}
function safeJson(file,fallback){try{const v=JSON.parse(fs.readFileSync(file,'utf8'));return v&&typeof v==='object'?v:fallback;}catch{return fallback;}}
function atomicJson(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value,null,2),'utf8');try{fs.renameSync(tmp,file);}catch{fs.copyFileSync(tmp,file);try{fs.rmSync(tmp,{force:true});}catch{}}}
function randomKey(){return crypto.randomBytes(18).toString('base64url');}
function fileCandidate(value=''){const raw=String(value||'').trim();if(!raw)return'';try{if(/^file:/i.test(raw))return fileURLToPath(raw.split('#')[0]);}catch{}try{if(fs.existsSync(raw))return path.resolve(raw);}catch{}return'';}
function urlHash(value=''){const i=String(value).indexOf('#');return i>=0?String(value).slice(i):'';}

class OutputLanServer{
  constructor({srcDir,dataDir,getDesign,log,onState}){
    this.srcDir=path.resolve(srcDir);this.dataDir=path.resolve(dataDir);this.getDesign=getDesign||(()=>({}));this.log=log||(()=>{});this.onState=onState||(()=>{});
    this.configFile=path.join(this.dataDir,'global','output-lan.json');this.config=this.loadConfig();this.server=null;this.actualPort=0;this.boundHost='';this.error='';this.clients=new Map();this.assets=new Map();this.assetByPath=new Map();this.programSeq=0;this.currentProgram=null;this.masterProgress={currentSec:0,durationSec:0,at:0};this.lastControl='stop';this.design={};this.startPromise=null;this.lastClientError='';
  }
  loadConfig(){const raw=safeJson(this.configFile,{})||{};return{enabled:raw.enabled===true,port:Math.max(1024,Math.min(65535,Math.round(Number(raw.port)||8787))),key:/^[A-Za-z0-9_-]{12,}$/.test(String(raw.key||''))?String(raw.key):randomKey()};}
  saveConfig(){atomicJson(this.configFile,this.config);}
  status(){
    const ip=localIPv4(),lanReady=this.config.enabled&&this.server&&this.boundHost==='0.0.0.0'&&!this.error;
    return{enabled:this.config.enabled,port:this.config.port,actualPort:this.actualPort||0,host:this.boundHost||'',ip,lanUrl:lanReady?`http://${ip}:${this.actualPort}/output?k=${encodeURIComponent(this.config.key)}`:'',localUrl:this.server?`http://127.0.0.1:${this.actualPort}/output?monitor=1&k=${encodeURIComponent(this.config.key)}`:'',clients:[...this.clients.values()].filter(x=>!x.monitor).length,monitors:[...this.clients.values()].filter(x=>x.monitor).length,error:this.error||'',lastClientError:this.lastClientError||'',audio:true,monitorAudioDefault:false};
  }
  emitState(){try{this.onState(this.status());}catch{}}
  async start(){if(this.startPromise)return this.startPromise;this.startPromise=this._start().finally(()=>{this.startPromise=null;});return this.startPromise;}
  async _start(){await this.stop(false);this.error='';const desiredHost=this.config.enabled?'0.0.0.0':'127.0.0.1';try{await this.listen(desiredHost,this.config.port);}catch(e){this.error=e?.code==='EADDRINUSE'?`El puerto ${this.config.port} está ocupado.`:String(e?.message||e);this.log('OUTPUT_LAN',this.error);if(this.config.enabled){try{await this.listen('127.0.0.1',0);}catch{}}else{try{await this.listen('127.0.0.1',0);}catch{}}}this.publishDesign(this.getDesign()||{});this.emitState();return this.status();}
  listen(host,port){return new Promise((resolve,reject)=>{const server=http.createServer((req,res)=>this.handle(req,res));server.on('clientError',(_,socket)=>{try{socket.destroy();}catch{}});server.once('error',reject);server.listen(port,host,()=>{server.removeListener('error',reject);this.server=server;this.boundHost=host;this.actualPort=Number(server.address()?.port)||port;server.on('error',e=>{this.error=String(e?.message||e);this.emitState();});resolve();});});}
  async stop(emit=true){for(const x of this.clients.values())try{x.res.end();}catch{}this.clients.clear();const s=this.server;this.server=null;this.actualPort=0;this.boundHost='';if(s)await new Promise(r=>{try{s.close(()=>r());setTimeout(r,800).unref?.();}catch{r();}});if(emit)this.emitState();}
  async configure(patch={}){const oldPort=this.config.port,oldEnabled=this.config.enabled;if(patch.enabled!=null)this.config.enabled=patch.enabled===true;if(patch.port!=null)this.config.port=Math.max(1024,Math.min(65535,Math.round(Number(patch.port)||8787)));if(patch.regenerateKey===true)this.config.key=randomKey();this.saveConfig();if(oldPort!==this.config.port||oldEnabled!==this.config.enabled||!this.server)await this.start();else this.emitState();return this.status();}
  allow(req,url){if(isLoopback(req.socket?.remoteAddress))return true;if(!this.config.enabled)return false;const name=url.pathname.replace(/^\//,'');if(STATIC_FILES.has(name))return true;return String(url.searchParams.get('k')||'')===this.config.key;}
  handle(req,res){
    let u;try{u=new URL(req.url||'/','http://local');}catch{return this.reply(res,400,'Bad request');}
    if(!this.allow(req,u))return this.reply(res,403,'Output LAN no autorizado');
    if(u.pathname==='/'||u.pathname==='/output')return this.serveStatic('output-web.html',res);
    if(u.pathname==='/events')return this.events(req,res,u);
    if(u.pathname==='/api/settings')return this.json(res,{visual:{output:this.webDesign(this.design||this.getDesign()||{})}});
    if(u.pathname==='/api/status')return this.json(res,this.status());
    if(u.pathname==='/api/client-playback'&&req.method==='POST')return this.clientPlayback(req,res,u);
    if(u.pathname.startsWith('/asset/'))return this.serveAsset(u.pathname.split('/')[2]||'',req,res);
    const name=u.pathname.replace(/^\//,'');if(STATIC_FILES.has(name))return this.serveStatic(name,res);
    return this.reply(res,404,'Not found');
  }
  reply(res,status,body,type='text/plain; charset=utf-8'){res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','Access-Control-Allow-Origin':'*'});res.end(body);}
  json(res,value){this.reply(res,200,JSON.stringify(value),'application/json; charset=utf-8');}
  clientPlayback(req,res,u){let body='';req.on('data',d=>{body+=String(d);if(body.length>8192)try{req.destroy();}catch{}});req.on('end',()=>{try{const p=JSON.parse(body||'{}');if(p?.type==='error'&&u.searchParams.get('monitor')!=='1'){this.lastClientError=String(p.message||'Error de reproducción LAN').slice(0,240);this.emitState();}}catch{}this.json(res,{ok:true});});}
  serveStatic(name,res){if(!STATIC_FILES.has(name))return this.reply(res,404,'Not found');const file=path.join(this.srcDir,name);if(!fs.existsSync(file))return this.reply(res,404,'Missing asset');const type=MIME[path.extname(name).toLowerCase()]||'application/octet-stream';res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-cache','Access-Control-Allow-Origin':'*'});fs.createReadStream(file).pipe(res);}
  register(value){
    const file=fileCandidate(value);if(!file||!fs.existsSync(file))return String(value||'');const keyPath=path.resolve(file).toLocaleLowerCase('en-US');let id=this.assetByPath.get(keyPath);if(!id){id=crypto.createHash('sha256').update(keyPath).digest('hex').slice(0,24);this.assetByPath.set(keyPath,id);this.assets.set(id,{file:path.resolve(file),name:path.basename(file),at:Date.now()});while(this.assets.size>600){const first=this.assets.keys().next().value,entry=this.assets.get(first);this.assets.delete(first);if(entry)this.assetByPath.delete(path.resolve(entry.file).toLocaleLowerCase('en-US'));}}else{const x=this.assets.get(id);if(x)x.at=Date.now();}
    return `/asset/${id}/${encodeURIComponent(path.basename(file))}?k=${encodeURIComponent(this.config.key)}${urlHash(value)}`;
  }
  webDesign(raw={}){const d={...raw};for(const k of ['standbyVideoUrl','verticalVideoBackgroundUrl','musicUrl'])if(d[k])d[k]=this.register(d[k]);d.customFonts=(Array.isArray(d.customFonts)?d.customFonts:[]).map(x=>({...x,url:this.register(x.url)}));return d;}
  webStory(raw={}){const p={...raw};for(const k of ['audioUrl','videoUrl','image','preloadImage','fallbackImage'])if(p[k])p[k]=this.register(p[k]);return p;}
  serveAsset(id,req,res){const x=this.assets.get(id);if(!x||!fs.existsSync(x.file))return this.reply(res,404,'Asset unavailable');let stat;try{stat=fs.statSync(x.file);}catch{return this.reply(res,404,'Asset unavailable');}const size=stat.size,type=MIME[path.extname(x.file).toLowerCase()]||'application/octet-stream',range=String(req.headers.range||'');const common={'Content-Type':type,'Accept-Ranges':'bytes','Cache-Control':'private, max-age=60','Access-Control-Allow-Origin':'*'};
    if(range){const m=/bytes=(\d*)-(\d*)/.exec(range);if(!m)return this.reply(res,416,'Invalid range');let start=m[1]?Number(m[1]):0,end=m[2]?Number(m[2]):size-1;if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||start>=size||end<start)return this.reply(res,416,'Range not satisfiable');end=Math.min(end,size-1);res.writeHead(206,{...common,'Content-Range':`bytes ${start}-${end}/${size}`,'Content-Length':end-start+1});return fs.createReadStream(x.file,{start,end}).pipe(res);}
    res.writeHead(200,{...common,'Content-Length':size});fs.createReadStream(x.file).pipe(res);
  }
  events(req,res,u){res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','Access-Control-Allow-Origin':'*'});res.write(': connected\n\n');const id=crypto.randomUUID(),monitor=u.searchParams.get('monitor')==='1'||isLoopback(req.socket?.remoteAddress)&&u.searchParams.get('monitor')==='1';this.clients.set(id,{id,res,monitor,remote:String(req.socket?.remoteAddress||''),at:Date.now()});const send=(channel,payload)=>{try{res.write(`data: ${JSON.stringify({channel,payload})}\n\n`);}catch{}};send('output:design',this.webDesign(this.design||this.getDesign()||{}));if(this.currentProgram){const base=Math.max(0,Number(this.masterProgress.currentSec)||0),since=Math.max(0,(Date.now()-Number(this.masterProgress.at||Date.now()))/1000),progress=this.currentProgram.paused?base:base+(since<8?since:0);send('output:story',{...this.currentProgram.payload,startAtSec:progress,programId:this.currentProgram.id});if(this.currentProgram.paused)send('output:control','pause');}else send('output:control','stop');send('output:master-progress',{...this.masterProgress,programId:this.currentProgram?.id||0});const keep=setInterval(()=>{try{res.write(': ping\n\n');}catch{}},15000);req.on('close',()=>{clearInterval(keep);this.clients.delete(id);this.emitState();});this.emitState();}
  broadcast(channel,payload){const data=`data: ${JSON.stringify({channel,payload})}\n\n`;for(const [id,x] of this.clients){try{x.res.write(data);}catch{this.clients.delete(id);}}this.emitState();}
  publishDesign(raw={}){this.design={...raw};const web=this.webDesign(this.design);this.broadcast('output:design',web);return web;}
  publishStory(raw={}){const payload=this.webStory(raw),id=++this.programSeq;this.currentProgram={id,payload:{...payload,programId:id,startAtSec:0},startedAt:Date.now(),paused:false,pausedAt:0,pausedTotalSec:0};this.masterProgress={currentSec:0,durationSec:Number(raw.audioDurationSec)||0,at:Date.now()};this.lastControl='play';this.broadcast('output:story',this.currentProgram.payload);return this.currentProgram;}
  publishControl(action){const a=String(action||'');this.lastControl=a;if(this.currentProgram){if(a==='pause'&&!this.currentProgram.paused){this.currentProgram.paused=true;this.currentProgram.pausedAt=Date.now();}if(a==='play'&&this.currentProgram.paused){this.currentProgram.pausedTotalSec+=(Date.now()-this.currentProgram.pausedAt)/1000;this.currentProgram.paused=false;this.currentProgram.pausedAt=0;}}if(a==='stop'){this.currentProgram=null;this.masterProgress={currentSec:0,durationSec:0,at:Date.now()};}this.broadcast('output:control',a);}
  updateMasterPlayback(event={}){if(String(event.source||'')!=='automatic')return;if(event.type==='progress'){this.masterProgress={currentSec:Math.max(0,Number(event.currentSec)||0),durationSec:Math.max(0,Number(event.durationSec)||0),at:Date.now()};this.broadcast('output:master-progress',{...this.masterProgress,programId:this.currentProgram?.id||0});}else if(event.type==='ended'||event.type==='error'){this.broadcast('output:master-progress',{...this.masterProgress,ended:event.type==='ended',error:event.type==='error',programId:this.currentProgram?.id||0});}}
}
module.exports={OutputLanServer,localIPv4,fileCandidate,isLoopback};
