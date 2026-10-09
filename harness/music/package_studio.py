#!/usr/bin/env python3
"""Package actual browser-rendered genre WAVs and retain genuine composition sources."""
import argparse
import csv
import hashlib
import json
import shutil
import struct
from pathlib import Path
from audio_tools import inspect, validate_public


def midi_check(path):
    data = path.read_bytes()
    if data[:4] != b'MThd' or len(data) < 14 or int.from_bytes(data[4:8], 'big') != 6:
        raise ValueError('MIDI header')
    kind, count, ppq = struct.unpack('>HHH', data[8:14])
    if kind != 1 or count < 2 or ppq != 480:
        raise ValueError('MIDI format')
    at, note_ons = 14, 0
    for _ in range(count):
        if data[at:at+4] != b'MTrk':
            raise ValueError('MIDI chunk')
        size = int.from_bytes(data[at+4:at+8], 'big')
        chunk = data[at+8:at+8+size]
        if len(chunk) != size:
            raise ValueError('MIDI truncated chunk')
        at += 8+size
        pos, running, ended, active = 0, None, False, {}

        def vlq():
            nonlocal pos
            total = 0
            for _ in range(4):
                if pos >= len(chunk):
                    raise ValueError('MIDI truncated VLQ')
                byte = chunk[pos]; pos += 1
                total = (total << 7) | (byte & 127)
                if not byte & 128:
                    return total
            raise ValueError('MIDI oversized VLQ')

        while pos < len(chunk):
            vlq()
            status = chunk[pos]
            if status & 128:
                pos += 1
                if status < 240:
                    running = status
            elif running is not None:
                status = running
            else:
                raise ValueError('MIDI running status')
            if status == 255:
                if pos >= len(chunk):
                    raise ValueError('MIDI truncated meta')
                meta = chunk[pos]; pos += 1; length = vlq(); pos += length
                if meta == 47:
                    if length != 0 or pos != len(chunk):
                        raise ValueError('MIDI EOT')
                    ended = True
                running = None
            elif status in (240, 247):
                length = vlq(); pos += length; running = None
            elif 128 <= status < 240:
                length = 1 if status >> 4 in (12, 13) else 2
                event = chunk[pos:pos+length]; pos += length
                if len(event) != length or any(byte > 127 for byte in event):
                    raise ValueError('MIDI event')
                key = (status & 15, event[0])
                if status >> 4 == 9 and event[1] > 0:
                    active[key] = active.get(key, 0) + 1; note_ons += 1
                elif status >> 4 == 8 or (status >> 4 == 9 and event[1] == 0):
                    if active.get(key, 0) <= 0:
                        raise ValueError('MIDI unmatched note off')
                    active[key] -= 1
            else:
                raise ValueError('MIDI unsupported status')
            if pos > len(chunk):
                raise ValueError('MIDI out of bounds')
        if not ended or any(active.values()):
            raise ValueError('MIDI missing EOT or hanging notes')
    if at != len(data) or note_ons == 0:
        raise ValueError('MIDI bytes/notes')
    return {'tracks': count, 'noteOns': note_ons, 'ppq': ppq}


def package_studio(benchmark, render_report, destination):
    report = json.loads(benchmark.read_text(encoding='utf-8'))
    render = json.loads(render_report.read_text(encoding='utf-8'))
    if report.get('provider') != 'llamacpp' or len(report['tracks']) != 16 or len(render['genreExports']) != 16:
        raise ValueError('All 16 actual local genres and browser exports required')
    if destination.exists() or destination.is_symlink() or any(p.is_symlink() for p in destination.parents):
        raise ValueError('Destination must be new and contain no symlinks')
    rows = []
    for original, exported in zip(report['tracks'], render['genreExports'], strict=True):
        if original['number'] != exported['number'] or original['genre'] != exported['genre']:
            raise ValueError('Genre correspondence')
        folder = benchmark.parent / 'artifacts' / f"{original['number']:02d}"
        wav = render_report.parent / 'Rendered' / exported['fileName']
        source_qa, output_qa = inspect(folder / 'original.wav'), inspect(wav)
        if source_qa['sha256'] != original['result']['sha256'] or exported['sourceSha256'] != source_qa['sha256']:
            raise ValueError('Original provenance')
        if output_qa['sha256'] != exported['sha256'] or output_qa['warnings'] or source_qa['warnings']:
            raise ValueError('Actual WAV validation')
        if output_qa['durationSeconds'] != 120 or output_qa['sampleRate'] != 44100 or output_qa['channels'] != 2 or output_qa['bitDepth'] != 16:
            raise ValueError('Export format')
        if output_qa['samplePeakDbfs'] is None or output_qa['samplePeakDbfs'] > -0.999:
            raise ValueError('Export headroom')
        midi = midi_check(folder / 'composition.mid')
        score = json.loads((folder / 'composition.json').read_text(encoding='utf-8'))
        if score['genre'] != original['genre']:
            raise ValueError('Score genre')
        processing = exported['arrangement']
        public_processing = {key: processing[key] for key in ('duration', 'bpm', 'snapBeats', 'masterVolume')}
        public_processing['lanes'] = [{key: value for key, value in lane.items() if key not in ('id', 'clips')} | {'clips': [{key: value for key, value in clip.items() if key not in ('id', 'trackId')} for clip in lane['clips']]} for lane in processing['lanes']]
        row = {'number': original['number'], 'genre': original['genre'], 'fileName': exported['fileName'], 'title': f"Soundry {original['number']:02d} — {original['genre']}", 'tags': original['tags'], 'description': f"Original instrumental {original['genre']} composed by local Gemma and synthesized by Soundry. Studio mix edition: split at 60s, low-pass 18kHz, single delay 250ms/8%, master 80%, boundary fades, sample peak headroom. Source and scores retained. Human listening review pending.", 'composer': {'provider': report['provider'], 'model': report['model'], 'generatedAt': original['result']['generatedAt'], 'newCompositionGenerated': False}, 'processing': public_processing, 'sourceQa': source_qa, 'uploadQa': output_qa, 'midi': midi, 'listeningPerformed': False}
        validate_public(row); rows.append(row)
    if len({row['uploadQa']['sha256'] for row in rows}) != 16:
        raise ValueError('Duplicate genre audio')
    destination.mkdir()
    for name in ('Upload_WAV', 'Provenance', 'Scores', 'Metadata', 'Quality'):
        (destination / name).mkdir()
    for row in rows:
        prefix = Path(row['fileName']).stem
        folder = benchmark.parent / 'artifacts' / f"{row['number']:02d}"
        shutil.copyfile(render_report.parent / 'Rendered' / row['fileName'], destination / 'Upload_WAV' / row['fileName'])
        shutil.copyfile(folder / 'original.wav', destination / 'Provenance' / (prefix + '_source.wav'))
        for suffix in ('.json', '.mid'):
            shutil.copyfile(folder / ('composition' + suffix), destination / 'Scores' / (prefix + suffix))
        (destination / 'Provenance' / (prefix + '_processing.json')).write_text(json.dumps(row, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
        (destination / 'Metadata' / (prefix + '.txt')).write_text(f"Title: {row['title']}\nGenre: {row['genre']}\nTags: {'; '.join(row['tags'])}\nDescription: {row['description']}\n", encoding='utf-8')
    with (destination / 'Metadata' / 'upload.csv').open('x', encoding='utf-8-sig', newline='') as file:
        writer = csv.DictWriter(file, fieldnames=['number','title','genre','fileName','tags','description']); writer.writeheader()
        for row in rows:
            writer.writerow({key: '; '.join(row[key]) if key == 'tags' else row[key] for key in writer.fieldnames})
    (destination / 'Metadata' / 'tracks.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    summary = {'trackCount':16,'totalSeconds':1920,'format':'stereo PCM16 44100Hz','newCompositionGenerated':False,'source':'same-day genuine local Gemma16 benchmark','listeningPerformed':False,'sourceFileHashesVerified':True,'midiIndependentlyParsed':True,'uploadRequirements':'https://help.soundcloud.com/hc/en-us/articles/360039171614-Upload-Requirements','browserUi':render['ui'],'actualSignalQa':render['signals'],'tracks':rows}
    (destination / 'Quality' / 'verification.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    with (destination / 'Quality' / 'listening-review.csv').open('x', encoding='utf-8-sig', newline='') as file:
        writer=csv.writer(file); writer.writerow(['genre','style_fit_1_5','theme_development_1_5','rhythm_1_5','ending_1_5','mix_1_5','approved','notes'])
        for row in rows: writer.writerow([row['genre'],'','','','','','',''])
    (destination / 'Quality' / '보고서.txt').write_text('지원16장르 전수 실제 Chrome OfflineAudioContext 믹스 export/독립 WAV·원본SHA·MIDI 검사 PASS. 새 작곡이 아니라 오늘의 Gemma 원본을 새 Soundry 스튜디오 엔진으로 믹스한 버전입니다.\n120초씩 총32분. stereo/44.1kHz/PCM16, sample peak≤-1dBFS. 입력 원본과 JSON/MIDI를 보존했습니다. 악보는 원본 작곡 구조이며 Low-pass/Delay/Fade 같은 오디오 효과는 MIDI에 포함되지 않습니다.\n모든 장르는 앱 지원16개를 뜻하며 무한한 세부 장르를 검사한 것은 아닙니다. 짧은 모티프 반복/4/4/기존 합성 음색 한계가 남습니다. 사람의 청취/음악성/권리 승인/Suno비교/true peak/LUFS/외부 DAW 실제 import/실제 SoundCloud 업로드는 미수행입니다.\n',encoding='utf-8')
    (destination / '업로드 안내.txt').write_text('1. Upload_WAV에 있는16곡을 청취하고 Quality/listening-review.csv에 평가하세요.\n2. 원하는 곡을 SoundCloud 업로드 화면에 넣고 Metadata/upload.csv 또는 각TXT에서 제목/설명/태그를 사용하세요.\n3. 장르를 확인하고 공개 범위와 다운로드 허용을 직접 선택하세요. 이 작업은 실제 업로드를 수행하지 않았습니다.\n4. Provenance에는 변경하지 않은 원본과 처리 내역, Scores에는 원본 악보JSON/MIDI가 있습니다. 모든 음원은120초이고 전체32분입니다.\nSoundCloud 공식 조건: https://help.soundcloud.com/hc/en-us/articles/360039171614-Upload-Requirements\n',encoding='utf-8')
    # Verify delivered copies against preflight hashes instead of trusting copying success.
    for row in rows:
        for file, expected in [(destination/'Upload_WAV'/row['fileName'], row['uploadQa']['sha256']), (destination/'Provenance'/(Path(row['fileName']).stem+'_source.wav'), row['sourceQa']['sha256'])]:
            if hashlib.sha256(file.read_bytes()).hexdigest() != expected:
                raise ValueError('Delivered copy hash')
    return {'trackCount':16,'files':sum(p.is_file() for p in destination.rglob('*')),'warnings':0,'newCompositionGenerated':False}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('benchmark', type=Path); parser.add_argument('render_report', type=Path); parser.add_argument('destination', type=Path)
    args = parser.parse_args()
    print(json.dumps(package_studio(args.benchmark, args.render_report, args.destination), ensure_ascii=False))
