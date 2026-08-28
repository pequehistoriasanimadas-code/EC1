import argparse
import collections
import io
import json
import os
import pickle
import shutil
import sys
import zipfile
from pathlib import Path

import numpy as np

DTYPES={
    'FloatStorage':np.float32,
    'DoubleStorage':np.float64,
    'HalfStorage':np.float16,
    'BFloat16Storage':np.uint16,
    'LongStorage':np.int64,
    'IntStorage':np.int32,
    'ShortStorage':np.int16,
    'ByteStorage':np.uint8,
    'CharStorage':np.int8,
    'BoolStorage':np.bool_,
}

class StorageMarker:
    def __init__(self,name):
        self.name=name


def rebuild_tensor(storage, storage_offset, size, stride, *rest):
    return {
        '__ec_tensor__':True,
        'storage':storage,
        'offset':int(storage_offset),
        'size':tuple(int(x) for x in size),
        'stride':tuple(int(x) for x in stride),
    }


def rebuild_parameter(data, *rest):
    return data


class SafeTorchUnpickler(pickle.Unpickler):
    def find_class(self,module,name):
        if module=='torch._utils' and name in ('_rebuild_tensor','_rebuild_tensor_v2','_rebuild_tensor_v3'):
            return rebuild_tensor
        if module=='torch._utils' and name=='_rebuild_parameter':
            return rebuild_parameter
        if module=='torch' and name in DTYPES:
            return StorageMarker(name)
        if module=='collections' and name=='OrderedDict':
            return collections.OrderedDict
        raise pickle.UnpicklingError(f'Global no permitido en voz .pt: {module}.{name}')

    def persistent_load(self,pid):
        if not isinstance(pid,tuple) or len(pid)<5 or pid[0]!='storage':
            raise pickle.UnpicklingError('Referencia persistente no reconocida')
        return {'pid':pid}


def expected_stride(shape):
    if not shape:
        return ()
    out=[1]*len(shape)
    for i in range(len(shape)-2,-1,-1):
        out[i]=out[i+1]*shape[i+1]
    return tuple(out)


def tensor_from_pt(path):
    p=Path(path)
    if not zipfile.is_zipfile(p):
        raise ValueError('El archivo .pt no usa el formato ZIP seguro esperado de torch.save')
    with zipfile.ZipFile(p,'r') as z:
        names=z.namelist()
        data_pkl=next((n for n in names if n.endswith('/data.pkl') or n=='data.pkl'),None)
        if not data_pkl:
            raise ValueError('El archivo .pt no contiene data.pkl')
        prefix=data_pkl[:-len('data.pkl')]
        meta=SafeTorchUnpickler(io.BytesIO(z.read(data_pkl))).load()
        if isinstance(meta,dict) and not meta.get('__ec_tensor__'):
            candidates=[v for v in meta.values() if isinstance(v,dict) and v.get('__ec_tensor__')]
            if len(candidates)==1:
                meta=candidates[0]
        if not isinstance(meta,dict) or not meta.get('__ec_tensor__'):
            raise ValueError('La voz .pt no contiene un tensor Kokoro simple')
        pid=meta['storage'].get('pid') if isinstance(meta.get('storage'),dict) else None
        if not isinstance(pid,tuple) or len(pid)<5:
            raise ValueError('Storage de tensor no reconocido')
        marker,key,_location,numel=pid[1],str(pid[2]),pid[3],int(pid[4])
        if not isinstance(marker,StorageMarker) or marker.name not in DTYPES:
            raise ValueError('Tipo de tensor no soportado')
        dtype=DTYPES[marker.name]
        raw_name=prefix+'data/'+key
        if raw_name not in names:
            raise ValueError('Datos binarios del tensor no encontrados')
        raw=z.read(raw_name)
        arr=np.frombuffer(raw,dtype=dtype,count=numel)
        shape=tuple(meta['size'])
        stride=tuple(meta['stride'])
        offset=int(meta['offset'])
        if stride!=expected_stride(shape):
            raise ValueError('La voz usa un tensor no contiguo; exporta nuevamente desde Kokoro Voice Designer')
        total=int(np.prod(shape,dtype=np.int64)) if shape else 1
        if offset<0 or offset+total>arr.size:
            raise ValueError('Dimensiones de tensor inválidas')
        out=np.array(arr[offset:offset+total].reshape(shape),copy=True)
        if out.dtype==np.uint16 and marker.name=='BFloat16Storage':
            raise ValueError('BFloat16 no es compatible con esta versión de Kokoro ONNX')
        return out


def first_shape(npz_path):
    with np.load(npz_path,allow_pickle=False) as data:
        if not data.files:
            raise ValueError('Archivo de voces Kokoro vacío')
        return tuple(data[data.files[0]].shape)


def import_voice(args):
    arr=tensor_from_pt(args.input)
    ref_shape=first_shape(args.official)
    if tuple(arr.shape)!=ref_shape:
        raise ValueError(f'Forma incompatible: {tuple(arr.shape)}; Kokoro v1.0 espera {ref_shape}')
    if arr.dtype not in (np.float16,np.float32,np.float64):
        arr=arr.astype(np.float32)
    Path(args.output).parent.mkdir(parents=True,exist_ok=True)
    with open(args.output,'wb') as f:
        np.savez(f,voice=arr.astype(np.float32,copy=False))
    return {'ok':True,'shape':list(arr.shape),'dtype':str(arr.dtype),'output':args.output}


def merge_voices(args):
    voices={}
    with np.load(args.official,allow_pickle=False) as base:
        for name in base.files:
            voices[name]=np.array(base[name],copy=True)
    custom=json.loads(Path(args.manifest).read_text(encoding='utf-8')) if Path(args.manifest).exists() else []
    added=[]
    for item in custom:
        if not item.get('id') or not item.get('file'):
            continue
        file=Path(item['file'])
        if not file.exists():
            continue
        with np.load(file,allow_pickle=False) as pack:
            if 'voice' not in pack.files:
                continue
            arr=np.array(pack['voice'],copy=True)
        if voices and tuple(arr.shape)!=tuple(next(iter(voices.values())).shape):
            continue
        voices[str(item['id'])]=arr
        added.append(str(item['id']))
    Path(args.output).parent.mkdir(parents=True,exist_ok=True)
    tmp=str(args.output)+'.tmp'
    with open(tmp,'wb') as f:
        np.savez(f,**voices)
    os.replace(tmp,args.output)
    return {'ok':True,'voices':len(voices),'custom':added,'output':args.output}


def main():
    p=argparse.ArgumentParser()
    sub=p.add_subparsers(dest='cmd',required=True)
    imp=sub.add_parser('import-pt')
    imp.add_argument('--input',required=True)
    imp.add_argument('--official',required=True)
    imp.add_argument('--output',required=True)
    mer=sub.add_parser('merge')
    mer.add_argument('--official',required=True)
    mer.add_argument('--manifest',required=True)
    mer.add_argument('--output',required=True)
    args=p.parse_args()
    try:
        result=import_voice(args) if args.cmd=='import-pt' else merge_voices(args)
        print(json.dumps(result,ensure_ascii=False))
    except Exception as e:
        print(json.dumps({'ok':False,'error':str(e)},ensure_ascii=False))
        sys.exit(2)

if __name__=='__main__':
    main()
