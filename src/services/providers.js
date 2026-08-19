function extractJson(s) {
  if (!s) throw new Error('La IA devolvió una respuesta vacía');
  let t = String(s).trim().replace(/^```(?:json)?/i,'').replace(/```$/,'').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) t = t.slice(a,b+1);
  const data = JSON.parse(t);
  return {
    title: String(data.title || data.titulo || '').trim(),
    category: String(data.category || data.categoria || 'ACTUALIDAD').trim(),
    summary: String(data.summary || data.bajada || data.resumen || '').trim(),
    script: String(data.script || data.guion || '').trim(),
    durationSec: Number(data.duration_sec || data.durationSec || 60)
  };
}

function promptFor(story, article, targetSeconds) {
  return `Eres editor de noticias. Convierte la nota siguiente en un guion locutable en español neutro latinoamericano, informativo y sobrio, de aproximadamente ${targetSeconds} segundos.

REGLAS OBLIGATORIAS:
- Usa únicamente datos presentes en la fuente.
- No inventes nombres, fechas, cifras, cargos, contexto ni citas.
- Conserva nombres propios, cifras y fechas con precisión.
- Redacta para ser escuchado, con frases naturales y claras.
- Evita editorializar y evita lenguaje sensacionalista.
- No incluyas saludos, despedidas ni indicaciones de producción.
- Devuelve SOLO JSON válido, sin markdown.

ESQUEMA:
{"title":"titular breve","category":"categoría","summary":"bajada de una frase","script":"guion completo","duration_sec":${targetSeconds}}

TITULAR ORIGINAL:
${story.title || article.title || ''}

BAJADA ORIGINAL:
${story.description || article.description || ''}

CATEGORÍA:
${story.category || article.category || ''}

CUERPO:
${article.body || story.description || ''}`;
}

class ProviderError extends Error {
  constructor(provider, message, code='', retryAfter=0) { super(message); this.provider=provider; this.code=code; this.retryAfter=retryAfter; }
}

async function listClaudeModels(apiKey) {
  const r = await fetch('https://api.anthropic.com/v1/models?limit=100', { headers: { 'x-api-key': apiKey, 'anthropic-version':'2023-06-01' } });
  if (!r.ok) throw new ProviderError('claude', `Claude HTTP ${r.status}`, String(r.status));
  const j = await r.json();
  return (j.data || []).map(x=>x.id);
}

async function claudeGenerate(apiKey, model, prompt) {
  if (!apiKey) throw new ProviderError('claude','Falta Claude API Key','NO_KEY');
  let m = model;
  if (!m) {
    const models = await listClaudeModels(apiKey);
    m = models.find(x=>/sonnet/i.test(x)) || models[0];
  }
  if (!m) throw new ProviderError('claude','No se encontró un modelo Claude disponible','NO_MODEL');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST',
    headers:{'content-type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01'},
    body:JSON.stringify({model:m,max_tokens:1200,temperature:0.15,messages:[{role:'user',content:prompt}]})
  });
  if (!r.ok) {
    const retry = Number(r.headers.get('retry-after') || 0);
    const body = await r.text();
    throw new ProviderError('claude', `Claude HTTP ${r.status}: ${body.slice(0,300)}`, String(r.status), retry);
  }
  const j = await r.json();
  const out = (j.content || []).filter(x=>x.type==='text').map(x=>x.text).join('\n');
  return extractJson(out);
}

async function listGeminiModels(apiKey) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`);
  if (!r.ok) throw new ProviderError('gemini', `Gemini HTTP ${r.status}`, String(r.status));
  const j = await r.json();
  return (j.models || []).filter(x => (x.supportedGenerationMethods||[]).includes('generateContent')).map(x=>x.name.replace(/^models\//,''));
}

async function geminiGenerate(apiKey, model, prompt) {
  if (!apiKey) throw new ProviderError('gemini','Falta Gemini API Key','NO_KEY');
  let m = model;
  if (!m) {
    const models = await listGeminiModels(apiKey);
    m = models.find(x=>/flash/i.test(x) && !/image|tts|live/i.test(x)) || models[0];
  }
  if (!m) throw new ProviderError('gemini','No se encontró un modelo Gemini disponible','NO_MODEL');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const r = await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{temperature:0.15,responseMimeType:'application/json'}})});
  if (!r.ok) {
    const body = await r.text();
    throw new ProviderError('gemini', `Gemini HTTP ${r.status}: ${body.slice(0,300)}`, String(r.status));
  }
  const j = await r.json();
  const out = j?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('\n') || '';
  return extractJson(out);
}

class Providers {
  constructor({ settingsStore, localRuntime }) { this.settingsStore=settingsStore; this.localRuntime=localRuntime; }

  async test(provider, settings) {
    if (provider==='local') return this.localRuntime.status();
    if (provider==='claude') {
      const key=this.settingsStore.decryptSecret(settings.ai.claudeKeyEnc); const models=await listClaudeModels(key); return {ok:true,models};
    }
    if (provider==='gemini') {
      const key=this.settingsStore.decryptSecret(settings.ai.geminiKeyEnc); const models=await listGeminiModels(key); return {ok:true,models};
    }
    return {ok:false};
  }

  async generate(story, article, settings) {
    const prompt = promptFor(story, article, settings.ai.targetSeconds || 60);
    const order = [settings.ai.primary, settings.ai.backup1, settings.ai.backup2].filter((x,i,a)=>x && x!=='none' && a.indexOf(x)===i);
    const errors=[];
    for (const provider of order) {
      try {
        if (provider==='local') return {provider, result: extractJson(await this.localRuntime.generate(prompt))};
        if (provider==='claude') {
          const key=this.settingsStore.decryptSecret(settings.ai.claudeKeyEnc);
          return {provider,result:await claudeGenerate(key,settings.ai.claudeModel,prompt)};
        }
        if (provider==='gemini') {
          const key=this.settingsStore.decryptSecret(settings.ai.geminiKeyEnc);
          return {provider,result:await geminiGenerate(key,settings.ai.geminiModel,prompt)};
        }
      } catch (e) { errors.push({provider,message:e.message,code:e.code||''}); }
    }
    const err = new Error('Todos los proveedores de IA fallaron'); err.details=errors; throw err;
  }
}

module.exports = { Providers, ProviderError, listClaudeModels, listGeminiModels };
