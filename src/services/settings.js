const fs = require('fs');
const path = require('path');
const { safeStorage } = require('electron');

const DEFAULT_CLAUDE_MODEL = 'claude-haiku-4-5-20251001';

class SettingsStore {
  constructor(baseDir) {
    this.baseDir = baseDir;
    this.file = path.join(baseDir, 'settings.json');
    fs.mkdirSync(baseDir, { recursive: true });
  }

  defaults() {
    return {
      rssFeeds: [{
        id: 'ec-ultimas',
        name: 'Últimas Noticias',
        url: 'https://elcomercio.pe/arc/outboundfeeds/rss/category/ultimas-noticias/?outputType=xml',
        enabled: true,
        priority: 100
      }],
      ai: {
        primary: 'local',
        backup1: 'claude',
        backup2: 'gemini',
        claudeKeyEnc: '',
        claudeModel: DEFAULT_CLAUDE_MODEL,
        geminiKeyEnc: '',
        geminiModel: '',
        targetSeconds: 60,
        localBackupMode: 'on_demand',
        localIdleMinutes: 5,
        localResourceMode: 'safe_streaming'
      },
      tts: {
        voice: 'ef_dora',
        speed: 1.0,
        resourceMode: 'safe_streaming',
        pronunciationSmart: true
      },
      visual: {
        fallbackImage: '',
        pauseSeconds: 2.5,
        showSummary: true,
        theme: { yellow: '#F7C600', black: '#000000', white: '#FFFFFF' },
        output: {
          format: '16:9',
          fontFamily: 'Arial',
          dateFontFamily: 'Arial',
          titleColor: '#FFFFFF',
          summaryColor: '#F3F3F3',
          categoryBgColor: '#F7C600',
          categoryTextColor: '#000000',
          lowerBgColor: '#000000',
          lowerOpacity: 0.88,
          animation: 'auto',
          motionSpeed: 'normal',
          tiktokSafe: true,
          showSafeGuides: true,
          verticalVideoBackground: '',
          musicFile: '',
          musicEnabled: false,
          musicLoop: true,
          musicVolume: 20,
          voiceVolume: 100,
          cannedVolume: 100,
          transitionEnabled: true,
          transitionType: 'fade',
          transitionDuration: 0.7
        }
      },
      canned: {
        enabled: false,
        folder: '',
        adsFolder: '',
        insertAdAfterContent: true,
        emergency: true,
        interval: 10
      },
      automation: {
        updateMinutes: 2,
        maxAgeHours: 6,
        bufferReady: 15,
        queueMax: 30,
        avoidRepeats: true,
        onlyMainImage: true,
        activeFeedIds: []
      }
    };
  }

  load() {
    let data = this.defaults();
    let raw = null;
    try {
      if (fs.existsSync(this.file)) {
        raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        data = this.merge(data, raw);
      }
    } catch {}

    if (!String(data.ai?.claudeModel || '').trim()) data.ai.claudeModel = DEFAULT_CLAUDE_MODEL;

    if (raw?.ai && raw.ai.localResourceMode === undefined) {
      data.ai.localResourceMode = 'safe_streaming';
      if (Number(raw.ai.localIdleMinutes) === 10) data.ai.localIdleMinutes = 5;
    }

    if (raw?.automation && Number(raw.automation.bufferReady) === 5 && Number(raw.automation.queueMax) === 12) {
      data.automation.bufferReady = 15;
      data.automation.queueMax = 30;
    }
    return data;
  }

  merge(base, extra) {
    if (!extra || typeof extra !== 'object') return base;
    const out = Array.isArray(base) ? [...extra] : { ...base };
    for (const [k, v] of Object.entries(extra)) {
      if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
        out[k] = this.merge(base[k], v);
      } else out[k] = v;
    }
    return out;
  }

  save(settings) {
    fs.writeFileSync(this.file, JSON.stringify(settings, null, 2), 'utf8');
  }

  encryptSecret(value) {
    if (!value) return '';
    if (safeStorage.isEncryptionAvailable()) return safeStorage.encryptString(value).toString('base64');
    return Buffer.from(value, 'utf8').toString('base64');
  }

  decryptSecret(value) {
    if (!value) return '';
    try {
      const buf = Buffer.from(value, 'base64');
      if (safeStorage.isEncryptionAvailable()) return safeStorage.decryptString(buf);
      return buf.toString('utf8');
    } catch { return ''; }
  }
}

module.exports = { SettingsStore, DEFAULT_CLAUDE_MODEL };
