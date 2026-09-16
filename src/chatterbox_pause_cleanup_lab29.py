#!/usr/bin/env python3
"""Conservative in-place cleanup for isolated Chatterbox pause artifacts.

The filter preserves total WAV duration. It only mutes short active islands that
are isolated by real silence and have either the known low-level residual shape
or the high zero-crossing burst shape observed in production WAVs.
"""
import array
import json
import math
import os
import sys
import tempfile
import wave

FULL_SCALE = 32768.0


def _db(value):
    return 20.0 * math.log10(max(float(value), 1e-12))


def _frame_metrics(samples, sample_rate, frame_ms=20):
    frame = max(1, int(round(sample_rate * frame_ms / 1000.0)))
    out = []
    for start in range(0, len(samples), frame):
        end = min(len(samples), start + frame)
        block = samples[start:end]
        if not block:
            continue
        power = sum(float(x) * float(x) for x in block) / len(block)
        rms = math.sqrt(power) / FULL_SCALE
        peak = max(abs(int(x)) for x in block) / FULL_SCALE
        crossings = 0
        prev = int(block[0])
        for raw in block[1:]:
            cur = int(raw)
            if (prev < 0 <= cur) or (prev >= 0 > cur):
                crossings += 1
            prev = cur
        zcr = crossings / max(1, len(block) - 1)
        out.append({
            'start': start,
            'end': end,
            'rms_db': _db(rms),
            'peak_db': _db(peak),
            'zcr': zcr,
        })
    return out, frame


def _body_db(samples):
    if not samples:
        return -90.0
    power = sum(float(x) * float(x) for x in samples) / len(samples)
    return _db(math.sqrt(power) / FULL_SCALE)


def _quiet_run_before(frames, index, quiet_db):
    count = 0
    i = index - 1
    while i >= 0 and frames[i]['rms_db'] <= quiet_db:
        count += 1
        i -= 1
    return count


def _quiet_run_after(frames, index, quiet_db):
    count = 0
    i = index
    while i < len(frames) and frames[i]['rms_db'] <= quiet_db:
        count += 1
        i += 1
    return count


def _has_real_voice(frames, start, direction, limit_frames):
    i = start
    walked = 0
    while 0 <= i < len(frames) and walked < limit_frames:
        fr = frames[i]
        if fr['rms_db'] > -30.0 and fr['peak_db'] > -18.0 and fr['zcr'] < 0.34:
            return True
        i += direction
        walked += 1
    return False


def _mute_region(samples, start, end, sample_rate):
    start = max(0, int(start)); end = min(len(samples), int(end))
    if end <= start:
        return
    fade = max(1, int(round(sample_rate * 0.006)))
    pre0 = max(0, start - fade)
    pre_len = start - pre0
    for i in range(pre_len):
        gain = 1.0 - ((i + 1) / float(max(1, pre_len)))
        samples[pre0 + i] = int(round(samples[pre0 + i] * gain))
    for i in range(start, end):
        samples[i] = 0
    post1 = min(len(samples), end + fade)
    post_len = post1 - end
    for i in range(post_len):
        gain = (i + 1) / float(max(1, post_len))
        samples[end + i] = int(round(samples[end + i] * gain))


def clean_samples(samples, sample_rate, enabled=True):
    data = [int(x) for x in samples]
    diag = {
        'pause_cleanup_applied': False,
        'pause_cleanup_events': 0,
        'pause_cleanup_ms': 0.0,
        'pause_cleanup_weak_events': 0,
        'pause_cleanup_strong_events': 0,
        'pause_cleanup_threshold_db': 0.0,
    }
    if not enabled or sample_rate <= 0 or len(data) < int(sample_rate * 0.8):
        return data, diag

    body_db = _body_db(data)
    quiet_db = max(-58.0, min(-46.0, body_db - 30.0))
    diag['pause_cleanup_threshold_db'] = round(quiet_db, 2)
    total_muted = 0
    event_ranges = []

    # Multiple passes are intentional. A tiny low-level residual can split the
    # long quiet valley that should expose the stronger burst immediately after
    # it (the exact pattern in the user-provided "en Lurín" example).
    for _pass in range(4):
        frames, frame_size = _frame_metrics(data, sample_rate)
        if len(frames) < 10:
            break
        changed = False
        i = 0
        while i < len(frames):
            if frames[i]['rms_db'] <= quiet_db:
                i += 1
                continue
            run0 = i
            while i < len(frames) and frames[i]['rms_db'] > quiet_db:
                i += 1
            run1 = i
            duration_ms = (frames[run1 - 1]['end'] - frames[run0]['start']) * 1000.0 / sample_rate
            if duration_ms < 18.0 or duration_ms > 240.0:
                continue
            pre_frames = _quiet_run_before(frames, run0, quiet_db)
            post_frames = _quiet_run_after(frames, run1, quiet_db)
            pre_ms = pre_frames * frame_size * 1000.0 / sample_rate
            post_ms = post_frames * frame_size * 1000.0 / sample_rate
            if pre_ms < 80.0 or post_ms < 40.0:
                continue
            if not _has_real_voice(frames, run0 - pre_frames - 1, -1, max(1, int(4.0 * sample_rate / frame_size))):
                continue
            if not _has_real_voice(frames, run1 + post_frames, 1, max(1, int(3.0 * sample_rate / frame_size))):
                continue

            active = frames[run0:run1]
            max_rms = max(x['rms_db'] for x in active)
            max_peak = max(x['peak_db'] for x in active)
            max_zcr = max(x['zcr'] for x in active)
            avg_zcr = sum(x['zcr'] for x in active) / len(active)

            weak = max_rms <= -28.0 and max_peak <= -16.0
            # Strong artifact guard: much stricter than the weak residual rule.
            # It needs a long leading silence and clearly noise-like zero-crossing
            # density, preventing ordinary short words from being treated as noise.
            strong = (
                pre_ms >= 180.0 and post_ms >= 40.0 and duration_ms <= 220.0
                and max_peak >= -12.0 and max_zcr >= 0.30 and avg_zcr >= 0.14
            )
            if not (weak or strong):
                continue

            start = frames[run0]['start']; end = frames[run1 - 1]['end']
            # Do not process the same island twice after recomputing frames.
            if any(not (end <= a or start >= b) for a, b in event_ranges):
                continue
            _mute_region(data, start, end, sample_rate)
            event_ranges.append((start, end)); total_muted += end - start
            diag['pause_cleanup_events'] += 1
            if strong:
                diag['pause_cleanup_strong_events'] += 1
            else:
                diag['pause_cleanup_weak_events'] += 1
            changed = True
            break
        if not changed:
            break

    diag['pause_cleanup_applied'] = diag['pause_cleanup_events'] > 0
    diag['pause_cleanup_ms'] = round(total_muted * 1000.0 / sample_rate, 1)
    return data, diag


def clean_wav(path):
    path = os.path.abspath(path)
    with wave.open(path, 'rb') as src:
        channels = src.getnchannels(); sample_rate = src.getframerate(); width = src.getsampwidth()
        params = src.getparams(); raw = src.readframes(src.getnframes())
    if width != 2:
        return {'ok': True, 'skipped': True, 'reason': f'unsupported_sample_width_{width}'}
    pcm = array.array('h'); pcm.frombytes(raw)
    if sys.byteorder != 'little':
        pcm.byteswap()
    if channels <= 0:
        return {'ok': True, 'skipped': True, 'reason': 'invalid_channels'}

    if channels == 1:
        analysis = list(pcm)
    else:
        frames = len(pcm) // channels
        analysis = []
        for i in range(frames):
            base = i * channels
            analysis.append(int(round(sum(int(pcm[base + c]) for c in range(channels)) / float(channels))))

    cleaned, diag = clean_samples(analysis, sample_rate, True)
    if diag['pause_cleanup_applied']:
        if channels == 1:
            out = array.array('h', cleaned)
        else:
            out = array.array('h', pcm)
            for i, (before, after) in enumerate(zip(analysis, cleaned)):
                if before != after:
                    base = i * channels
                    if after == 0:
                        for c in range(channels): out[base + c] = 0
                    else:
                        gain = 0.0 if before == 0 else max(0.0, min(1.0, after / float(before)))
                        for c in range(channels): out[base + c] = int(round(out[base + c] * gain))
        if sys.byteorder != 'little':
            out.byteswap()
        folder = os.path.dirname(path) or '.'
        fd, tmp = tempfile.mkstemp(prefix='.gec-chatterbox-clean-', suffix='.wav', dir=folder); os.close(fd)
        try:
            with wave.open(tmp, 'wb') as dst:
                dst.setparams(params); dst.writeframes(out.tobytes())
            os.replace(tmp, path)
        finally:
            if os.path.exists(tmp):
                try: os.remove(tmp)
                except OSError: pass
    return {'ok': True, **diag, 'sample_rate': sample_rate, 'channels': channels, 'duration_preserved': True}


def main(argv):
    if len(argv) != 2:
        raise SystemExit('usage: chatterbox_pause_cleanup_lab29.py <wav>')
    print(json.dumps(clean_wav(argv[1]), ensure_ascii=False))


if __name__ == '__main__':
    main(sys.argv)
