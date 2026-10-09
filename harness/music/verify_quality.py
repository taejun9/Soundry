#!/usr/bin/env python3
"""Independently verify the 32 actual delivered WAV/score/MIDI copies and write paired groove evidence."""
import argparse
import csv
import hashlib
import json
import wave
from pathlib import Path
from statistics import median
from audio_tools import inspect, validate_public
from package_studio import midi_check


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify(reports, packages, destination):
    is_reference = reports[0].get("method", "").startswith("reference-preserving")
    rows = []
    for report, package in zip(reports, packages, strict=True):
        manifest = json.loads((package / 'Metadata' / 'manifest.json').read_text())
        if len(report['tracks']) != 16 or len(manifest) != 16:
            raise ValueError('Complete 16 genre sets required')
        for track, delivery in zip(report['tracks'], manifest, strict=True):
            if track['number'] != delivery['number'] or track['genre'] != delivery['genre']:
                raise ValueError('Delivered genre correspondence')
            stem = Path(delivery['file']).stem
            if delivery['file'] != f'Upload_WAV/{stem}.wav' or not stem.startswith(f"{track['number']:02d}_"):
                raise ValueError('Delivered filename boundary')
            source = Path(track['result']['localFile'])
            original = package / 'Provenance' / (stem + '_original.wav')
            upload = package / delivery['file']
            source_qa, original_qa, upload_qa = inspect(source), inspect(original), inspect(upload)
            for actual_file, width in ((source,2),(original,2),(upload,3)):
                with wave.open(str(actual_file),'rb') as reader:
                    expected = (120*44100,2,44100,width)
                    if (reader.getnframes(),reader.getnchannels(),reader.getframerate(),reader.getsampwidth()) != expected or len(reader.readframes(expected[0])) != expected[0]*expected[1]*expected[3]:
                        raise ValueError('Independent standard WAV reader mismatch')

            if source_qa['sha256'] != track['result']['sha256'] or original_qa['sha256'] != source_qa['sha256'] or upload_qa['sha256'] != delivery['sha256']:
                raise ValueError('Actual original/upload hash mismatch')
            if any(q['warnings'] for q in (source_qa, original_qa, upload_qa)):
                raise ValueError('Actual signal warnings')
            for q in (source_qa, original_qa, upload_qa):
                if (q['durationSeconds'], q['channels'], q['sampleRate']) != (120, 2, 44100):
                    raise ValueError('Actual duration/stereo/rate')
            if source_qa['bitDepth'] != 16 or original_qa['bitDepth'] != 16 or upload_qa['bitDepth'] != 24 or upload_qa['samplePeakDbfs'] > -0.9999:
                raise ValueError('Actual format/headroom')
            if len({p.stat().st_ino for p in (source, original, upload)}) != 3:
                raise ValueError('Copies must remain independently editable')
            artifact = source.parent
            score, midi = package / 'Scores' / (stem + '.json'), package / 'Scores' / (stem + '.mid')
            if digest(score) != digest(artifact / 'composition.json') or digest(midi) != digest(artifact / 'composition.mid'):
                raise ValueError('Actual score/MIDI copy hash')
            parsed_midi = midi_check(midi)
            if json.loads(score.read_text())['genre'] != track['genre']:
                raise ValueError('Actual score genre')
            rows.append({'provider': report['provider'], 'number': track['number'], 'genre': track['genre'], 'uploadFile': delivery['file'], 'sourceQa': source_qa, 'uploadQa': upload_qa, 'midi': parsed_midi, 'scoreSha256': digest(score), 'midiSha256': digest(midi), 'structure': track['result']['quality'], 'styleEvidence':track['result'].get('styleEvidence'), 'parent':track.get('parent')})
    if len({r['sourceQa']['sha256'] for r in rows}) != 32 or len({r['uploadQa']['sha256'] for r in rows}) != 32:
        raise ValueError('Every actual composition must be different')
    for left, right in zip(reports[0]['tracks'], reports[1]['tracks'], strict=True):
        if left['input'] != right['input'] or sorted(r['digest'] for r in left['result']['references']) != sorted(r['digest'] for r in right['result']['references']):
            raise ValueError('Paired public input/guidance mismatch')
    evidence = {'deliveredTracks': 32, 'newCodexCompositions':16, 'newGemmaMelodicVariations':16 if is_reference else 0, 'newGemmaCompositions':0 if is_reference else 16, 'supportedGenres': 16, 'totalSeconds': 3840, 'signalWarnings': 0, 'sourceHashesVerified': True, 'deliveredScoresAndMidiHashesVerified': True, 'independentMidiParse': True, 'samePublicInputGuidanceAndRenderer': True, 'listeningPerformed': False, 'qualityParity': 'unassessed', 'lufsMeasured': False, 'truePeakMeasured': False, 'soundCloudUploaded': False, 'rhythmMetricsAreObservationsOnly': True, 'tracks': rows}
    # Public reports contain sanitized basenames and provenance, never absolute paths/raw model responses.
    def rename_fit(value):
        if isinstance(value, dict):
            return {('scaleFitEstimate' if k == 'tonalFitHeuristic' else k): rename_fit(v) for k, v in value.items()}
        if isinstance(value, list):
            return [rename_fit(v) for v in value]
        return value
    evidence = rename_fit(evidence); validate_public(evidence)
    destination.mkdir(exist_ok=False)
    (destination / 'verification.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n')
    with (destination / 'rhythm-comparison.csv').open('x', encoding='utf-8-sig', newline='') as file:
        fields = ['genre', 'provider', 'authoredMelodicNotes', 'bassOffbeatFraction', 'drumOffbeatFraction', 'swingTripletOnsets', 'drumOnsets', 'quarterKickCoverage', 'unchangedRepeatSeconds']
        writer = csv.DictWriter(file, fieldnames=fields); writer.writeheader()
        for r in rows:
            q = r['structure']; roles = q['rhythmicRoles']
            writer.writerow({'genre': r['genre'], 'provider': r['provider'], 'authoredMelodicNotes': q['authoredMelodicNotes'], 'bassOffbeatFraction': roles['bass']['offbeatFraction'], 'drumOffbeatFraction': roles['drums']['offbeatFraction'], 'swingTripletOnsets': sum(x['tripletOnsets'] for x in roles.values()), 'drumOnsets': q['drumOnsets'], 'quarterKickCoverage': q['quarterKickTimelineCoverage'], 'unchangedRepeatSeconds': q['longestPatternRepetitionSeconds']})
    with (destination / 'paired-listening.csv').open('x', encoding='utf-8-sig', newline='') as file:
        writer = csv.writer(file); writer.writerow(['genre', 'preferred_source', 'rhythm_groove_1_5_gemma', 'rhythm_groove_1_5_cli', 'genre_identity_1_5_gemma', 'genre_identity_1_5_cli', 'development_1_5_gemma', 'development_1_5_cli', 'mix_1_5_gemma', 'mix_1_5_cli', 'upload_choice', 'notes'])
        for t in reports[0]['tracks']:
            writer.writerow([t['genre']] + [''] * 11)
    summary = {'deliveredTracks': 32, 'newCodexCompositions':16, 'newGemmaMelodicVariations':16 if is_reference else 0, 'newGemmaCompositions':0 if is_reference else 16, 'warnings': 0, 'providers': {r['provider']: {'authoredMelodicNotesMedian': median(t['result']['quality']['authoredMelodicNotes'] for t in r['tracks']), 'unchangedRepeatSecondsMedian': median(t['result']['quality']['longestPatternRepetitionSeconds'] for t in r['tracks'])} for r in reports}, 'qualityParity': 'unassessed'}
    (destination / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
    return summary


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('gemma_benchmark', type=Path); parser.add_argument('cli_benchmark', type=Path)
    parser.add_argument('gemma_package', type=Path); parser.add_argument('cli_package', type=Path)
    parser.add_argument('destination', type=Path)
    args = parser.parse_args()
    reports = [json.loads(p.read_text()) for p in (args.gemma_benchmark, args.cli_benchmark)]
    if [r['provider'] for r in reports] != ['llamacpp', 'cli']:
        raise ValueError('Gemma and actual CLI evidence required')
    print(json.dumps(verify(reports, [args.gemma_package, args.cli_package], args.destination), ensure_ascii=False))
