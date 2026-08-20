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
  const normalized=pron.basic('Apple TV informó un avance de 25% en YouTube.');
  if(!/ápol te uve/i.test(normalized)||!/25 por ciento/i.test(normalized)||!/yutub/i.test(normalized))throw new Error('Pronunciation rules smoke test failed');

  const outputHtml=fs.readFileSync(path.join('src','output.html'),'utf8');
  for(const id of ['cannedVideo','cannedBg','music','audio','stage'])if(!outputHtml.includes(`id="${id}"`))throw new Error(`Output missing ${id}`);
  const controlHtml=fs.readFileSync(path.join('src','control.html'),'utf8');
  for(const id of ['tab-canned','cannedEnabled','pickCannedFolder','musicEnabled','transitionEnabled','pickVerticalVideoBackground','testPronunciation'])if(!controlHtml.includes(`id="${id}"`))throw new Error(`Control UI missing ${id}`);

  const ttsPy=fs.readFileSync(path.join('scripts','tts.py'),'utf8');
  for(const token of ['SessionOptions','intra_op_num_threads','inter_op_num_threads','ORT_SEQUENTIAL','--onnx-intra','--onnx-inter'])if(!ttsPy.includes(token))throw new Error(`Kokoro ONNX limiter missing ${token}`);
  const kokoroJs=fs.readFileSync(path.join('src','services','kokoro.js'),'utf8');
  for(const token of ['safe_streaming','balanced','performance','intra:2','intra:3','intra:6','realtimeFactor'])if(!kokoroJs.includes(token))throw new Error(`Kokoro profile smoke test missing ${token}`);
  const preload=fs.readFileSync(path.join('src','preload.js'),'utf8');
  for(const token of ['ttsPerformanceProfile','Seguro para streaming','Generando voz con Kokoro','Cargando Qwen 8B'])if(!preload.includes(token))throw new Error(`TTS profile UI smoke test missing ${token}`);

  fs.rmSync(tmp,{recursive:true,force:true});
  console.log('JavaScript syntax OK · RSS OK · Enlatados OK · Pronunciación OK · UI multimedia OK · Kokoro ONNX limiter OK');
} catch(e) {
  console.error(e.stack||e);process.exit(1);
}
