#!/usr/bin/env python3
"""Package freshly composed sectional-v2 genre masters with honest structural comparison."""
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
if report.get('provider') not in ('llamacpp','cli') or len(report.get('tracks', [])) != 16 or not all(track.get('result') for track in report['tracks']):
    raise ValueError('All 16 genuine provider-specific benchmark tracks must be completed before packaging.')
is_reference = report.get('method', '').startswith('reference-preserving')
titles = ['Rainwashed Blocks','Night Highway','Balcony After Midnight','Seaside Signal','Last Train Home','Roller Lights','Closing Time Trio','Rooftop Dawn','Concrete Pulse','Night Bus Reflections','Memory Tide','Beyond the Ridge','Window Garden','Paper Constellations','Sunset Market','Coastal Echoes']
for track, title in zip(report['tracks'], titles, strict=True):
    track['title'] = title + (' Variation' if is_reference else '')
    track['description'] = f"An original {track['genre']} instrumental inspired by {title.lower()}. A two-minute musical sketch created with Soundry."
    if is_reference:
        track['description'] = f"A new {track['genre']} melodic variation inspired by {title.lower()}, preserving the arrangement, rhythm and accompaniment of Soundry's own Codex reference. New melody pitches drafted and refined by local Gemma."
    track['tags'] = [track['genre'],'instrumental','Soundry']
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
if is_reference:
    for public_track, track in zip(public_tracks, report['tracks'], strict=True):
        public_track['parent'] = track['parent']; public_track['styleEvidence'] = track['result']['styleEvidence']
public = {'method':report.get('method'), 'provider': report['provider'], 'model': report['model'], 'tracks': public_tracks, 'listeningPerformed': False, 'pairedListeningPerformed': False}
validate_public(public)
plan_path, manifest_path = root / 'package-plan.json', root / 'package-manifest.json'
plan_path.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
summary = package(plan_path, manifest_path, args.destination)
if is_reference:
    readme = args.destination / '읽어 주세요.txt'
    text = readme.read_text(encoding='utf-8').replace(f"{plan['provider']} 모델이 AI로 악보를 작곡하고 Soundry의 로컬 악기로 합성한 연주곡입니다.", '본인 Codex 기준곡의 편성·리듬·반주를 유지하고 로컬 Gemma가 새 선율 pitch를 초안·다듬기로 작성한 변주입니다. 전체 편곡을 Gemma 독립 작곡으로 표시하지 않습니다.')
    readme.write_text(text,encoding='utf-8')
with (args.destination / 'Metadata' / 'upload.csv').open('x', encoding='utf-8-sig', newline='') as out:
    writer = csv.DictWriter(out, fieldnames=['number','file','title','genre','tags','description']); writer.writeheader()
    for track in report['tracks']:
        prefix = f"{track['number']:02d}_{track['title'].replace(' ', '_')}"
        writer.writerow({'number':track['number'],'file':f'Upload_WAV/{prefix}.wav','title':track['title'],'genre':track['genre'],'tags':'; '.join(track['tags']),'description':track['description']+' AI-assisted instrumental created with Soundry.'})
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
lines = ['# Soundry 신규 16장르 작곡 품질 개선', '', '이번 파일은 기존 곡 리믹스가 아니라 표시된 Gemma/Codex CLI 공급자로 새로 작곡한120초 instrumental입니다. Upload_WAV는 stereo44.1kHzPCM24이고 원본PCM16/변환기록과JSON/MIDI를보존했습니다.24bit변환이원본정보를늘리지는않습니다.', '', '기존Gemma의6패턴/6음표/1–2마디제한을제거했습니다. 모델이전체화성계획과6개구간을독립작성하며본구간4마디·outro최대8마디의프레이즈·동시화음·독립bass·구간별lead/드럼과chorus재현을제공합니다. 앱은마디위치와선택된표현의변환을계산하며고정곡을붙이거나반복을새작성음표로세지않습니다.', '', '음표 집계는 드럼을 제외한 선율·화음·베이스를 포함합니다. 반복 재생된 음표를 직접 작성한 음표로 늘려 세지 않습니다.', '', 'Codex CLI 수준의음악성은자동지표만으로확정할수없습니다. 직접작성음표/모티프/화음/반복·신호를비교했고최종주관청취평점은미평가입니다. 기존음색합성기는같이사용합니다.', '', '|장르|시도|직접 작성 멜로디 음표|멜로디 패턴|고유 음정·리듬 모티프|최장 동일 패턴 반복(초)|', '|---|---:|---:|---:|---:|---:|']
if is_reference:
    lines[2] = '지원16장르의새선율변주입니다. 본인Codex기준곡의편성·리듬·화음·bass·드럼·구간·mix를유지하고로컬Gemma가새선율pitch를draft후polish했습니다. 원본은보존하며전부Gemma독립작곡으로표시하지않습니다. Upload_WAV는stereo44.1kHzPCM24, 원본PCM16/JSON/MIDI/변환기록을함께제공합니다.24bit변환이원본정보를늘리지는않습니다.'
    lines[4] = '각선율slot의실제반주화성context와원본cadenceanchor를제공해새선율을다듬습니다. 음표수·리듬·gate·강약은원본그대로이며Gemma가선택한pitch만교체합니다. 공유bass/drum/pad/organ패턴과동시화음은변경하지않습니다.'
    lines[6] = '음표집계는재사용된원본반주와선율음표를포함합니다. 새작성량은composition-analysis.json의styleEvidence.changedPitchNotes이며전체음표를Gemma작성량으로표시하지않습니다.'
if report['provider'] == 'cli':
    lines[4] = '이폴더는기존CodexCLI의전체canonical악보작곡경로로새로제작한16장르기준곡입니다. Gemma의sectional-v2후보와같은brief/BPM/길이/seed/공개guidance/합성기를사용합니다. Gemma개선곡은상위폴더의다른세트에있습니다.'
for track in public_tracks:
    q = track['quality']
    lines.append(f"|{track['genre']}|{len(track['attempts'])}|{q['authoredMelodicNotes']}|{q['melodicPatternCount']}|{q['uniqueIntervalRhythmMotifs']}|{q['longestPatternRepetitionSeconds']:.1f}|")
lines += ['', '사용자가 우선한 리듬·그루브·장르감을 비교할 수 있도록 역할별 엇박 비율, 삼연음 위치, 강약 종류와 드럼 음표 배치도 기록했습니다. 이 수치는 음악성 점수와 다릅니다.', '', 'Quality/composition-analysis.json은 실제 참고 자료 digest, 모든 실패/성공 시도, 구간별 밀도·악기·모티프, 제한된 tonal-fit 휴리스틱을 기록합니다. tonal-fit은 key/화성 품질을 확정하는 판정이 아닙니다.', '', 'Gemma와 Codex CLI를 비교할 때 동일 프롬프트·BPM·길이·보컬 없음 조건으로 여러 시드를 생성하고, 두 공급자의 MIDI와 악보를 같은 악기로 렌더링해 음색 효과를 줄인 뒤 익명 A/B 청취를 권합니다. 아래 CSV의 점수는 사용자가 청취 후 직접 작성합니다. 공급자별 비교 음원은 상위 폴더의 다른 세트에 있습니다.', '', 'WAV 업로드 전에 전체 곡을 청취하고 표현·단조로운 반복·종결·장르 적합성을 판단하세요. 이 패키지는 업로드 형식 준비를 완료한 테스트 곡이며, 사람의 청취 승인이나 판매 품질을 인증하지 않습니다.', '']
(quality / '검토 보고서.md').write_text('\n'.join(lines), encoding='utf-8')
with (quality / '청취 평가.csv').open('x', encoding='utf-8-sig', newline='') as out:
    writer = csv.writer(out); writer.writerow(['genre','sample_source','theme_development_1_5','harmony_voiceleading_1_5','rhythmic_identity_1_5','section_contrast_1_5','ending_1_5','style_fit_1_5','notes'])
    for track in public_tracks:
        for sample in (report['provider'],):
            writer.writerow([track['genre'],sample,'','','','','','',''])
print(json.dumps(summary, ensure_ascii=False))
