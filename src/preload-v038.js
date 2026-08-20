'use strict';

// Load the complete 0.3.7 bridge/UI helpers first.
require('./preload.js');

const { ipcRenderer } = require('electron');
let lastAdsState = null;

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[ch]));

async function getSettings() {
  return ipcRenderer.invoke('settings:get');
}
async function setAdsAfterCanned(enabled) {
  const current = await getSettings();
  const next = {
    ...current,
    canned: { ...(current.canned || {}), insertAdAfterContent: !!enabled }
  };
  return ipcRenderer.invoke('settings:save', next);
}

function relabelContentLibrary() {
  const tab = document.getElementById('tab-canned');
  if (!tab) return;
  const cards = [...tab.querySelectorAll(':scope > .cols > .card')];
  const program = cards[0];
  const library = cards[1];
  if (program) {
    const heading = program.querySelector('.section-head h3');
    if (heading) heading.textContent = 'Programación de contenidos';
    const labels = [...program.querySelectorAll('label')];
    const folderLabel = labels.find(x => /^Carpeta de videos$/i.test((x.textContent || '').trim()));
    if (folderLabel) folderLabel.childNodes[0].textContent = 'Carpeta de contenidos';
    const pick = document.getElementById('pickCannedFolder');
    if (pick) pick.textContent = 'Seleccionar carpeta de contenidos';
    const refresh = document.getElementById('refreshCanned');
    if (refresh) refresh.textContent = 'Actualizar contenidos';
    const launch = document.getElementById('launchCannedNow');
    if (launch) launch.textContent = 'Lanzar contenido enlatado al terminar el contenido actual';
  }
  if (library) {
    const heading = library.querySelector('.section-head h3');
    if (heading) heading.textContent = 'Contenidos disponibles';
  }
}

function injectAdsCard() {
  const tab = document.getElementById('tab-canned');
  const cols = tab?.querySelector(':scope > .cols');
  if (!cols || document.getElementById('adsLibraryCard')) return;

  const card = document.createElement('div');
  card.id = 'adsLibraryCard';
  card.className = 'card';
  card.style.gridColumn = '1 / -1';
  card.innerHTML = `
    <div class="section-head">
      <h3>Anuncios</h3>
      <span id="adsState" class="status-pill neutral">SIN CARPETA</span>
    </div>
    <p class="note">Biblioteca independiente para spots, promociones y avisos. No forma parte del buffer de noticias.</p>
    <label class="switch-row">
      <span><b>Insertar un anuncio después de cada enlatado</b><small>Cuando termina un contenido enlatado, reproduce automáticamente un anuncio y luego vuelve al flujo normal.</small></span>
      <input id="adsAfterCanned" type="checkbox">
      <span class="switch-ui"></span>
    </label>
    <label>Carpeta de anuncios</label>
    <div class="buttons">
      <button id="pickAdsFolder">Seleccionar carpeta de anuncios</button>
      <button id="refreshAds" class="dark">Actualizar anuncios</button>
    </div>
    <div id="adsFolderInfo" class="note">Sin carpeta seleccionada.</div>
    <div class="section-head top-gap">
      <h3>Anuncios disponibles</h3>
      <span id="adsCount" class="mini-pill">0 videos</span>
    </div>
    <div id="adsList" class="media-list"><div class="empty">Selecciona una carpeta de anuncios.</div></div>
    <p class="note">Los anuncios rotan de forma aleatoria sin repetirse hasta completar el ciclo. Si no hay un anuncio válido, la emisión continúa sin bloquearse.</p>
  `;
  cols.appendChild(card);

  document.getElementById('pickAdsFolder')?.addEventListener('click', async () => {
    try {
      const result = await ipcRenderer.invoke('canned:pickAdsFolder');
      if (!result?.ok) return;
      await refreshAdsLibrary();
      setStatus(`Carpeta de anuncios seleccionada: ${result.count || 0} videos.`);
    } catch (e) {
      setStatus(`Anuncios: ${e.message || e}`);
    }
  });
  document.getElementById('refreshAds')?.addEventListener('click', async () => {
    await refreshAdsLibrary();
    setStatus('Carpeta de anuncios actualizada.');
  });
  document.getElementById('adsAfterCanned')?.addEventListener('change', async e => {
    try {
      await setAdsAfterCanned(e.target.checked);
      await refreshAdsLibrary();
      setStatus(e.target.checked ? 'Anuncio después de cada enlatado: activado.' : 'Anuncio después de cada enlatado: desactivado.');
    } catch (err) {
      setStatus(`Anuncios: ${err.message || err}`);
    }
  });
}

function setStatus(message) {
  const el = document.getElementById('status');
  if (el) el.textContent = message;
}

async function refreshAdsLibrary() {
  const list = document.getElementById('adsList');
  if (!list) return;
  const info = document.getElementById('adsFolderInfo');
  const count = document.getElementById('adsCount');
  const state = document.getElementById('adsState');
  const toggle = document.getElementById('adsAfterCanned');

  try {
    const [settings, result] = await Promise.all([
      getSettings(),
      ipcRenderer.invoke('canned:listAds')
    ]);
    const canned = settings.canned || {};
    if (toggle) toggle.checked = canned.insertAdAfterContent !== false;
    const folder = String(canned.adsFolder || result?.folder || '').trim();
    if (info) info.textContent = folder ? `${folder}${result?.ok ? ` · ${result.count || 0} videos compatibles` : ''}` : 'Sin carpeta seleccionada.';
    if (count) count.textContent = `${result?.count || 0} videos`;
    if (state) {
      const enabled = canned.insertAdAfterContent !== false;
      state.textContent = !folder ? 'SIN CARPETA' : !enabled ? 'DESACTIVADO' : 'ACTIVO';
      state.className = `status-pill ${!folder || !enabled ? 'neutral' : 'ok'}`;
    }
    if (!result?.files?.length) {
      list.innerHTML = `<div class="empty">${esc(result?.message || (folder ? 'No hay anuncios compatibles.' : 'Selecciona una carpeta de anuncios.'))}</div>`;
      return;
    }
    list.innerHTML = result.files.map(item => `
      <div class="media-item">
        <div class="media-name">${esc(item.name)}</div>
        <div class="media-meta">${Number(item.sizeMB || 0).toFixed(1)} MB</div>
      </div>
    `).join('');
  } catch (e) {
    list.innerHTML = `<div class="empty">${esc(e.message || e)}</div>`;
    if (count) count.textContent = '0 videos';
    if (state) { state.textContent = 'ERROR'; state.className = 'status-pill neutral'; }
  }
}

function injectAdsCounter() {
  const row = document.getElementById('sessionCounters');
  if (!row || document.getElementById('sessionAdsEmitted')) return;
  const resetCell = document.getElementById('resetSessionCounters')?.closest('.queue-stat');
  const cell = document.createElement('div');
  cell.className = 'queue-stat';
  cell.innerHTML = '<b id="sessionAdsEmitted">0</b><span>ANUNCIOS EMITIDOS</span>';
  if (resetCell) row.insertBefore(cell, resetCell); else row.appendChild(cell);
}

function applyAdsAutomationState(state = {}) {
  lastAdsState = state;
  const ads = state.ads || {};
  const emission = state.emission || {};
  const counter = document.getElementById('sessionAdsEmitted');
  if (counter) counter.textContent = String(state.session?.adsEmitted || ads.played || 0);

  if (emission.currentKind === 'ad') {
    const emissionState = document.getElementById('emissionState');
    if (emissionState) {
      emissionState.textContent = 'ANUNCIO AL AIRE';
      emissionState.className = 'status-pill live';
    }
    const next = document.getElementById('nextCannedInfo');
    if (next) next.textContent = `Anuncio al aire: ${ads.current || emission.currentTitle || ''} · después volverá al flujo automático.`;
    const badge = document.getElementById('adsState');
    if (badge) { badge.textContent = 'AL AIRE'; badge.className = 'status-pill live'; }
  } else {
    const badge = document.getElementById('adsState');
    if (badge && ads.folderConfigured) {
      badge.textContent = ads.insertAfterCanned === false ? 'DESACTIVADO' : 'ACTIVO';
      badge.className = `status-pill ${ads.insertAfterCanned === false ? 'neutral' : 'ok'}`;
    }
  }
}

ipcRenderer.on('automation:state', (_, state) => {
  setTimeout(() => {
    injectAdsCounter();
    applyAdsAutomationState(state || {});
  }, 0);
});

window.addEventListener('DOMContentLoaded', () => setTimeout(async () => {
  relabelContentLibrary();
  injectAdsCard();
  injectAdsCounter();
  await refreshAdsLibrary();
  if (lastAdsState) applyAdsAutomationState(lastAdsState);
  try {
    const state = await ipcRenderer.invoke('automation:status');
    applyAdsAutomationState(state || {});
  } catch {}
}, 60));
