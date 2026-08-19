function extractJson(s) {
  if (!s) throw new Error('La IA devolvió una respuesta vacía');
  let t = String(s).trim().replace(/^```(?:json)?/i,'').replace(/```$/,'').trim();
  t = t.replace(/<think>[\s\S]*?<\/think>/gi,'').trim();
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
- Devuelve SOLO JSON válido, sin markdown ni texto antes/después.

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

const wait=ms=>new Promise(r=>setTimeout(r,ms));
function retryableError(e){
  const code=String(e?.code||'');
  if(['NO_KEY','401','403','NO_MODEL'].includes(code)) return false;
  return true;
}

async function listClaudeModels(apiKey) {
  if (!apiKey) throw new ProviderError('claude','Falta Claude API Key','NO_KEY');
  const r = await fetch('https://api.anthropic.com/v1/models?limit=100', { headers: { 'x-api-key': apiKey, 'anthropic-version':'2023-06-01' } });
  if (!r.ok) {
    const body=await r.text();
    throw new ProviderError('claude', `Claude HTTP ${r.status}: ${body.slice(0,220)}`, String(r.status));
  }
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
    body:JSON.stringify({model:m,max_tokens:1600,temperature:0.15,messages:[{role:'user',content:prompt}]})
  });
  if (!r.ok) {
    const retry = Number(r.headers.get('retry-after') || 0);
    const body = await r.text();
    throw new ProviderError('claude', `Claude HTTP ${r.status}: ${body.slice(0,300)}`, String(r.status), retry);
  }
  const j = await r.json();
  const out = (j.content || []).filter(x=>x.type==='text').map(x=>x.text).join('\n');
  return {model:m,result:extractJson(out)};
}

async function listGeminiModels(apiKey) {
  if (!apiKey) throw new ProviderError('gemini','Falta Gemini API Key','NO_KEY');
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`);
  if (!r.ok) {
    const body=await r.text();
    throw new ProviderError('gemini', `Gemini HTTP ${r.status}: ${body.slice(0,220)}`, String(r.status));
  }
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
  return {model:m,result:extractJson(out)};
}

class Providers {
  constructor({ settingsStore, localRuntime }) { this.settingsStore=settingsStore; this.localRuntime=localRuntime; }

  async test(provider, settings) {
    if (provider==='local') return this.localRuntime.status();
    if (provider==='claude') {
      const key=this.settingsStore.decryptSecret(settings.ai.claudeKeyEnc);
      const models=await listClaudeModels(key);
      return {ok:true,keyStored:!!settings.ai.claudeKeyEnc,models,model:settings.ai.claudeModel||models.find(x=>/sonnet/i.test(x))||models[0]||''};
    }
    if (provider==='gemini') {
      const key=this.settingsStore.decryptSecret(settings.ai.geminiKeyEnc);
      const models=await listGeminiModels(key);
      return {ok:true,keyStored:!!settings.ai.geminiKeyEnc,models,model:settings.ai.geminiModel||models.find(x=>/flash/i.test(x) && !/image|tts|live/i.test(x))||models[0]||''};
    }
    return {ok:false};
  }

  async callProvider(provider,prompt,settings){
    if(provider==='local') return {model:'Qwen3-8B-Q4_K_M',result:extractJson(await this.localRuntime.generate(prompt))};
    if(provider==='claude'){
      const key=this.settingsStore.decryptSecret(settings.ai.claudeKeyEnc);
      return claudeGenerate(key,settings.ai.claudeModel,prompt);
    }
    if(provider==='gemini'){
      const key=this.settingsStore.decryptSecret(settings.ai.geminiKeyEnc);
      return geminiGenerate(key,settings.ai.geminiModel,prompt);
    }
    throw new ProviderError(provider,'Proveedor desconocido','UNKNOWN_PROVIDER');
  }

  async generate(story, article, settings) {
    const prompt = promptFor(story, article, settings.ai.targetSeconds || 60);
    const order = [settings.ai.primary, settings.ai.backup1, settings.ai.backup2].filter((x,i,a)=>x && x!=='none' && a.indexOf(x)===i);
    const attempts=[];
    for (const provider of order) {
      for(let n=1;n<=2;n++){
        try {
          const out=await this.callProvider(provider,prompt,settings);
          attempts.push({provider,attempt:n,ok:true,model:out.model||''});
          return {provider,model:out.model||'',result:out.result,attempts};
        } catch (e) {
          attempts.push({provider,attempt:n,ok:false,message:e.message,code:e.code||''});
          if(n>=2 || !retryableError(e)) break;
          await wait(e.retryAfter?Math.min(e.retryAfter*1000,10000):800);
        }
      }
    }
    const err = new Error('Todos los proveedores de IA fallaron');
    err.details=attempts;
    throw err;
  }
}

module.exports = { Providers, ProviderError, listClaudeModels, listGeminiModels };
