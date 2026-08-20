import argparse, json, sys
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
a=p.parse_args()

if a.list_voices:
    data=np.load(a.voices)
    print(json.dumps({'voices':sorted(list(data.keys()))},ensure_ascii=False))
    sys.exit(0)

# Kokoro usa ONNX Runtime internamente. Las variables OMP/BLAS no bastan para
# limitar el pool propio de ONNX, por eso interceptamos la creación de la sesión
# antes de importar kokoro_onnx y aplicamos SessionOptions explícitas.
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

from kokoro_onnx import Kokoro
from misaki.espeak import EspeakG2P

with open(a.text_file,'r',encoding='utf-8') as f:
    text=f.read().strip()
if not text:
    raise SystemExit('Texto vacío')

styles=np.load(a.voices)
voice=a.voice if a.voice in styles.files else next((v for v in styles.files if v.startswith('e')), styles.files[0])
g2p=EspeakG2P(language='es')
phonemes,_=g2p(text)
kokoro=Kokoro(a.model,a.voices)
samples,sr=kokoro.create(phonemes,voice=voice,speed=a.speed,is_phonemes=True)
sf.write(a.output,samples,sr)
duration=float(len(samples))/float(sr)
print(json.dumps({
    'ok':True,
    'voice':voice,
    'sample_rate':sr,
    'duration_sec':duration,
    'onnx_intra_threads':max(1,int(a.onnx_intra or 1)),
    'onnx_inter_threads':max(1,int(a.onnx_inter or 1)),
    'execution_mode':'sequential'
},ensure_ascii=False))
