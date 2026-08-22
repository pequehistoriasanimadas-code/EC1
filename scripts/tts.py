import argparse, json, re, sys, time
import numpy as np
import soundfile as sf

p=argparse.ArgumentParser()
p.add_argument('--text-file')
p.add_argument('--output')
p.add_argument('--voice',default='ef_dora')
p.add_argument('--speed',type=float,default=1.0)
p.add_argument('--model')
p.add_argument('--voices')
p.add_argument('--onnx-intra',type=int,default=2)
p.add_argument('--onnx-inter',type=int,default=1)
p.add_argument('--list-voices',action='store_true')
p.add_argument('--worker',action='store_true')
a=p.parse_args()

if a.list_voices:
    data=np.load(a.voices)
    print(json.dumps({'voices':sorted(list(data.keys()))},ensure_ascii=False),flush=True)
    sys.exit(0)

import onnxruntime as ort
_original_inference_session=ort.InferenceSession

def _limited_inference_session(path_or_bytes, sess_options=None, providers=None, provider_options=None, **kwargs):
    opts=ort.SessionOptions()
    opts.intra_op_num_threads=max(1,int(a.onnx_intra or 1))
    opts.inter_op_num_threads=max(1,int(a.onnx_inter or 1))
    opts.execution_mode=ort.ExecutionMode.ORT_SEQUENTIAL
    try:
        opts.graph_optimization_level=ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    except Exception:
        pass
    call_kwargs=dict(kwargs)
    if providers is not None:
        call_kwargs['providers']=providers
    if provider_options is not None:
        call_kwargs['provider_options']=provider_options
    return _original_inference_session(path_or_bytes,sess_options=opts,**call_kwargs)

ort.InferenceSession=_limited_inference_session

# Resuelve eSpeak desde la ubicación ACTUAL del runtime portable. Estas rutas se
# fijan una sola vez al arrancar el worker y el mismo G2P se reutiliza entre notas.
import espeakng_loader
from phonemizer.backend.espeak.wrapper import EspeakWrapper
try:
    espeakng_loader.make_library_available()
except Exception:
    pass
_ESPEAK_LIBRARY=str(espeakng_loader.get_library_path())
_ESPEAK_DATA=str(espeakng_loader.get_data_path())
EspeakWrapper.set_library(_ESPEAK_LIBRARY)
EspeakWrapper.set_data_path(_ESPEAK_DATA)

from kokoro_onnx import Kokoro
from misaki.espeak import EspeakG2P

def _currency_phrase(amount, scale, currency):
    scale=(scale or '').strip()
    if not scale:
        return f'{amount} {currency}'
    needs_de=scale.lower().startswith(('millón','millones','billón','billones'))
    return f'{amount} {scale}{" de" if needs_de else ""} {currency}'

def normalize_currency(text):
    def soles(m): return _currency_phrase(m.group(1),m.group(2),'soles')
    def dollars(m): return _currency_phrase(m.group(1),m.group(2),'dólares')
    scale=r'(millones?|billones?|miles?|mil)?'
    text=re.sub(r'S/\s*(\d+(?:[.,]\d+)?)\s*'+scale,soles,text,flags=re.I)
    text=re.sub(r'(?:US\$|USD|\$)\s*(\d+(?:[.,]\d+)?)\s*'+scale,dollars,text,flags=re.I)
    text=re.sub(r'(\d+(?:[.,]\d+)?)\s+soles\s+(millones?|billones?)',lambda m:f'{m.group(1)} {m.group(2)} de soles',text,flags=re.I)
    text=re.sub(r'(\d+(?:[.,]\d+)?)\s+dólares\s+(millones?|billones?)',lambda m:f'{m.group(1)} {m.group(2)} de dólares',text,flags=re.I)
    text=re.sub(r'(\d+(?:[.,]\d+)?)\s+soles\s+(mil|miles)',lambda m:f'{m.group(1)} {m.group(2)} soles',text,flags=re.I)
    text=re.sub(r'(\d+(?:[.,]\d+)?)\s+dólares\s+(mil|miles)',lambda m:f'{m.group(1)} {m.group(2)} dólares',text,flags=re.I)
    return text

def load_engine():
    styles=np.load(a.voices)
    voices=list(styles.files)
    g2p=EspeakG2P(language='es')
    kokoro=Kokoro(a.model,a.voices)
    return styles,voices,g2p,kokoro

def synthesize(text_file,output,voice,speed,engine):
    styles,voices,g2p,kokoro=engine
    with open(text_file,'r',encoding='utf-8') as f:
        text=f.read().strip()
    if not text:
        raise ValueError('Texto vacío')
    text=normalize_currency(text)
    selected=voice if voice in styles.files else next((v for v in voices if v.startswith('e')),voices[0])
    started=time.perf_counter()
    phonemes,_=g2p(text)
    phoneme_ms=(time.perf_counter()-started)*1000.0
    infer_started=time.perf_counter()
    samples,sr=kokoro.create(phonemes,voice=selected,speed=float(speed),is_phonemes=True)
    inference_ms=(time.perf_counter()-infer_started)*1000.0
    sf.write(output,samples,sr)
    duration=float(len(samples))/float(sr)
    return {
        'ok':True,'voice':selected,'sample_rate':sr,'duration_sec':duration,
        'onnx_intra_threads':max(1,int(a.onnx_intra or 1)),
        'onnx_inter_threads':max(1,int(a.onnx_inter or 1)),
        'execution_mode':'sequential','phoneme_ms':round(phoneme_ms,2),'inference_ms':round(inference_ms,2)
    }

def emit_worker(payload):
    print('ECJSON '+json.dumps(payload,ensure_ascii=False),flush=True)

if a.worker:
    try:
        engine=load_engine()
        emit_worker({'type':'ready','ok':True,'voices':len(engine[1]),'onnx_intra_threads':max(1,int(a.onnx_intra or 1)),'espeak_data':_ESPEAK_DATA})
    except Exception as e:
        emit_worker({'type':'ready','ok':False,'error':str(e)})
        sys.exit(2)
    for raw in sys.stdin:
        raw=raw.strip()
        if not raw:
            continue
        req_id=''
        try:
            req=json.loads(raw);req_id=str(req.get('id',''));cmd=req.get('cmd','')
            if cmd=='stop':
                emit_worker({'id':req_id,'ok':True,'stopped':True});break
            if cmd=='ping':
                emit_worker({'id':req_id,'ok':True,'pong':True});continue
            if cmd!='generate':
                raise ValueError('Comando no reconocido')
            result=synthesize(req.get('text_file',''),req.get('output',''),req.get('voice','ef_dora'),req.get('speed',1.0),engine)
            result['id']=req_id;emit_worker(result)
        except Exception as e:
            emit_worker({'id':req_id,'ok':False,'error':str(e)})
    sys.exit(0)

engine=load_engine()
result=synthesize(a.text_file,a.output,a.voice,a.speed,engine)
print(json.dumps(result,ensure_ascii=False),flush=True)
