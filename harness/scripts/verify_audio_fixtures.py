#!/usr/bin/env python3
"""생성 구현과 독립적인 표준 wave reader로 승인된 Mock PCM WAV 두 개를 검증한다."""
from __future__ import annotations

import array
import hashlib
import json
import math
import sys
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUDIO = ROOT / 'backend/fixtures/audio'
NAMES = {'demo-01.wav', 'demo-02.wav'}


def main() -> int:
    """manifest·SHA·파일 경계·PCM header·실제 sample 크기와 음량을 순차 검증한다."""
    manifest = json.loads((AUDIO / 'manifest.json').read_text())
    entries = manifest['files']
    if len(entries) != 2 or {item['file'] for item in entries} != NAMES:
        raise ValueError('The manifest must describe exactly the two approved fixtures')
    for item in entries:
        path = AUDIO / item['file']
        if path.resolve() != path or not path.is_file() or not 44 < path.stat().st_size <= 2 * 1024 * 1024:
            raise ValueError('Unsafe fixture or size')
        if hashlib.sha256(path.read_bytes()).hexdigest() != item['sha256']:
            raise ValueError('Fixture SHA256 does not match its provenance')
        # 자체 WAV writer의 가정을 재사용하지 않고 Python 표준 reader의 실측과 비교한다.
        with wave.open(str(path), 'rb') as audio:
            actual = (audio.getnchannels(), audio.getsampwidth(), audio.getframerate(), audio.getnframes())
            expected = (item['channels'], item['sampleWidthBytes'], item['sampleRate'], item['frames'])
            if actual != expected or actual[:3] != (2, 2, 44100) or audio.getcomptype() != 'NONE':
                raise ValueError('Expected stereo 16-bit PCM 44.1kHz with matching manifest')
            duration = audio.getnframes() / audio.getframerate()
            # 짧은 재생 QA fixture를 사용자가 요청한 90–180초 완성곡으로 집계하지 않는다.
            if not 7 <= duration <= 10 or not math.isclose(duration, item['durationSeconds'], abs_tol=1/44100):
                raise ValueError('Expected a short 7–10 second fixture, not a requested test track')
            raw = audio.readframes(audio.getnframes())
            if len(raw) != audio.getnframes() * 4:
                raise ValueError('Truncated audio frames')
        # WAV는 little-endian이므로 big-endian 호스트에서는 sample 해석 전에 byte 순서를 바꾼다.
        samples = array.array('h', raw)
        if sys.byteorder != 'little':
            samples.byteswap()
        # sample peak와 RMS는 무음/과도한 레벨 검사용이며 청취 품질 평가를 대신하지 않는다.
        peak = max(abs(sample) for sample in samples) / 32768
        rms = math.sqrt(sum((sample / 32768) ** 2 for sample in samples) / len(samples))
        if not 0.05 < peak < 0.99 or not 0.01 < rms < 0.6:
            raise ValueError('Fixture is silent, clipped, or outside the expected level range')
        print(f"{item['file']}: {duration:.2f}s, stereo PCM16/44100, peak {peak:.3f}, RMS {rms:.3f}, SHA256 PASS")
    print('Soundry mock WAV independent QA PASS')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError, TypeError, wave.Error) as error:
        print(f'WAV fixture QA failed: {error}', file=sys.stderr)
        sys.exit(1)
