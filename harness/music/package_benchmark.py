#!/usr/bin/env python3
"""Package the completed dedicated local benchmark, without exporting account IDs or paths."""
import argparse
import csv
import json
from pathlib import Path
import shutil
from audio_tools import package, validate_public

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('benchmark', type=Path)
parser.add_argument('destination', type=Path)
args = parser.parse_args()
report = json.loads(args.benchmark.read_text(encoding='utf-8'))
if report.get('provider') != 'llamacpp' or len(report.get('tracks', [])) != 16 or not all(track.get('result') for track in report['tracks']):
    raise ValueError('All 16 genuine local benchmark tracks must be completed before packaging.')
titles = ['Rainwashed Blocks','Night Highway','Balcony After Midnight','Seaside Signal','Last Train Home','Roller Lights','Closing Time Trio','Rooftop Dawn','Concrete Pulse','Night Bus Reflections','Memory Tide','Beyond the Ridge','Window Garden','Paper Constellations','Sunset Market','Coastal Echoes']
for track, title in zip(report['tracks'], titles, strict=True):
    track['title'] = title
root = args.benchmark.parent
plan = {'provider': report['provider'], 'model': report['model'], 'tracks': []}
manifest = {'results': []}
public_tracks = []
for track in report['tracks']:
    result = track['result']
    plan['tracks'].append({key: track[key] for key in ('number', 'title', 'genre', 'concept', 'description', 'tags', 'bpmRequested', 'seed', 'input')})
    manifest['results'].append({**{key: result[key] for key in ('requestId', 'provider', 'model', 'seedReturned', 'generatedAt', 'localFile', 'sha256', 'listeningQa')}, 'trackNumber': track['number'], 'state': 'completed'})
    public_quality = dict(result['quality'])
    public_quality['scaleFitEstimate'] = public_quality.pop('tonalFitHeuristic')
    public_tracks.append({key: track[key] for key in ('number', 'title', 'genre')} | {'attempts': track['attempts'], 'quality': public_quality, 'references': result['references']})
public = {'provider': report['provider'], 'model': report['model'], 'tracks': public_tracks, 'listeningPerformed': False, 'sunoComparisonPerformed': False}
validate_public(public)
plan_path, manifest_path = root / 'package-plan.json', root / 'package-manifest.json'
plan_path.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
summary = package(plan_path, manifest_path, args.destination)
scores = args.destination / 'Scores'; scores.mkdir()
for track in report['tracks']:
    prefix = f"{track['number']:02d}_{track['title'].replace(' ', '_')}"
    artifacts = root / 'artifacts' / f"{track['number']:02d}"
    for source, suffix in (('composition.json', '.json'), ('composition.mid', '.mid')):
        shutil.copyfile(artifacts / source, scores / (prefix + suffix))
quality = args.destination / 'Quality'; quality.mkdir()
(quality / 'composition-analysis.json').write_text(json.dumps(public, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
with (quality / 'genre-summary.csv').open('x', encoding='utf-8-sig', newline='') as out:
    fields = ['number','genre','attempts','authoredMelodicNotes','melodicPatternCount','uniqueIntervalRhythmMotifs','expandedNoteOnsets','longestPatternRepetitionSeconds','drumOnsets','quarterKickTimelineCoverage']
    writer = csv.DictWriter(out, fieldnames=fields); writer.writeheader()
    for track in public_tracks:
        writer.writerow({'number': track['number'], 'genre': track['genre'], 'attempts': len(track['attempts']), **{key: track['quality'][key] for key in fields[3:]}})
lines = ['# Soundry 16장르 작곡 테스트', '', '각 120초, 보컬 없는 실제 로컬 Gemma 작곡입니다. Upload_WAV는 SoundCloud 업로드용 stereo 44.1kHz PCM24이며 원본 PCM16과 변환 내역은 Provenance에 보존했습니다. 16bit 원본을 24bit로 변환해도 원래 음질 정보가 늘어나는 것은 아닙니다.', '', '**확인된 구조: 짧은 패턴의 반복과 편곡. 판매 품질과 Suno 우위는 미검증.**', '', '모든 모델 후보는 짧은 1–2마디 패턴에 최대 6음표를 작성하고 섹션마다 반복·편곡하는 구조입니다. 저장된 intro/verse/chorus/bridge/outro 이름만으로 장르별 완성된 형식을 입증할 수 없습니다. 4/4만 지원하고 보컬·실제 연주·이펙트 자동화는 범위 밖입니다. 신호 검사와 악보 검증은 음악적 감동, 자연스러운 프레이징, 화성의 표현력, 독창성 또는 상업적 권리 검토를 대신하지 않습니다.', '', 'RAG: 장르별 6건씩 총 96건의 서로 다른 독자 작성 자료. 가중치 학습이 아니며, 실제 작곡 성능 개선의 인과관계는 RAG 유무의 반복 비교가 필요합니다.', '', '|장르|시도|직접 작성 멜로디 음표|멜로디 패턴|고유 음정·리듬 모티프|최장 동일 패턴 반복(초)|', '|---|---:|---:|---:|---:|---:|']
for track in public_tracks:
    q = track['quality']
    lines.append(f"|{track['genre']}|{len(track['attempts'])}|{q['authoredMelodicNotes']}|{q['melodicPatternCount']}|{q['uniqueIntervalRhythmMotifs']}|{q['longestPatternRepetitionSeconds']:.1f}|")
lines += ['', 'Quality/composition-analysis.json은 실제 참고 자료 digest, 모든 실패/성공 시도, 구간별 밀도·악기·모티프, 제한된 tonal-fit 휴리스틱을 기록합니다. tonal-fit은 key/화성 품질을 확정하는 판정이 아닙니다.', '', 'Suno와 비교할 때 동일 프롬프트·BPM·길이·보컬 없음 조건으로 여러 시드를 생성하고, Soundry MIDI와 비교 악보를 같은 악기로 렌더링해 음색 효과를 줄인 뒤 익명 A/B 청취를 권합니다. 아래 CSV의 점수는 사용자가 청취 후 직접 작성합니다. Suno 비교 음원은 이 패키지에 포함되지 않았습니다.', '', 'WAV 업로드 전에 전체 곡을 청취하고 표현·단조로운 반복·종결·장르 적합성을 판단하세요. 이 패키지는 업로드 형식 준비를 완료한 테스트 곡이며, 사람의 청취 승인이나 판매 품질을 인증하지 않습니다.', '']
(quality / '검토 보고서.md').write_text('\n'.join(lines), encoding='utf-8')
with (quality / '청취 및 Suno 비교.csv').open('x', encoding='utf-8-sig', newline='') as out:
    writer = csv.writer(out); writer.writerow(['genre','sample_source','theme_development_1_5','harmony_voiceleading_1_5','rhythmic_identity_1_5','section_contrast_1_5','ending_1_5','style_fit_1_5','notes'])
    for track in public_tracks:
        for sample in ('Soundry', 'Suno reference pending'):
            writer.writerow([track['genre'],sample,'','','','','','',''])
print(json.dumps(summary, ensure_ascii=False))
