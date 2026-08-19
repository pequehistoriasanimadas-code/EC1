import argparse, json, os, sys, wave
import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro
from misaki.espeak import EspeakG2P

p=argparse.ArgumentParser()
p.add_argument('--text-file')
p.add_argument('--output')
p.add_argument('--voice',default='ef_dora')
p.add_argument('--speed',type=float,default=1.0)
p.add_argument('--model')
p.add_argument('--voices')
p.add_argument('--list-voices',action='store_true')
a=p.parse_args()

if a.list_voices:
    data=np.load(a.voices)
    print(json.dumps({'voices':sorted(list(data.keys()))},ensure_ascii=False))
    sys.exit(0)

with open(a.text_file,'r',encoding='utf-8') as f: text=f.read().strip()
if not text: raise SystemExit('Texto vacío')
styles=np.load(a.voices)
voice=a.voice if a.voice in styles.files else next((v for v in styles.files if v.startswith('e')), styles.files[0])
g2p=EspeakG2P(language='es')
phonemes,_=g2p(text)
kokoro=Kokoro(a.model,a.voices)
samples,sr=kokoro.create(phonemes,voice=voice,speed=a.speed,is_phonemes=True)
sf.write(a.output,samples,sr)
duration=float(len(samples))/float(sr)
print(json.dumps({'ok':True,'voice':voice,'sample_rate':sr,'duration_sec':duration},ensure_ascii=False))
