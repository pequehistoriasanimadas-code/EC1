const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const roots = ['src'];
let failed = false;
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (p.endsWith('.js')) {
      const r = spawnSync(process.execPath, ['--check', p], { encoding: 'utf8' });
      if (r.status !== 0) {
        failed = true;
        console.error(`Syntax error: ${p}`);
        console.error(r.stderr);
      }
    }
  }
}
roots.forEach(r => walk(r));
if (failed) process.exit(1);

try {
  const {parseFeed}=require('../src/services/rss');
  const sample=`<?xml version="1.0"?><rss><channel><item><title><![CDATA[Noticia de prueba]]></title><link>https://example.com/nota</link><description>Descripción</description><pubDate>Wed, 19 Aug 2026 10:00:00 GMT</pubDate></item></channel></rss>`;
  const items=parseFeed(sample,{id:'test',name:'Test'});
  if(items.length!==1||items[0].link!=='https://example.com/nota')throw new Error('RSS parser smoke test failed');

  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ec-news-check-'));
  const videos=path.join(tmp,'videos');fs.mkdirSync(videos);
  for(const name of ['a.mp4','b.mp4','c.webm'])fs.writeFileSync(path.join(videos,name),'x');
  const {CannedManager}=require('../src/services/canned');
  const canned=new CannedManager();
  const listed=canned.list(videos);
  if(!listed.ok||listed.count!==3)throw new Error('Canned folder scan smoke test failed');
  const cycle=new Set([canned.pick(videos).name,canned.pick(videos).name,canned.pick(videos).name]);
  if(cycle.size!==3)throw new Error('Canned random bag repeated before completing a cycle');

  const {PronunciationNormalizer}=require('../src/services/pronunciation');
  const pron=new PronunciationNormalizer({resourcesDir:tmp,dataDir:tmp});
  const normalized=pron.basic('Apple TV informó un avance de 25% en YouTube. S/900 millones y US$25 millones.');
  if(!/ápol te uve/i.test(normalized)||!/25 por ciento/i.test(normalized)||!/yutub/i.test(normalized))throw new Error('Pronunciation rules smoke test failed');
  if(!/900 millones de soles/i.test(normalized)||!/25 millones de dólares/i.test(normalized))throw new Error('Currency pronunciation smoke test failed');
  const pronJs=fs.readFileSync(path.join('src','services','pronunciation.js'),'utf8');
  for(const token of ['parseSmartResponse','requestSmartMap','attempt<=2','pronunciation-warning','smartFailed'])if(!pronJs.includes(token))throw new Error(`Smart pronunciation retry missing ${token}`);

  const {locutionSource}=require('../src/services/automation');
  const spoken=locutionSource('Titular de prueba','Este es el guion de la noticia.');
  if(!spoken.startsWith('Titular de prueba. '))throw new Error('Headline-first locution smoke test failed');
  const automationJs=fs.readFileSync(path.join('src','services','automation.js'),'utf8');
  for(const token of ['resetSessionCounters','newsEmitted++','session:{newsEmitted:this.newsEmitted,cannedEmitted:this.cannedPlayed}','pronunciationSmartFailed'])if(!automationJs.includes(token))throw new Error(`Session counter/fallback metric missing ${token}`);

  const outputHtml=fs.readFileSync(path.join('src','output.html'),'utf8');
  for(const id of ['cannedVideo','cannedBg','music','audio','stage','pubDate','metaRow'])if(!outputHtml.includes(`id="${id}"`))throw new Error(`Output missing ${id}`);
  const outputJs=fs.readFileSync(path.join('src','output.js'),'utf8');
  for(const token of ['makeStorySnapshot','crossfadeLayers','formatDate','dateFontFamily','loopFadeBusy'])if(!outputJs.includes(token))throw new Error(`Output feature missing ${token}`);
  if(outputJs.includes("stage.style.opacity='0'"))throw new Error('Old fade-to-black transition is still present');
  const controlHtml=fs.readFileSync(path.join('src','control.html'),'utf8');
  for(const id of ['tab-canned','cannedEnabled','pickCannedFolder','musicEnabled','transitionEnabled','pickVerticalVideoBackground','testPronunciation'])if(!controlHtml.includes(`id="${id}"`))throw new Error(`Control UI missing ${id}`);
  const renderer=fs.readFileSync(path.join('src','renderer.js'),'utf8');
  for(const token of ['dateFontFamily','Tipografía de fecha','previewDate'])if(!renderer.includes(token))throw new Error(`Date typography UI missing ${token}`);
  const rendererUi=fs.readFileSync(path.join('src','renderer-ui.js'),'utf8');
  if(!rendererUi.includes('básico (inteligente no respondió)'))throw new Error('Soft pronunciation fallback is not visible in queue');

  const mainJs=fs.readFileSync(path.join('src','main.js'),'utf8');
  if(!mainJs.includes('const enriched={...payload,source};'))throw new Error('Output payload is not decoupled from global design');
  if(mainJs.includes('const enriched={...payload,source,design:currentDesign()};'))throw new Error('Per-story design resend can restart background music');
  if(!mainJs.includes("ipcMain.handle('automation:resetCounters'"))throw new Error('Counter reset IPC missing');

  const ttsPy=fs.readFileSync(path.join('scripts','tts.py'),'utf8');
  for(const token of ['SessionOptions','intra_op_num_threads','inter_op_num_threads','ORT_SEQUENTIAL','--onnx-intra','--onnx-inter','normalize_currency','de soles','de dólares'])if(!ttsPy.includes(token))throw new Error(`Kokoro/TTS smoke test missing ${token}`);
  const py=spawnSync('python',['-m','py_compile',path.join('scripts','tts.py')],{encoding:'utf8'});
  if(py.error==null&&py.status!==0)throw new Error(`Python syntax error in tts.py: ${py.stderr}`);
  const kokoroJs=fs.readFileSync(path.join('src','services','kokoro.js'),'utf8');
  for(const token of ['safe_streaming','balanced','performance','intra:2','intra:3','intra:6','realtimeFactor'])if(!kokoroJs.includes(token))throw new Error(`Kokoro profile smoke test missing ${token}`);
  const preload=fs.readFileSync(path.join('src','preload.js'),'utf8');
  for(const token of ['ttsPerformanceProfile','Seguro para streaming','Generando voz con Kokoro','Cargando Qwen 8B','sessionNewsEmitted','sessionCannedEmitted','resetSessionCounters','persistSoundControls'])if(!preload.includes(token))throw new Error(`Preload/UI smoke test missing ${token}`);

  fs.rmSync(tmp,{recursive:true,force:true});
  console.log('JavaScript syntax OK · Python TTS syntax OK · RSS OK · Enlatados OK · Pronunciación robusta OK · música persistente OK · contadores de sesión OK · crossfade OK · Kokoro ONNX limiter OK');
} catch(e) {
  console.error(e.stack||e);process.exit(1);
}
