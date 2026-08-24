import argparse, hashlib, json, os, re, shutil, sys, tempfile, time
from pathlib import Path
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
p.add_argument('--onnx-mode',choices=['sequential','parallel'],default='sequential')
p.add_argument('--onnx-provider',choices=['cpu','cuda'],default='cpu')
p.add_argument('--gpu-mem-limit-mb',type=int,default=3072)
p.add_argument('--spin-duration-us',type=int,default=-1)
p.add_argument('--spin-backoff-max',type=int,default=1)
p.add_argument('--list-voices',action='store_true')
p.add_argument('--worker',action='store_true')
a=p.parse_args()

if a.list_voices:
    data=np.load(a.voices)
    print(json.dumps({'voices':sorted(list(data.keys()))},ensure_ascii=False),flush=True)
    sys.exit(0)

import onnxruntime as ort
_original_inference_session=ort.InferenceSession
_ACTIVE_PROVIDERS=[]
_REQUESTED_PROVIDER='cuda' if str(a.onnx_provider).lower()=='cuda' else 'cpu'

if _REQUESTED_PROVIDER=='cuda':
    # El runtime GPU se instala dentro de la carpeta de datos de EC. Desde ORT
    # 1.21 preload_dlls puede cargar CUDA/cuDNN desde los paquetes NVIDIA de
    # site-packages, por lo que el usuario no necesita instalar CUDA en Windows.
    try:
        if hasattr(ort,'preload_dlls'):
            ort.preload_dlls(directory='')
    except Exception as e:
        raise RuntimeError(f'No se pudieron cargar las bibliotecas NVIDIA CUDA/cuDNN: {e}')

def _limited_inference_session(path_or_bytes, sess_options=None, providers=None, provider_options=None, **kwargs):
    global _ACTIVE_PROVIDERS
    opts=ort.SessionOptions()
    intra=max(0,int(a.onnx_intra if a.onnx_intra is not None else 0))
    inter=max(1,int(a.onnx_inter or 1))
    mode='parallel' if str(a.onnx_mode).lower()=='parallel' else 'sequential'
    # intra=0 deja que ONNX Runtime use sus núcleos físicos y afinidad automática.
    opts.intra_op_num_threads=intra
    opts.inter_op_num_threads=inter
    opts.execution_mode=ort.ExecutionMode.ORT_PARALLEL if mode=='parallel' else ort.ExecutionMode.ORT_SEQUENTIAL
    try:
        opts.graph_optimization_level=ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    except Exception:
        pass
    spin_duration=int(a.spin_duration_us if a.spin_duration_us is not None else -1)
    spin_backoff=max(1,int(a.spin_backoff_max or 1))
    try:
        if spin_duration>=0:
            opts.add_session_config_entry('session.intra_op.spin_duration_us',str(spin_duration))
            if mode=='parallel':
                opts.add_session_config_entry('session.inter_op.spin_duration_us',str(spin_duration))
        if spin_backoff>1:
            opts.add_session_config_entry('session.intra_op.spin_backoff_max',str(spin_backoff))
            if mode=='parallel':
                opts.add_session_config_entry('session.inter_op.spin_backoff_max',str(spin_backoff))
    except Exception:
        pass

    call_kwargs=dict(kwargs)
    if _REQUESTED_PROVIDER=='cuda':
        available=list(ort.get_available_providers())
        if 'CUDAExecutionProvider' not in available:
            raise RuntimeError(f'CUDAExecutionProvider no está disponible. Proveedores detectados: {", ".join(available) or "ninguno"}')
        mem_limit=max(512,min(8192,int(a.gpu_mem_limit_mb or 3072)))*1024*1024
        cuda_options={
            'device_id':'0',
            'gpu_mem_limit':str(mem_limit),
            'arena_extend_strategy':'kSameAsRequested',
            'cudnn_conv_algo_search':'HEURISTIC',
            'do_copy_in_default_stream':'1'
        }
        call_kwargs['providers']=[('CUDAExecutionProvider',cuda_options),'CPUExecutionProvider']
    else:
        # Incluso si el runtime CUDA está descargado, el baseline CPU debe ser
        # realmente CPU para que el benchmark compare hardware de forma limpia.
        call_kwargs['providers']=['CPUExecutionProvider']

    session=_original_inference_session(path_or_bytes,sess_options=opts,**call_kwargs)
    try:
        _ACTIVE_PROVIDERS=list(session.get_providers())
    except Exception:
        _ACTIVE_PROVIDERS=[]
    if _REQUESTED_PROVIDER=='cuda' and (not _ACTIVE_PROVIDERS or _ACTIVE_PROVIDERS[0]!='CUDAExecutionProvider'):
        raise RuntimeError(f'ONNX Runtime no activó CUDA. Proveedores activos: {", ".join(_ACTIVE_PROVIDERS) or "ninguno"}')
    return session

ort.InferenceSession=_limited_inference_session

# eSpeak portable en Windows.
# Misaki vuelve a pedir las rutas a espeakng_loader durante su importación, por
# lo que no basta con configurar EspeakWrapper una vez. EC prepara una copia
# corta/controlada del DLL + espeak-ng-data y parchea los getters del loader
# antes de importar Misaki. Así cualquier inicialización posterior recibe las
# mismas rutas válidas aunque el Portable haya sido movido o renombrado.
import espeakng_loader
_SOURCE_LIBRARY=Path(espeakng_loader.get_library_path()).resolve()
_SOURCE_DATA=Path(espeakng_loader.get_data_path()).resolve()
_SOURCE_PHONTAB=_SOURCE_DATA/'phontab'
if not _SOURCE_LIBRARY.is_file():
    raise RuntimeError(f'eSpeak DLL no encontrada: {_SOURCE_LIBRARY}')
if not _SOURCE_PHONTAB.is_file():
    raise RuntimeError(f'eSpeak phontab no encontrado: {_SOURCE_PHONTAB}')

def _short_windows_path(value):
    value=str(value)
    if os.name!='nt':
        return value
    try:
        import ctypes
        size=ctypes.windll.kernel32.GetShortPathNameW(value,None,0)
        if size:
            buf=ctypes.create_unicode_buffer(size+1)
            if ctypes.windll.kernel32.GetShortPathNameW(value,buf,len(buf)):
                return buf.value
    except Exception:
        pass
    return value

def _prepare_espeak_runtime():
    fingerprint=hashlib.sha1(f'{_SOURCE_LIBRARY.stat().st_size}:{_SOURCE_PHONTAB.stat().st_size}:{int(_SOURCE_PHONTAB.stat().st_mtime)}'.encode()).hexdigest()[:12]
    bases=[Path(tempfile.gettempdir())/'EC-ESpeak-Runtime']
    system_root=os.environ.get('SystemRoot','').strip()
    if system_root:
        bases.append(Path(system_root)/'Temp'/'EC-ESpeak-Runtime')
    last_error=None
    for base in bases:
        try:
            target=base/fingerprint
            lib=target/'espeak-ng.dll'
            data=target/'espeak-ng-data'
            phontab=data/'phontab'
            target.mkdir(parents=True,exist_ok=True)
            probe=target/'.write-test'
            probe.write_text('ok',encoding='ascii')
            probe.unlink(missing_ok=True)
            if not lib.is_file():
                shutil.copy2(_SOURCE_LIBRARY,lib)
            if not phontab.is_file():
                if data.exists():
                    shutil.rmtree(data,ignore_errors=True)
                shutil.copytree(_SOURCE_DATA,data)
            if lib.is_file() and phontab.is_file():
                return Path(_short_windows_path(lib)),Path(_short_windows_path(data))
        except Exception as e:
            last_error=e
    raise RuntimeError(f'No se pudo preparar eSpeak portable: {last_error or "ruta temporal no disponible"}')

_ESPEAK_LIBRARY_PATH,_ESPEAK_DATA_PATH=_prepare_espeak_runtime()
_ESPEAK_LIBRARY=str(_ESPEAK_LIBRARY_PATH)
_ESPEAK_DATA=str(_ESPEAK_DATA_PATH)
_ESPEAK_PHONTAB=str(_ESPEAK_DATA_PATH/'phontab')
if os.name=='nt':
    try:
        os.add_dll_directory(str(_ESPEAK_LIBRARY_PATH.parent))
    except Exception:
        pass
os.environ['PHONEMIZER_ESPEAK_LIBRARY']=_ESPEAK_LIBRARY
os.environ['PHONEMIZER_ESPEAK_DATA_PATH']=_ESPEAK_DATA
os.environ['ESPEAK_DATA_PATH']=_ESPEAK_DATA

# Crítico: misaki.espeak ejecuta EspeakWrapper.set_* usando estos getters al
# importarse. Los apuntamos al runtime preparado para impedir que vuelva a la
# ruta original o a la ruta de compilación D:/a/....
espeakng_loader.get_library_path=lambda: _ESPEAK_LIBRARY
espeakng_loader.get_data_path=lambda: _ESPEAK_DATA

from phonemizer.backend.espeak.wrapper import EspeakWrapper
EspeakWrapper.set_library(_ESPEAK_LIBRARY)
EspeakWrapper.set_data_path(_ESPEAK_DATA)

from kokoro_onnx import Kokoro
from misaki.espeak import EspeakG2P

# Misaki puede haber configurado de nuevo el wrapper durante el import; fijamos
# una última vez las rutas controladas antes de crear cualquier G2P.
EspeakWrapper.set_library(_ESPEAK_LIBRARY)
EspeakWrapper.set_data_path(_ESPEAK_DATA)

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

def _available_languages():
    wrapper=EspeakWrapper()
    langs=sorted({str(getattr(v,'language','') or '').lower() for v in wrapper.available_voices() if getattr(v,'language','')})
    return langs

def _has_spanish(langs):
    return any(x=='es' or x.startswith('es-') for x in langs)

def load_engine():
    styles=np.load(a.voices)
    voices=list(styles.files)
    languages=_available_languages()
    if not _has_spanish(languages):
        sample=', '.join(languages[:18]) or 'ninguno'
        raise RuntimeError(f'eSpeak inició pero no cargó el idioma español. Idiomas detectados: {sample}')
    g2p=EspeakG2P(language='es')
    probe,_=g2p('prueba en español')
    if not str(probe or '').strip():
        raise RuntimeError('eSpeak no devolvió fonemas en la prueba de español')
    kokoro=Kokoro(a.model,a.voices)
    if _REQUESTED_PROVIDER=='cuda' and (not _ACTIVE_PROVIDERS or _ACTIVE_PROVIDERS[0]!='CUDAExecutionProvider'):
        raise RuntimeError('Kokoro se inició, pero el modelo no quedó asignado a CUDAExecutionProvider')
    return styles,voices,g2p,kokoro,languages

def synthesize(text_file,output,voice,speed,engine):
    styles,voices,g2p,kokoro,_languages=engine
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
        'onnx_intra_threads':int(a.onnx_intra if a.onnx_intra is not None else 0),
        'onnx_intra_auto':int(a.onnx_intra if a.onnx_intra is not None else 0)==0,
        'onnx_inter_threads':max(1,int(a.onnx_inter or 1)),
        'execution_mode':'parallel' if str(a.onnx_mode).lower()=='parallel' else 'sequential',
        'execution_provider':_REQUESTED_PROVIDER,
        'active_providers':list(_ACTIVE_PROVIDERS),
        'gpu_mem_limit_mb':max(512,min(8192,int(a.gpu_mem_limit_mb or 3072))) if _REQUESTED_PROVIDER=='cuda' else 0,
        'spin_duration_us':int(a.spin_duration_us if a.spin_duration_us is not None else -1),
        'spin_backoff_max':max(1,int(a.spin_backoff_max or 1)),
        'phoneme_ms':round(phoneme_ms,2),'inference_ms':round(inference_ms,2)
    }

def emit_worker(payload):
    print('ECJSON '+json.dumps(payload,ensure_ascii=False),flush=True)

if a.worker:
    try:
        engine=load_engine()
        emit_worker({'type':'ready','ok':True,'voices':len(engine[1]),'onnx_intra_threads':int(a.onnx_intra if a.onnx_intra is not None else 0),'onnx_inter_threads':max(1,int(a.onnx_inter or 1)),'execution_mode':'parallel' if str(a.onnx_mode).lower()=='parallel' else 'sequential','execution_provider':_REQUESTED_PROVIDER,'active_providers':list(_ACTIVE_PROVIDERS),'gpu_mem_limit_mb':max(512,min(8192,int(a.gpu_mem_limit_mb or 3072))) if _REQUESTED_PROVIDER=='cuda' else 0,'spin_duration_us':int(a.spin_duration_us if a.spin_duration_us is not None else -1),'spin_backoff_max':max(1,int(a.spin_backoff_max or 1)),'espeak_data':_ESPEAK_DATA,'espeak_phontab':_ESPEAK_PHONTAB,'es_supported':True,'languages':engine[4]})
    except Exception as e:
        emit_worker({'type':'ready','ok':False,'error':str(e),'execution_provider':_REQUESTED_PROVIDER,'active_providers':list(_ACTIVE_PROVIDERS),'espeak_data':_ESPEAK_DATA,'espeak_phontab':_ESPEAK_PHONTAB,'es_supported':False})
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
                emit_worker({'id':req_id,'ok':True,'pong':True,'es_supported':True,'execution_provider':_REQUESTED_PROVIDER,'active_providers':list(_ACTIVE_PROVIDERS),'espeak_data':_ESPEAK_DATA});continue
            if cmd!='generate':
                raise ValueError('Comando no reconocido')
            result=synthesize(req.get('text_file',''),req.get('output',''),req.get('voice','ef_dora'),req.get('speed',1.0),engine)
            result['id']=req_id;emit_worker(result)
        except Exception as e:
            emit_worker({'id':req_id,'ok':False,'error':str(e),'execution_provider':_REQUESTED_PROVIDER})
    sys.exit(0)

engine=load_engine()
result=synthesize(a.text_file,a.output,a.voice,a.speed,engine)
print(json.dumps(result,ensure_ascii=False),flush=True)
