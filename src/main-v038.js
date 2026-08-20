'use strict';

// EC Automatic News 0.3.8 compatibility layer.
// Keeps the 0.3.7 code intact while adding a second Enlatados library for ads.
const fs = require('fs');
const path = require('path');
const Module = require('module');
const electron = require('electron');
const { CannedManager } = require('./services/canned');
const { AutomationEngine } = require('./services/automation');

const AD_RETRY_BACKOFF_MS = 30000;
const MAX_MEDIA_WAIT_MS = 6 * 60 * 60 * 1000;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function ensureAdsRuntime(engine) {
  if (!engine._adsManager) engine._adsManager = new CannedManager();
  if (!Number.isFinite(engine.adsPlayed)) engine.adsPlayed = 0;
  if (!Number.isFinite(engine.adsUnavailableUntil)) engine.adsUnavailableUntil = 0;
}

// Extend the existing automatic engine without changing the stable 0.3.7 implementation.
const baseSnapshot = AutomationEngine.prototype.snapshot;
AutomationEngine.prototype.snapshot = function patchedSnapshot(extra = {}) {
  ensureAdsRuntime(this);
  const snap = baseSnapshot.call(this, extra);
  let settings = {};
  try { settings = this.getSettings?.() || {}; } catch {}
  const canned = settings.canned || {};
  const adsFolder = String(canned.adsFolder || '').trim();
  const insertAfterCanned = canned.insertAdAfterContent !== false;
  snap.session = { ...(snap.session || {}), adsEmitted: this.adsPlayed };
  snap.ads = {
    enabled: insertAfterCanned && !!adsFolder,
    insertAfterCanned,
    folderConfigured: !!adsFolder,
    played: this.adsPlayed,
    current: this.currentKind === 'ad' ? (this.currentCanned?.name || '') : ''
  };
  return snap;
};

const baseResetSessionCounters = AutomationEngine.prototype.resetSessionCounters;
AutomationEngine.prototype.resetSessionCounters = function patchedResetSessionCounters() {
  ensureAdsRuntime(this);
  this.adsPlayed = 0;
  return baseResetSessionCounters.call(this);
};

AutomationEngine.prototype.playAdAfterCanned = async function playAdAfterCanned(settings = {}, reason = '') {
  ensureAdsRuntime(this);
  const canned = settings.canned || {};
  const folder = String(canned.adsFolder || '').trim();
  if (!folder || canned.insertAdAfterContent === false) return false;
  if (Date.now() < this.adsUnavailableUntil) return false;

  let media;
  try {
    media = this._adsManager.pick(folder);
  } catch (e) {
    this.adsUnavailableUntil = Date.now() + AD_RETRY_BACKOFF_MS;
    this.emit('error-item', {
      title: 'Anuncios',
      error: e.message || 'No hay anuncios disponibles',
      stage: 'ads'
    });
    this.state({ notice: 'No hay un anuncio disponible; la emisión continúa normalmente.' });
    return false;
  }
  if (!media) return false;

  this.adsUnavailableUntil = 0;
  this.currentKind = 'ad';
  this.currentCanned = media;
  this.currentItem = null;
  this.state({ notice: `Anuncio al aire: ${media.name}` });

  // Output already knows how to reproduce kind=canned. mediaRole distinguishes the ad
  // for state/UI purposes without duplicating the video renderer.
  const sent = this.sendAutomaticOutput({
    source: 'automatic',
    kind: 'canned',
    mediaRole: 'ad',
    title: media.name,
    videoUrl: media.url,
    cannedReason: `ad-after-${reason || 'canned'}`
  });
  if (!sent) {
    this.currentKind = 'none';
    this.currentCanned = null;
    this.emissionPaused = true;
    this.state({ notice: 'Output no disponible' });
    return false;
  }

  const result = await Promise.race([
    new Promise(resolve => { this.playbackResolve = resolve; }),
    wait(MAX_MEDIA_WAIT_MS).then(() => 'timeout')
  ]);
  this.playbackResolve = null;

  if (result === 'ended') {
    this.adsPlayed++;
  } else if (result === 'error' || result === 'timeout') {
    this.emissionPaused = true;
    this.emit('error-item', {
      title: media.name,
      error: result === 'timeout' ? 'Anuncio: tiempo máximo excedido' : 'Anuncio: no se pudo reproducir el video',
      stage: 'ads'
    });
  } else if (result === 'closed' || result === 'interrupted') {
    this.emissionPaused = true;
  }

  this.currentKind = 'none';
  this.currentCanned = null;
  this.state();
  return result === 'ended';
};

const basePlayCanned = AutomationEngine.prototype.playCanned;
AutomationEngine.prototype.playCanned = async function patchedPlayCanned(settings, reason) {
  ensureAdsRuntime(this);
  const played = await basePlayCanned.call(this, settings, reason);
  if (!played || !this.emissionRunning || this.emissionPaused) return played;

  let latest = settings || {};
  try { latest = this.getSettings?.() || latest; } catch {}
  const canned = latest.canned || {};
  if (canned.insertAdAfterContent === false || !String(canned.adsFolder || '').trim()) return played;

  await this.playAdAfterCanned(latest, reason);
  return played;
};

function portableDataDir() {
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
  if (portableDir) return path.join(portableDir, 'EC Automatic News Data');
  if (electron.app.isPackaged) return path.join(path.dirname(process.execPath), 'EC Automatic News Data');
  return path.join(electron.app.getPath('userData'), 'EC Automatic News Data');
}
function settingsPath() { return path.join(portableDataDir(), 'settings.json'); }
function readSettingsFile() {
  try {
    const file = settingsPath();
    if (!fs.existsSync(file)) return {};
    return JSON.parse(fs.readFileSync(file, 'utf8')) || {};
  } catch { return {}; }
}
function saveCannedPatch(patch = {}) {
  const file = settingsPath();
  const current = readSettingsFile();
  current.canned = {
    enabled: false,
    folder: '',
    adsFolder: '',
    insertAdAfterContent: true,
    emergency: true,
    interval: 10,
    ...(current.canned || {}),
    ...patch
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.ads.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(current, null, 2), 'utf8');
  fs.renameSync(tmp, file);
  return current;
}

const adsBrowserManager = new CannedManager();
electron.ipcMain.handle('canned:pickAdsFolder', async () => {
  const result = await electron.dialog.showOpenDialog({ properties: ['openDirectory'] });
  if (result.canceled || !result.filePaths[0]) return { ok: false };
  const folder = result.filePaths[0];
  saveCannedPatch({ adsFolder: folder, insertAdAfterContent: true });
  adsBrowserManager.reset();
  return { ok: true, ...adsBrowserManager.list(folder) };
});
electron.ipcMain.handle('canned:listAds', () => {
  const settings = readSettingsFile();
  return adsBrowserManager.list(settings.canned?.adsFolder || '');
});

// Swap only the preload used by the existing BrowserWindows. The original 0.3.7
// main process stays untouched, which keeps its stable startup/self-test behavior.
function BrowserWindow038(options = {}) {
  const next = {
    ...options,
    webPreferences: { ...(options.webPreferences || {}) }
  };
  const preload = String(next.webPreferences.preload || '');
  if (preload && path.basename(preload).toLowerCase() === 'preload.js') {
    next.webPreferences.preload = path.join(__dirname, 'preload-v038.js');
  }
  return new electron.BrowserWindow(next);
}
BrowserWindow038.prototype = electron.BrowserWindow.prototype;

const originalLoad = Module._load;
const electronForMain = new Proxy(electron, {
  get(target, prop, receiver) {
    if (prop === 'BrowserWindow') return BrowserWindow038;
    return Reflect.get(target, prop, receiver);
  }
});

Module._load = function patchedModuleLoad(request, parent, isMain) {
  if (request === 'electron' && parent && path.resolve(parent.filename || '') === path.join(__dirname, 'main.js')) {
    return electronForMain;
  }
  return originalLoad.call(this, request, parent, isMain);
};
try {
  require('./main.js');
} finally {
  Module._load = originalLoad;
}
