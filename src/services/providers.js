const DEFAULT_CLAUDE_MODEL='claude-haiku-4-5-20251001';

function extractJson(s) {
  if (!s) throw new Error('La IA devolvió una respuesta vacía');
  let t = String(s).trim().replace(/^```(?:json)?/i,'').replace(/```$/,'').trim();
  t = t.replace(/<think>[\s\S]*?<\/think>/gi,'').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) t = t.slice(a,b+1);
  let data;
  try { data=JSON.parse(t); }
  catch(e){ const err=new Error(`JSON inválido: ${e.message}`); err.code='BAD_JSON'; throw err; }
  const result={
    title: String(data.title || data.titulo || '').trim(),
    category: String(data.category || data.categoria || 'ACTUALIDAD').trim(),
    summary: String(data.summary || data.bajada || data.resumen || '').trim(),
    script: String(data.script || data.guion || '').trim(),
    durationSec: Number(data.duration_sec || data.durationSec || 60)
  };
  if(!result.script) { const err=new Error('La IA no devolvió un guion'); err.code='EMPTY_SCRIPT'; throw err; }
  return result;
}

function compactBody(body,maxChars=12000){
  const raw=String(body||'').split(/\n{2,}|\r?\n/).map(x=>x.replace(/\s+/g,' ').trim()).filter(x=>x.length>35);
  const reject=/^(lee también|también puedes leer|te puede interesar|suscríbete|regístrate|publicidad|newsletter|síguenos|más información|contenido patrocinado)/i;
  const paragraphs=[];const seen=new Set();
  for(const p of raw){
    if(reject.test(p))continue;
    const key=p.toLowerCase();if(seen.has(key))continue;seen.add(key);paragraphs.push(p);
  }
  if(!paragraphs.length)return String(body||'').slice(0,maxChars);
  const joined=paragraphs.join('\n\n');if(joined.length<=maxChars)return joined;
  const selected=new Set();let chars=0;
  const add=i=>{if(selected.has(i))return false;const extra=paragraphs[i].length+(selected.size?2:0);if(chars+extra>maxChars)return false;selected.add(i);chars+=extra;return true;};
  for(let i=0;i<Math.min(6,paragraphs.length);i++)add(i);
  const factRich=/\d|%|S\/|US\$|\$|“|”|\"|según|informó|señaló|dijo|afirmó|explicó|anunció|precisó|indicó|declaró|millones|miles|lunes|martes|miércoles|jueves|viernes|sábado|domingo/i;
  for(let i=6;i<paragraphs.length;i++)if(factRich.test(paragraphs[i]))add(i);
  if(chars<maxChars*0.82){for(let i=6;i<paragraphs.length;i++)add(i);}
  return [...selected].sort((a,b)=>a-b).map(i=>paragraphs[i]).join('\n\n').slice(0,maxChars);
}

function buildPrompt(story,article,targetSeconds){
  const body=compactBody(article.body || story.description || '',12000);
  const prompt=`Eres editor de noticias. Convierte la fuente siguiente en un guion locutable en español neutro latinoamericano, informativo y sobrio, de aproximadamente ${targetSeconds} segundos.

REGLAS OBLIGATORIAS:
- Usa únicamente datos presentes en la fuente.
- No inventes nombres, fechas, cifras, cargos, contexto ni citas.
- Conserva nombres propios, cifras y fechas con precisión.
- Prioriza los hechos esenciales y evita detalles secundarios.
- Para un guion de 60 segundos, apunta a 145-165 palabras.
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

CUERPO DEPURADO:
${body}`;
  return {prompt,inputChars:body.length};
}

const DOCUMENT_CATEGORIES=['POLÍTICA','ECONOMÍA','LIMA','MUNDO','DEPORTES','TECNOLOGÍA','PERÚ','SOCIEDAD','ESPECTÁCULOS','NEGOCIOS','ACTUALIDAD'];
function buildDocumentPrompt(doc,targetSeconds=60,forcedCategory=''){
  const body=compactBody(doc.text||doc.body||'',16000);
  const category=String(forcedCategory||doc.category||'').trim().toUpperCase();
  const categoryRule=category&&category!=='AUTO'
    ?`La categoría DEBE ser exactamente "${category}".`
    :`Elige category únicamente de esta lista: ${DOCUMENT_CATEGORIES.join(', ')}. Si no está claro, usa ACTUALIDAD.`;
  const words=Math.max(70,Math.round(155*(targetSeconds/60)));
  const prompt=`Eres editor de un canal automático de noticias. Recibirás una nota ya redactada, normalmente extensa. Reescríbela como una pieza locutable de aproximadamente ${targetSeconds} segundos.

REGLAS OBLIGATORIAS:
- Usa EXCLUSIVAMENTE hechos presentes en el documento.
- No inventes información, contexto, cargos, cifras, fechas ni citas.
- Conserva con precisión nombres propios, cantidades, porcentajes y fechas relevantes.
- Condensa repeticiones y detalles secundarios; prioriza qué ocurrió, quién, dónde, cuándo y por qué importa.
- Mantén tono periodístico neutral, claro y natural para voz.
- No incluyas saludos, despedidas, instrucciones de producción, URLs ni referencias al archivo.
- Objetivo aproximado: ${words} palabras de guion.
- ${categoryRule}
- Devuelve SOLO JSON válido, sin markdown.

ESQUEMA:
{"title":"titular periodístico breve","category":"categoría","summary":"bajada breve","script":"guion locutable completo","duration_sec":${targetSeconds}}

TÍTULO DE REFERENCIA:
${doc.title||''}

CATEGORÍA DE CARPETA:
${doc.category||''}

DOCUMENTO:
${body}`;
  return{prompt,inputChars:body.length};
}

class ProviderError extends Error {
  constructor(provider, message, code='', retryAfter=0) { super(message); this.provider=provider; this.code=code; this.retryAfter=retryAfter; }
}

const wait=ms=>new Promise(r=>setTimeout(r,ms));
function retryableError(e){
  const code=String(e?.code||'');
  if(['NO_KEY','401','403','NO_MODEL','404'].includes(code)) return false;
  return true;
}
function claudeBody(model,maxTokens,messages){
  const body={model,max_tokens:maxTokens,messages};
  if(/claude-(?:sonnet-5|opus-5)/i.test(String(model||''))) body.thinking={type:'disabled'};
  return body;
}
async function claudeRequest(apiKey,body,timeout=90000){
  const started=Date.now();
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST',headers:{'content-type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01'},
    body:JSON.stringify(body),signal:AbortSignal.timeout(Math.max(1000,timeout))
  });
  if (!r.ok) {
    const retry = Number(r.headers.get('retry-after') || 0);const text = await r.text();
    throw new ProviderError('claude', `Claude HTTP ${r.status}: ${text.slice(0,500)}`, String(r.status), retry);
  }
  const json=await r.json();return {json,elapsedMs:Date.now()-started};
}
async function listClaudeModels(apiKey) {
  if (!apiKey) throw new ProviderError('claude','Falta Claude API Key','NO_KEY');
  const r = await fetch('https://api.anthropic.com/v1/models?limit=100', { headers: { 'x-api-key': apiKey, 'anthropic-version':'2023-06-01' }, signal:AbortSignal.timeout(20000) });
  if (!r.ok) {const body=await r.text();throw new ProviderError('claude', `Claude HTTP ${r.status}: ${body.slice(0,300)}`, String(r.status), Number(r.headers.get('retry-after')||0));}
  const j = await r.json();return (j.data || []).map(x=>x.id);
}
async function claudeGenerate(apiKey, model, prompt) {
  if (!apiKey) throw new ProviderError('claude','Falta Claude API Key','NO_KEY');
  const m=DEFAULT_CLAUDE_MODEL;const {json:j,elapsedMs}=await claudeRequest(apiKey,claudeBody(m,900,[{role:'user',content:prompt}]));
  const out = (j.content || []).filter(x=>x.type==='text').map(x=>x.text).join('\n');const usage=j.usage||{};
  return {model:m,result:extractJson(out),metrics:{elapsedMs,inputTokens:Number(usage.input_tokens||0),outputTokens:Number(usage.output_tokens||0)}};
}
async function claudeProbe(apiKey,model=DEFAULT_CLAUDE_MODEL){
  if (!apiKey) throw new ProviderError('claude','Falta Claude API Key','NO_KEY');
  const {json:j,elapsedMs}=await claudeRequest(apiKey,claudeBody(model,32,[{role:'user',content:'Responde únicamente con la palabra OK.'}]),30000);
  const out=(j.content||[]).filter(x=>x.type==='text').map(x=>x.text).join(' ').trim();
  if(!/^OK\b/i.test(out)) throw new ProviderError('claude',`La API respondió, pero la prueba de generación devolvió: ${out.slice(0,120)||'vacío'}`,'PROBE_FAILED');
  return {elapsedMs};
}

function pronunciationClaudePrompt(items,proposals={}){
  const rows=(items||[]).slice(0,18).map(x=>({term:String(x.term||''),context:String(x.context||'').slice(0,320),local_proposal:proposals?.[x.term]?.to||proposals?.[x.term]?.pronunciation||''}));
  return `Actúa como verificador de pronunciación para un TTS de noticias en español latinoamericano. Revisa cada término usando su contexto. No traduzcas nombres propios ni cambies palabras españolas que Kokoro pueda leer normalmente. Solo adapta términos extranjeros, siglas o marcas cuando ayude claramente al TTS. Usa ortografía española simple y legible; no uses IPA, explicaciones, paréntesis, barras, emojis ni instrucciones. Si no hace falta cambiar un término, marca needs_replacement=false y deja pronunciation vacío. Devuelve SOLO JSON válido con este esquema exacto: {"items":[{"term":"texto exacto","needs_replacement":true,"pronunciation":"aproximación simple","confidence":0.95}]}. Confidence debe estar entre 0 y 1.\n\nENTRADAS:\n${JSON.stringify(rows)}`;
}
function parsePronunciationClaude(raw,allowedTerms){
  let text=String(raw||'').replace(/<think>[\s\S]*?<\/think>/gi,'').trim().replace(/^```(?:json)?/i,'').replace(/```$/,'').trim();
  const a=text.indexOf('{'),b=text.lastIndexOf('}');if(a>=0&&b>a)text=text.slice(a,b+1);
  let data;try{data=JSON.parse(text);}catch(e){throw new ProviderError('claude',`Pronunciación Claude: JSON inválido (${e.message})`,'BAD_JSON');}
  const allowed=new Set((allowedTerms||[]).map(String));const out=[];
  for(const x of Array.isArray(data?.items)?data.items:[]){const term=String(x?.term||'').trim();if(!allowed.has(term))continue;out.push({term,needsReplacement:x?.needs_replacement===true,pronunciation:String(x?.pronunciation||'').trim(),confidence:Math.max(0,Math.min(1,Number(x?.confidence)||0))});}
  return out;
}

async function listGeminiModels(apiKey) {
  if (!apiKey) throw new ProviderError('gemini','Falta Gemini API Key','NO_KEY');
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,{signal:AbortSignal.timeout(20000)});
  if (!r.ok) {const body=await r.text();throw new ProviderError('gemini', `Gemini HTTP ${r.status}: ${body.slice(0,300)}`, String(r.status), Number(r.headers.get('retry-after')||0));}
  const j = await r.json();return (j.models || []).filter(x => (x.supportedGenerationMethods||[]).includes('generateContent')).map(x=>x.name.replace(/^models\//,''));
}
async function geminiGenerate(apiKey, model, prompt) {
  if (!apiKey) throw new ProviderError('gemini','Falta Gemini API Key','NO_KEY');let m = model;
  if (!m) {const models = await listGeminiModels(apiKey);m = models.find(x=>/flash/i.test(x) && !/image|tts|live/i.test(x)) || models[0];}
  if (!m) throw new ProviderError('gemini','No se encontró un modelo Gemini disponible','NO_MODEL');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${encodeURIComponent(apiKey)}`;const started=Date.now();
  const r = await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{temperature:0.15,responseMimeType:'application/json'}}),signal:AbortSignal.timeout(90000)});
  if (!r.ok) {const body = await r.text();throw new ProviderError('gemini', `Gemini HTTP ${r.status}: ${body.slice(0,500)}`, String(r.status), Number(r.headers.get('retry-after')||0));}
  const j = await r.json();const out = j?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('\n') || '';
  return {model:m,result:extractJson(out),metrics:{elapsedMs:Date.now()-started,inputTokens:Number(j?.usageMetadata?.promptTokenCount||0),outputTokens:Number(j?.usageMetadata?.candidatesTokenCount||0)}};
}

class Providers {
  constructor({ settingsStore, localRuntime }) {this.settingsStore=settingsStore;this.localRuntime=localRuntime;this.cooldownUntil={claude:0,gemini:0,local:0};this.claudeModelsCache={items:[],at:0};}
  async getClaudeModels(key,force=false){if(!force&&this.claudeModelsCache.items.length&&Date.now()-this.claudeModelsCache.at<30*60000)return this.claudeModelsCache.items;const items=await listClaudeModels(key);this.claudeModelsCache={items,at:Date.now()};return items;}
  async test(provider, settings) {
    if (provider==='local') return this.localRuntime.status();
    if (provider==='claude') {const key=this.settingsStore.decryptSecret(settings.ai.claudeKeyEnc);const models=await this.getClaudeModels(key,true);if(!models.includes(DEFAULT_CLAUDE_MODEL))throw new ProviderError('claude',`La API Key funciona, pero ${DEFAULT_CLAUDE_MODEL} no aparece disponible en esta cuenta.`,'NO_MODEL');const probe=await claudeProbe(key,DEFAULT_CLAUDE_MODEL);return {ok:true,keyStored:!!settings.ai.claudeKeyEnc,models,model:DEFAULT_CLAUDE_MODEL,generationOk:true,elapsedMs:probe.elapsedMs};}
    if (provider==='gemini') {const key=this.settingsStore.decryptSecret(settings.ai.geminiKeyEnc);const models=await listGeminiModels(key);return {ok:true,keyStored:!!settings.ai.geminiKeyEnc,models,model:settings.ai.geminiModel||models.find(x=>/flash/i.test(x) && !/image|tts|live/i.test(x))||models[0]||''};}
    return {ok:false};
  }
  async verifyPronunciations(items,proposals,settings,timeoutMs=6000){
    if(settings?.tts?.pronunciationClaudeVerify===false)return{used:false,reason:'disabled',items:[]};const key=this.settingsStore.decryptSecret(settings?.ai?.claudeKeyEnc||'');if(!key)return{used:false,reason:'no-key',items:[]};
    const terms=(items||[]).map(x=>String(x.term||'')).filter(Boolean);if(!terms.length)return{used:false,reason:'empty',items:[]};
    const prompt=pronunciationClaudePrompt(items,proposals);const {json,elapsedMs}=await claudeRequest(key,claudeBody(DEFAULT_CLAUDE_MODEL,700,[{role:'user',content:prompt}]),Math.max(1500,timeoutMs));
    const raw=(json.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');return{used:true,model:DEFAULT_CLAUDE_MODEL,elapsedMs,items:parsePronunciationClaude(raw,terms)};
  }
  localIsBackup(settings){return settings.ai.primary!=='local' && [settings.ai.backup1,settings.ai.backup2].includes('local');}
  async callProvider(provider,prompt,settings){
    if(provider==='local'){
      this.localRuntime.configure(settings.ai.localResourceMode||'safe_streaming');const onDemand=this.localIsBackup(settings) && (settings.ai.localBackupMode||'on_demand')==='on_demand';const started=Date.now();
      try{const text=await this.localRuntime.generate(prompt);return {model:'Qwen3-8B-Q4_K_M',result:extractJson(text),metrics:{elapsedMs:Date.now()-started,inputTokens:0,outputTokens:0}};}
      finally{if(onDemand){const minutes=Math.max(1,Math.min(60,Number(settings.ai.localIdleMinutes)||5));this.localRuntime.scheduleIdleStop(minutes*60000);}}
    }
    if(provider==='claude'){const key=this.settingsStore.decryptSecret(settings.ai.claudeKeyEnc);return claudeGenerate(key,DEFAULT_CLAUDE_MODEL,prompt);}
    if(provider==='gemini'){const key=this.settingsStore.decryptSecret(settings.ai.geminiKeyEnc);return geminiGenerate(key,settings.ai.geminiModel,prompt);}
    throw new ProviderError(provider,'Proveedor desconocido','UNKNOWN_PROVIDER');
  }
  setCooldown(provider,e){if(String(e?.code)!=='429') return;const seconds=Math.max(15,Math.min(300,Number(e.retryAfter)||30));this.cooldownUntil[provider]=Date.now()+seconds*1000;}
  async generateBuilt(built,settings,order){
    const attempts=[];
    for (const provider of order) {
      const cooldown=Math.max(0,(this.cooldownUntil[provider]||0)-Date.now());
      if(cooldown>0){attempts.push({provider,attempt:0,ok:false,code:'COOLDOWN',message:`En espera por límite de uso (${Math.ceil(cooldown/1000)} s)`});continue;}
      for(let n=1;n<=2;n++){
        try {const out=await this.callProvider(provider,built.prompt,settings);const metrics={...(out.metrics||{}),inputChars:built.inputChars};attempts.push({provider,attempt:n,ok:true,model:out.model||'',elapsedMs:metrics.elapsedMs||0});return {provider,model:out.model||'',result:out.result,attempts,metrics};}
        catch (e) {this.setCooldown(provider,e);attempts.push({provider,attempt:n,ok:false,message:e.message,code:e.code||''});if(String(e.code)==='429') break;if(n>=2 || !retryableError(e)) break;await wait(e.retryAfter?Math.min(e.retryAfter*1000,10000):900);}
      }
    }
    const err = new Error('Todos los proveedores de IA fallaron');err.details=attempts;throw err;
  }
  async generate(story, article, settings) {
    const built=buildPrompt(story, article, settings.ai.targetSeconds || 60);const order = [settings.ai.primary, settings.ai.backup1, settings.ai.backup2].filter((x,i,a)=>x && x!=='none' && a.indexOf(x)===i);
    return this.generateBuilt(built,settings,order);
  }
  async generateDocument(doc,settings,options={}){
    const targetSeconds=Math.max(30,Math.min(180,Number(options.targetSeconds)||Number(settings?.documents?.targetSeconds)||60));
    const forcedCategory=String(options.category||'').trim();const built=buildDocumentPrompt(doc,targetSeconds,forcedCategory);
    const configured=[settings.ai.primary,settings.ai.backup1,settings.ai.backup2].filter(x=>x&&x!=='none');
    const hasClaude=!!String(settings.ai.claudeKeyEnc||'');const order=[];
    if(hasClaude)order.push('claude');for(const p of configured)if(!order.includes(p))order.push(p);
    const out=await this.generateBuilt(built,settings,order);
    if(forcedCategory&&forcedCategory.toLowerCase()!=='auto')out.result.category=forcedCategory.toUpperCase();
    return out;
  }
}

module.exports = { Providers, ProviderError, listClaudeModels, listGeminiModels, extractJson, compactBody, buildDocumentPrompt, DEFAULT_CLAUDE_MODEL, parsePronunciationClaude };
