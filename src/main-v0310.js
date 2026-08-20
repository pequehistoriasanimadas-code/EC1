'use strict';

// EC Automatic News 0.3.10 reliability layer.
// It runs before the 0.3.9 compatibility layer and strengthens the automatic
// processing/emission state machine without replacing the stable core services.
const { AutomationEngine } = require('./services/automation');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function ensure0310(engine) {
  if (typeof engine.processingNotice !== 'string') engine.processingNotice = '';
}
function cancelError() {
  const e = new Error('Procesamiento cancelado');
  e.code = 'PROCESSING_CANCELLED';
  return e;
}
function assertProcessingActive(engine, epoch) {
  if (!engine.processingRunning || epoch !== engine.processingEpoch) throw cancelError();
}

// Surface a human-readable processing state in the UI.
const snapshot039 = AutomationEngine.prototype.snapshot;
AutomationEngine.prototype.snapshot = function snapshot0310(extra = {}) {
  ensure0310(this);
  const snap = snapshot039.call(this, extra);
  snap.processing = { ...(snap.processing || {}), message: this.processingNotice };
  snap.queue = (snap.queue || []).map((item, index) => ({
    ...item,
    outputRetries: this.queue?.[index]?.outputRetries || 0
  }));
  return snap;
};

const startProcessing039 = AutomationEngine.prototype.startProcessing;
AutomationEngine.prototype.startProcessing = function startProcessing0310() {
  ensure0310(this);
  this.processingNotice = 'Preparando buffer de noticias.';
  return startProcessing039.call(this);
};
AutomationEngine.prototype.pauseProcessing = function pauseProcessing0310() {
  ensure0310(this);
  this.processingPaused = true;
  this.processingNotice = this.inFlight?.size
    ? `Pausado: ${this.inFlight.size} trabajo(s) ya iniciados terminarán antes de quedar en reposo.`
    : 'Procesamiento pausado.';
  this.state();
  return this.snapshot();
};
AutomationEngine.prototype.resumeProcessing = function resumeProcessing0310() {
  ensure0310(this);
  if (!this.processingRunning) return this.startProcessing();
  this.processingPaused = false;
  this.processingNotice = 'Procesamiento reanudado.';
  this.state();
  return this.snapshot();
};
AutomationEngine.prototype.stopProcessing = function stopProcessing0310() {
  ensure0310(this);
  this.processingRunning = false;
  this.processingPaused = false;
  this.processingEpoch++;
  this.processingNotice = this.inFlight?.size
    ? `Deteniendo: ${this.inFlight.size} trabajo(s) en curso se cancelarán al finalizar su etapa actual.`
    : 'Procesamiento detenido.';
  this.state();
  return this.snapshot();
};

// Cancellation points prevent a Stop request from unnecessarily entering later
// local-heavy stages (pronunciation/TTS) after the current external stage returns.
AutomationEngine.prototype.process = async function process0310(story, settings, holder, epoch) {
  let article;
  holder.stage = 'article';
  this.state();
  try { article = await this.fetchArticle(story.link); }
  catch (e) { e.message = `Artículo: ${e.message}`; throw e; }
  assertProcessingActive(this, epoch);
  const image = story.image || article.image || this.getFallbackUrl();

  holder.stage = 'ai';
  this.state();
  let ai;
  try { ai = await this.providers.generate(story, article, settings); }
  catch (e) { e.message = `IA: ${e.message}`; throw e; }
  assertProcessingActive(this, epoch);
  holder.provider = ai.provider;
  holder.model = ai.model;
  holder.attempts = ai.attempts || [];
  holder.metrics = ai.metrics || null;

  const local = await this.runLocalHeavy(async () => {
    assertProcessingActive(this, epoch);
    holder.stage = 'pronunciation';
    this.state();
    const spoken = require('./services/automation').locutionSource(ai.result.title || story.title, ai.result.script);
    let locution = { text: spoken, elapsedMs: 0, smartUsed: false, smartFailed: false };
    if (this.pronunciation) {
      locution = await this.pronunciation.normalize(spoken, { smart: settings.tts?.pronunciationSmart !== false });
    }
    assertProcessingActive(this, epoch);
    holder.metrics = {
      ...(holder.metrics || {}),
      pronunciationElapsedMs: locution.elapsedMs || 0,
      pronunciationSmart: !!locution.smartUsed,
      pronunciationSmartFailed: !!locution.smartFailed,
      pronunciationSmartError: locution.smartFailed ? String(locution.smartError || '').slice(0, 180) : ''
    };
    await wait(300);
    assertProcessingActive(this, epoch);

    holder.stage = 'tts';
    this.state();
    let audio;
    try { audio = await this.kokoro.generate(locution.text, { voice: settings.tts.voice, speed: settings.tts.speed }); }
    catch (e) { e.message = `Kokoro: ${e.message}`; e.details = ai.attempts || []; throw e; }
    assertProcessingActive(this, epoch);
    holder.metrics = {
      ...(holder.metrics || {}),
      ttsElapsedMs: audio.elapsedMs || 0,
      ttsThreads: audio.threads || 4,
      audioDurationSec: audio.durationSec || 0,
      ttsRealtimeFactor: audio.realtimeFactor || 0,
      ttsProfile: audio.performanceLabel || audio.performanceProfile || ''
    };
    return { locution, audio };
  });

  return {
    article,
    provider: ai.provider,
    model: ai.model,
    result: { ...ai.result, ttsScript: local.locution.text },
    attempts: ai.attempts || [],
    metrics: holder.metrics,
    audio: local.audio,
    image,
    fallback: this.getFallbackUrl()
  };
};

AutomationEngine.prototype.launchCandidate = function launchCandidate0310(candidate, settings, epoch) {
  this.queuedUrls.add(candidate.link);
  const holder = { story: candidate, status: 'PROCESANDO', attempts: [], metrics: null, stage: 'article', outputRetries: 0 };
  this.queue.push(holder);
  this.state();
  const task = (async () => {
    try {
      Object.assign(holder, await this.process(candidate, settings, holder, epoch));
      assertProcessingActive(this, epoch);
      holder.status = 'LISTA';
      holder.stage = 'ready';
      holder.error = '';
    } catch (e) {
      if (e?.code === 'PROCESSING_CANCELLED') {
        this.queue = this.queue.filter(x => x !== holder);
        this.queuedUrls.delete(candidate.link);
      } else {
        holder.status = 'ERROR';
        holder.error = e.message;
        holder.attempts = e.details || holder.attempts || [];
        this.emit('error-item', { title: candidate.title, error: e.message, details: e.details, stage: holder.stage });
      }
    } finally {
      this.inFlight.delete(task);
      if (!this.processingRunning && !this.inFlight.size) this.processingNotice = 'Procesamiento detenido.';
      this.state();
    }
  })();
  this.inFlight.add(task);
};

// Buffer target now means READY items, not READY + PROCESSING.
AutomationEngine.prototype.producer = async function producer0310(epoch) {
  while (this.processingRunning && epoch === this.processingEpoch) {
    try {
      if (this.processingPaused) { await wait(400); continue; }
      const settings = this.getSettings();
      const target = Math.max(1, Math.min(30, Number(settings.automation.bufferReady) || 15));
      const readyCount = this.queue.filter(x => x.status === 'LISTA').length;
      const workers = settings.ai.primary === 'local' ? 1 : 2;
      const availableSlots = Math.max(0, target - readyCount);
      const allowedWorkers = Math.min(workers, availableSlots);
      if (readyCount >= target || allowedWorkers <= 0 || this.inFlight.size >= allowedWorkers) {
        this.processingNotice = readyCount >= target
          ? `Buffer listo: ${readyCount}/${target} noticias preparadas.`
          : `Preparando buffer: ${readyCount}/${target} listas.`;
        await wait(350);
        continue;
      }

      const maxQueue = Math.max(target, Math.min(60, Number(settings.automation.queueMax) || 30));
      if (this.queue.length >= maxQueue) {
        const errors = this.queue.filter(x => x.status === 'ERROR');
        if (errors.length) {
          const remove = errors[0];
          this.queue = this.queue.filter(x => x !== remove);
          this.queuedUrls.delete(remove.story.link);
        } else { await wait(700); continue; }
      }

      await this.refreshFeedCache(settings, false);
      let candidate = this.candidateFrom(this.cachedItems, settings);
      if (!candidate && Date.now() - this.lastFeedFetchAt > 15000) {
        await this.refreshFeedCache(settings, true);
        candidate = this.candidateFrom(this.cachedItems, settings);
      }
      if (!candidate) {
        this.processingNotice = 'Sin noticias nuevas elegibles; esperando actualización RSS.';
        this.state();
        await wait(2500);
        continue;
      }
      this.processingNotice = `Preparando buffer: ${readyCount}/${target} listas.`;
      this.launchCandidate(candidate, settings, epoch);
      await wait(120);
    } catch (e) {
      this.emit('engine-error', e);
      await wait(1200);
    }
  }
};

// Preserve queue order and protect the output from an endlessly failing audio item.
AutomationEngine.prototype.consumer = async function consumer0310(epoch) {
  while (this.emissionRunning && epoch === this.emissionEpoch) {
    if (this.emissionPaused) { await wait(300); continue; }
    if (!this.isOutputReady()) {
      this.emissionPaused = true;
      this.state({ notice: 'Abre Output para continuar la emisión' });
      continue;
    }

    const settings = this.getSettings();
    const anyReady = this.queue.some(x => x.status === 'LISTA');
    const reason = this.cannedReason(settings, anyReady);
    if (reason) {
      const played = await this.playCanned(settings, reason);
      if (played) continue;
    }

    // First pending item wins. A later ready item cannot overtake an earlier processing one.
    const item = this.queue.find(x => x.status === 'PROCESANDO' || x.status === 'LISTA' || x.status === 'AL AIRE');
    if (!item || item.status !== 'LISTA') { await wait(300); continue; }

    this.currentItem = item;
    this.currentKind = 'news';
    this.currentCanned = null;
    item.status = 'AL AIRE';
    item.error = '';
    this.state();

    const next = this.queue.find(x => x !== item && x.status === 'LISTA');
    const payload = {
      source: 'automatic', kind: 'news',
      title: item.result.title || item.story.title,
      category: item.result.category || item.story.category || 'ACTUALIDAD',
      pubDate: item.story.pubDate || item.article?.pubDate || '',
      summary: item.result.summary || '',
      script: item.result.script,
      image: item.image,
      preloadImage: next?.image || '',
      fallbackImage: item.fallback,
      audioUrl: item.audio.url,
      audioDurationSec: item.audio.durationSec || item.result.durationSec || 60
    };
    const sent = this.sendAutomaticOutput(payload);
    if (!sent) {
      item.status = 'LISTA';
      this.currentItem = null;
      this.currentKind = 'none';
      this.emissionPaused = true;
      this.state({ notice: 'Output no disponible' });
      continue;
    }

    const expected = Math.max(10, Number(payload.audioDurationSec) || 60) * 1000 + 15000;
    const result = await Promise.race([
      new Promise(resolve => { this.playbackResolve = resolve; }),
      wait(expected).then(() => 'timeout')
    ]);
    this.playbackResolve = null;

    if (result === 'ended') {
      this.history.add(item.story);
      item.status = 'EMITIDA';
      this.newsSinceCanned++;
      this.newsEmitted++;
      this.state();
      await wait((this.getSettings().visual.pauseSeconds || 2.5) * 1000);
      this.queue = this.queue.filter(x => x !== item);
      this.queuedUrls.delete(item.story.link);
    } else if (result === 'error' || result === 'timeout') {
      try { this.controlOutput('stop'); } catch {}
      item.outputRetries = (item.outputRetries || 0) + 1;
      item.error = result === 'timeout' ? 'Output: el audio excedió el tiempo esperado' : 'Output: no se pudo reproducir el audio';
      if (item.outputRetries <= 1) {
        item.status = 'LISTA';
        this.state({ notice: `Reintentando una vez: ${item.story.title}` });
        await wait(750);
      } else {
        item.status = 'ERROR';
        this.emit('error-item', {
          title: item.story.title,
          error: `${item.error}. Se omitió tras 1 reintento.`,
          stage: 'output'
        });
        this.state({ notice: 'Una noticia con audio defectuoso fue omitida; continúa la siguiente.' });
      }
    } else {
      item.status = 'LISTA';
      if (result === 'closed' || result === 'interrupted') this.emissionPaused = true;
    }

    this.currentItem = null;
    this.currentKind = 'none';
    this.state();
  }
};

// 0.3.9 still owns the independent Content/Ads libraries and exact 10/20/30 scheduling.
require('./main-v038.js');
