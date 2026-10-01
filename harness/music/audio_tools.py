#!/usr/bin/env python3
"""로컬 WAV 검사·보존·업로드 패키징. 네트워크와 음원 생성 호출은 하지 않는다."""
from __future__ import annotations

import argparse
import csv
import ctypes
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import struct
import sys
import wave

import numpy as np

# 파일 하나의 상한을 읽기 전에 확인한다. 아래 디코딩은 float64 배열을 사용하므로 입력 크기를 제한한다.
MAX_BYTES = 100 * 1024 * 1024

# 공개 산출물은 allowlist로 재구성한다. 외부 응답이나 로컬 파일 경로를 그대로 직렬화하지 않는다.
INPUT_FIELDS = {"prompt": (str,), "variationCount": (int,)}
SETTING_FIELDS = {
    "mode": (str,), "genre": (str,), "mood": (str,),
    "bpm": (int, float), "durationSeconds": (int, float), "seed": (str,),
}
# 공개 provenance의 중첩 키/텍스트를 재검사해 선택된 필드 안의 인증 정보 형태도 막는다.
PRIVATE_KEY = re.compile(r"(?:api.?key|authorization|credential|password|secret|token|url|uri)", re.I)
PRIVATE_TEXT = re.compile(
    r"[a-z][a-z0-9+.-]*://|\bwww\.|\bBearer\s+\S+|"
    r"\b(?:[A-Z_]*API[_ -]?KEY|FAL_KEY|authorization|credential|password|secret|token)"
    r"\s*[:=]\s*\S+|\bsk-[A-Za-z0-9_-]{12,}|\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.",
    re.I,
)


def selected_fields(value, fields):
    """명시한 필드의 JSON scalar만 복사하고 나머지 응답 필드는 버린다."""
    if not isinstance(value, dict):
        raise ValueError("공개 metadata 항목은 object여야 합니다.")
    result = {}
    for key, types in fields.items():
        if key in value:
            if type(value[key]) not in types:
                raise ValueError("공개 metadata 필드 형식이 잘못됐습니다: " + key)
            result[key] = value[key]
    return result


def validate_public(value):
    """공개 필드에서 URL·인증 정보 패턴과 비정상 JSON 값을 거부한다."""
    if isinstance(value, dict):
        for key, item in value.items():
            if not isinstance(key, str) or PRIVATE_KEY.search(key):
                raise ValueError("공개 metadata에 허용하지 않는 키가 있습니다.")
            validate_public(item)
    elif isinstance(value, list):
        for item in value:
            validate_public(item)
    elif isinstance(value, str):
        if PRIVATE_TEXT.search(value):
            raise ValueError("공개 metadata에 URL 또는 인증 정보 형태의 문자열이 있습니다.")
    elif type(value) in (int, float):
        if not math.isfinite(value):
            raise ValueError("공개 metadata에 유한하지 않은 수가 있습니다.")
    elif value is not None and type(value) is not bool:
        raise ValueError("공개 metadata에 지원하지 않는 값이 있습니다.")


def public_generation_input(value):
    """앱의 CLI GenerationInput만 공개하며 임의 중첩 필드는 거부한다."""
    if not isinstance(value, dict) or set(value) != {"prompt", "settings", "variationCount"}:
        raise ValueError("생성 입력은 prompt/settings/variationCount만 허용합니다.")
    result = selected_fields(value, INPUT_FIELDS)
    prompt = result["prompt"]
    if not 1 <= len(prompt.strip()) <= 4000 or "\0" in prompt or result["variationCount"] != 1:
        raise ValueError("prompt 또는 variationCount가 제작 사양과 다릅니다.")
    settings = value["settings"]
    if not isinstance(settings, dict) or not set(settings) <= set(SETTING_FIELDS):
        raise ValueError("지원하지 않는 생성 설정이 있습니다.")
    result["settings"] = selected_fields(settings, SETTING_FIELDS)
    if settings.get("mode", "instrumental") != "instrumental":
        raise ValueError("CLI 제작은 연주곡만 지원합니다.")
    for key, limit in (("genre", 80), ("mood", 80), ("seed", 64)):
        if key in settings and (not 1 <= len(settings[key].strip()) <= limit or "\0" in settings[key]):
            raise ValueError("생성 문자열 설정 범위가 잘못됐습니다: " + key)
    for key, minimum, maximum in (("bpm", 40, 220), ("durationSeconds", 90, 180)):
        if key in settings and (not math.isfinite(settings[key]) or not minimum <= settings[key] <= maximum):
            raise ValueError("생성 숫자 설정 범위가 잘못됐습니다: " + key)
    validate_public(result)
    return result


def public_provenance(plan, track, entry):
    """공개 가능한 설정·추적 정보만 선택하며 localFile과 외부 응답은 복사하지 않는다."""
    fields = {
        "number": (int,), "title": (str,), "genre": (str,), "concept": (str,),
        "description": (str,), "bpmRequested": (int, float, type(None)), "seed": (int,),
    }
    record = selected_fields(track, fields)
    if set(record) != set(fields):
        raise ValueError("필수 곡 metadata가 없습니다.")
    title = record["title"]
    if not title or len(title) > 120 or any(c in title for c in "/\\") or any(ord(c) < 32 for c in title):
        raise ValueError("제목을 안전한 단일 파일 이름으로 사용할 수 없습니다.")
    tags = track.get("tags")
    if not isinstance(tags, list) or not all(type(tag) is str for tag in tags):
        raise ValueError("태그는 문자열 목록이어야 합니다.")
    record["tags"] = list(tags)
    record["requestedBpm"] = record.pop("bpmRequested")
    record["seedRequested"] = record.pop("seed")
    record["measuredBpm"] = None
    trace = selected_fields(entry, {
        "requestId": (str,), "seedReturned": (int, str, type(None)),
        "generatedAt": (str, type(None)),
    })
    if not trace.get("requestId") or len(trace["requestId"]) > 128:
        raise ValueError("완료 request ID 형식이 잘못됐습니다.")
    record.update(trace)
    if plan.get("provider") != "cli" or plan.get("model") != "codex-composer-local-synth-v1":
        raise ValueError("CLI 작곡·로컬 합성 모델 제작 계획이 아닙니다.")
    if entry.get("provider") != plan["provider"] or entry.get("model") != plan["model"]:
        raise ValueError("완료 결과의 공급자/모델이 제작 계획과 다릅니다.")
    record.update({"provider": entry["provider"], "model": entry["model"]})
    record["input"] = public_generation_input(track.get("input"))
    listening = entry.get("listeningQa", {"performed": False})
    record["listeningQa"] = selected_fields(listening, {
        "performed": (bool,), "method": (str,), "notes": (str,),
    })
    record["listeningQa"].setdefault("performed", False)
    if "segments" in listening:
        if not isinstance(listening["segments"], list):
            raise ValueError("청취 구간은 목록이어야 합니다.")
        segments = []
        for segment in listening["segments"]:
            selected = selected_fields(segment, {"startSeconds": (int, float), "endSeconds": (int, float)})
            if set(selected) != {"startSeconds", "endSeconds"} or not 0 <= selected["startSeconds"] < selected["endSeconds"] <= 180:
                raise ValueError("청취 구간 범위가 잘못됐습니다.")
            segments.append(selected)
        record["listeningQa"]["segments"] = segments
    validate_public(record)
    return record



def read_wav(path: Path):
    """RIFF PCM 16/24/32 bit 및 IEEE float 32/64 bit를 디코딩한다."""
    if path.is_symlink() or not path.is_file():
        raise ValueError("일반 로컬 WAV 파일만 사용할 수 있습니다.")
    if path.stat().st_size > MAX_BYTES:
        raise ValueError("원본 파일이 100 MiB를 초과합니다.")
    raw = path.read_bytes()
    if len(raw) < 12 or raw[:4] != b"RIFF" or raw[8:12] != b"WAVE":
        raise ValueError("지원하는 RIFF/WAVE 파일이 아닙니다.")
    if struct.unpack_from("<I", raw, 4)[0] + 8 != len(raw):
        raise ValueError("RIFF 파일 길이와 실제 bytes가 다릅니다.")
    # RIFF chunk는 홀수 payload 뒤 padding을 포함한다. header·payload·padding 경계를 각각 검사한다.
    chunks, offset = {}, 12
    while offset < len(raw):
        if offset + 8 > len(raw):
            raise ValueError("잘린 WAV chunk header입니다.")
        name, size = raw[offset:offset + 4], struct.unpack_from("<I", raw, offset + 4)[0]
        start, end = offset + 8, offset + 8 + size
        if end > len(raw) or name in chunks and name in (b"fmt ", b"data"):
            raise ValueError("잘리거나 중복된 WAV audio chunk입니다.")
        padded_end = end + (size & 1)
        if padded_end > len(raw):
            raise ValueError("홀수 WAV chunk의 padding byte가 없습니다.")
        chunks[name] = raw[start:end]
        offset = padded_end
    if offset != len(raw):
        raise ValueError("WAV chunk 경계와 파일 끝이 다릅니다.")
    fmt, data = chunks.get(b"fmt ", b""), chunks.get(b"data", b"")
    if len(fmt) < 16 or not data:
        raise ValueError("fmt/data가 없거나 오디오가 비어 있습니다.")
    code, channels, rate, byte_rate, alignment, bits = struct.unpack_from("<HHIIHH", fmt)
    # extensible WAV는 표준 PCM/IEEE subtype GUID와 일치하고 유효 bit 수가 container와 같아야 한다.
    if code == 0xFFFE:
        if len(fmt) < 40 or fmt[26:40] != bytes.fromhex("000000001000800000aa00389b71"):
            raise ValueError("지원하지 않는 extensible WAV입니다.")
        code = struct.unpack_from("<H", fmt, 24)[0]
        valid_bits = struct.unpack_from("<H", fmt, 18)[0]
        if valid_bits not in (0, bits):
            raise ValueError("container와 valid bit가 다른 WAV는 직접 검토해야 합니다.")
    if bits not in (16, 24, 32, 64):
        raise ValueError("지원하지 않는 bit depth입니다.")
    if channels not in (1, 2) or not 8000 <= rate <= 192000:
        raise ValueError("지원하지 않는 channels/sample rate입니다.")
    if alignment != channels * bits // 8 or byte_rate != rate * alignment or len(data) % alignment:
        raise ValueError("WAV block alignment가 잘못됐습니다.")
    if code == 1 and bits in (16, 24, 32):
        # NumPy에 기본 int24가 없어 3 bytes를 합친 뒤 24-bit 부호 확장을 직접 수행한다.
        if bits == 24:
            values = np.frombuffer(data, dtype=np.uint8).reshape(-1, 3).astype(np.int32)
            values = values[:, 0] | values[:, 1] << 8 | values[:, 2] << 16
            values = (values ^ 0x800000) - 0x800000
        else:
            values = np.frombuffer(data, dtype="<i" + str(bits // 8))
        audio = values.astype(np.float64) / (2 ** (bits - 1))
        sample_format = "PCM_" + str(bits)
    elif code == 3 and bits in (32, 64):
        audio = np.frombuffer(data, dtype="<f" + str(bits // 8)).astype(np.float64)
        sample_format = "FLOAT_" + str(bits)
    else:
        raise ValueError("지원하지 않는 WAV sample format입니다.")
    audio = audio.reshape(-1, channels)
    if not np.isfinite(audio).all():
        raise ValueError("NaN/Infinity sample이 있습니다.")
    return audio, rate, bits, sample_format, hashlib.sha256(raw).hexdigest()


def longest_run(mask):
    """boolean mask 양끝에 False를 붙여 맨 앞/끝 구간도 포함한 최장 True 연속 길이를 구한다."""
    edges = np.diff(np.r_[False, mask, False].astype(np.int8))
    starts, ends = np.flatnonzero(edges == 1), np.flatnonzero(edges == -1)
    return int(np.max(ends - starts)) if len(starts) else 0


def inspect(path: Path):
    """원본은 읽기만 하며 포맷·길이·sample peak/RMS·무음·clipping 후보와 SHA를 반환한다."""
    audio, rate, bits, sample_format, digest = read_wav(path)
    frames, channels = audio.shape
    peak = float(np.abs(audio).max())
    rms = float(np.sqrt(np.mean(audio * audio)))
    # 저레벨은 0.1초 블록 RMS로 판정한다. 마지막 불완전 블록의 zero padding도 계산에 포함한다.
    block = max(1, rate // 10)
    padded = np.pad(audio, ((0, (-frames) % block), (0, 0)))
    block_rms = np.sqrt(np.mean(padded.reshape(-1, block, channels) ** 2, axis=(1, 2)))
    silent = block_rms < 0.001
    # 정수 PCM의 양의 최대값은 1보다 작다. float WAV는 ±1을 full scale 경계로 쓴다.
    threshold = 1.0 - 1 / (2 ** (bits - 1)) if sample_format.startswith("PCM") else 1.0
    full_scale = np.max(np.abs(audio), axis=1) >= threshold
    warnings = []
    if not 90 <= frames / rate <= 180:
        warnings.append("길이가 90–180초 범위를 벗어납니다.")
    if channels != 2:
        warnings.append("stereo가 아닙니다.")
    if rate < 44100 or bits < 16:
        warnings.append("최소 44.1 kHz / 16 bit 요구를 만족하지 않습니다.")
    if longest_run(full_scale) >= 3:
        warnings.append("3 sample 이상 연속 full scale로 clipping 가능성이 있습니다.")
    if rms < 0.003:
        warnings.append("전체 신호가 매우 작습니다.")
    if longest_run(silent) / 10 >= 8:
        warnings.append("8초 이상 연속 저레벨 구간이 있어 청취 검토가 필요합니다.")
    return {
        "fileName": path.name, "sha256": digest, "byteSize": path.stat().st_size,
        "durationSeconds": frames / rate, "sampleRate": rate, "channels": channels,
        "sampleFormat": sample_format, "bitDepth": bits,
        "samplePeakDbfs": 20 * math.log10(peak) if peak else None,
        "rmsDbfs": 20 * math.log10(rms) if rms else None,
        "fullScaleFrames": int(full_scale.sum()), "maxFullScaleRun": longest_run(full_scale),
        "longestBelowMinus60DbSeconds": longest_run(silent) / 10,
        "warnings": warnings,
        "qaScope": "전체 bytes 디코딩 및 신호 검사. 실제 청취·장르 적합성·true peak·LUFS 검증은 포함하지 않습니다."
    }


def export_wav(source: Path, destination: Path, seed: int):
    """원본을 덮어쓰지 않고 peak 감쇠·짧은 fade·TPDF dither 후 PCM24로 출력한다."""
    audio, rate, _, _, _ = read_wav(source)
    if destination.exists() or destination.is_symlink():
        raise ValueError("기존 출력 파일을 덮어쓰지 않습니다.")
    if audio.shape[1] != 2 or rate < 44100:
        raise ValueError("업샘플링/가상 stereo는 하지 않습니다.")
    peak = float(np.abs(audio).max())
    # 필요한 경우에만 감쇠한다. 작은 입력을 증폭하거나 원본 clipping을 복원한다고 주장하지 않는다.
    gain = min(1.0, (10 ** (-1.0 / 20)) / peak) if peak else 1.0
    audio *= gain
    fade_in, fade_out = min(len(audio), round(rate * 0.01)), min(len(audio), round(rate * 1.0))
    audio[:fade_in] *= np.linspace(0, 1, fade_in)[:, None]
    audio[-fade_out:] *= np.linspace(1, 0, fade_out)[:, None]
    # 같은 seed에서 재현 가능한 TPDF dither를 더한 뒤 signed PCM24로 양자화한다.
    rng = np.random.default_rng(seed)
    scaled = audio * (2 ** 23)
    scaled += rng.random(audio.shape) - rng.random(audio.shape)
    encoded = np.clip(np.rint(scaled), -(2 ** 23), 2 ** 23 - 1).astype(np.int32).reshape(-1)
    packed = np.column_stack((encoded & 255, encoded >> 8 & 255, encoded >> 16 & 255)).astype(np.uint8)
    with destination.open("xb") as file:
        with wave.open(file, "wb") as output:
            output.setnchannels(2)
            output.setsampwidth(3)
            output.setframerate(rate)
            output.writeframes(packed.tobytes())
    return {"gainDb": 20 * math.log10(gain), "fadeInSeconds": 0.01, "fadeOutSeconds": 1.0,
            "outputFormat": "PCM_24", "dither": "TPDF, deterministic seed",
            "sampleRateChanged": False, "durationChanged": False}


def copy_wav_exclusive(source: Path, destination: Path, expected_sha256: str | None = None, *, clone_on_macos=False):
    """독립 파일로 복사한다. 원본 유지 모드의 macOS clone 실패는 전체복사로 fallback하지 않는다."""
    if destination.exists() or destination.is_symlink():
        raise ValueError("기존 출력 파일을 덮어쓰지 않습니다.")
    if source.is_symlink() or not source.is_file():
        raise ValueError("일반 로컬 원본만 복사할 수 있습니다.")
    try:
        before = source.stat()
        if clone_on_macos and sys.platform == "darwin":
            clone = ctypes.CDLL(None, use_errno=True).clonefile
            clone.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_uint32]
            clone.restype = ctypes.c_int
            if clone(os.fsencode(source), os.fsencode(destination), 0) != 0:
                raise ValueError("APFS 원본 복제를 완료하지 못했습니다. 같은 볼륨과 저장 공간을 확인하세요. 기존 파일은 덮어쓰지 않습니다.")
            method = "APFS clonefile copy-on-write"
        else:
            with source.open("rb") as original, destination.open("xb") as copied:
                shutil.copyfileobj(original, copied, length=1024 * 1024)
                copied.flush()
                os.fsync(copied.fileno())
            method = "exclusive independent byte copy"
        # hardlink는 원본과 수정 내용을 공유하므로 nlink=1·별도 inode를 필수로 확인한다.
        copied_stat = destination.lstat()
        if destination.is_symlink() or not destination.is_file() or copied_stat.st_nlink != 1 or (copied_stat.st_dev, copied_stat.st_ino) == (before.st_dev, before.st_ino):
            raise ValueError("독립 복사본의 파일 소유 경계를 확인하지 못했습니다.")
        if copied_stat.st_size != before.st_size:
            raise ValueError("복사본 길이가 원본과 다릅니다.")
        if expected_sha256 is not None:
            copied_hash = hashlib.sha256()
            with destination.open("rb") as copied:
                for block in iter(lambda: copied.read(1024 * 1024), b""):
                    copied_hash.update(block)
            if copied_hash.hexdigest() != expected_sha256:
                raise ValueError("복사본 SHA256이 검사한 원본과 다릅니다.")
        return method
    except (OSError, AttributeError):
        raise ValueError("원본의 독립 복사를 완료하지 못했습니다. 저장 공간과 폴더 상태를 확인하세요.") from None


def require_preservable_wav(qa):
    """원본 bytes 그대로 업로드할 때는 PCM과 추가 headroom을 요구한다."""
    peak = qa["samplePeakDbfs"]
    if (qa["warnings"] or qa["sampleFormat"] not in ("PCM_16", "PCM_24", "PCM_32")
            or qa["channels"] != 2 or qa["sampleRate"] < 44100 or qa["bitDepth"] < 16
            or not 90 <= qa["durationSeconds"] <= 180 or peak is None
            or not math.isfinite(peak) or peak > -0.5):
        raise ValueError("원본 유지 옵션은 경고 없는 90–180초 stereo PCM WAV, 최소 44.1 kHz/16 bit, sample peak -0.5 dBFS 이하만 허용합니다.")


def package(plan_path: Path, manifest_path: Path, destination: Path, preserve_original_wav=False):
    """완료한 서로 다른 20곡을 검사한 뒤 새 폴더에 WAV·공개 metadata·provenance를 만든다."""
    plan = json.loads(plan_path.read_text(encoding="utf-8"))
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    tracks = plan["tracks"]
    results = manifest["results"]
    numbers = [entry["trackNumber"] for entry in results]
    if (len(tracks) != 20 or len(results) != 20 or sorted(numbers) != list(range(1, 21))
            or sorted(track["number"] for track in tracks) != list(range(1, 21))):
        raise ValueError("완료 결과 20곡이 모두 있어야 업로드 패키지를 만듭니다.")
    if destination.exists() or destination.is_symlink():
        raise ValueError("기존 폴더를 덮어쓰지 않습니다. 새 전용 폴더를 지정하세요.")
    by_number = {entry["trackNumber"]: entry for entry in results}
    # 이 preflight가 끝나기 전에는 출력 폴더를 만들지 않는다. 공개 정보와 신호 경고를 먼저 차단한다.
    checked = []
    reference_directions = {}
    for track in tracks:
        entry = by_number[track["number"]]
        if not entry.get("requestId") or entry.get("state") != "completed":
            raise ValueError("완료 request ID가 없는 곡입니다.")
        record = public_provenance(plan, track, entry)
        reference_fields = selected_fields(track, {"referenceDirection": (str, type(None))})
        validate_public(reference_fields)
        reference_directions[record["number"]] = reference_fields.get("referenceDirection")
        stem = f'{record["number"]:02d}_{record["title"].replace(" ", "_")}'
        source = Path(entry["localFile"])
        qa = inspect(source)
        if "sha256" in entry and entry["sha256"] != qa["sha256"]:
            raise ValueError("완료 manifest의 원본 SHA256과 실제 파일이 다릅니다.")
        if qa["warnings"]:
            raise ValueError(str(track["number"]) + "번 곡의 신호 경고를 해결해야 합니다: " + "; ".join(qa["warnings"]))
        if preserve_original_wav:
            require_preservable_wav(qa)
        # 로컬 원본 이름도 공개하지 않고 패키지 안의 원본 파일명으로 기록한다.
        qa["fileName"] = stem + "_original.wav"
        checked.append((record, source, qa, stem))
    if len({qa["sha256"] for _, _, qa, _ in checked}) != 20:
        raise ValueError("원본 bytes가 같은 중복 곡이 있습니다.")
    # 이후 실패하면 미완료 표식을 남긴다. 이미 쓴 파일을 성공 패키지처럼 보이게 만들지 않는다.
    destination.mkdir(parents=True, exist_ok=False)
    upload, metadata, provenance = (destination / name for name in ("Upload_WAV", "Metadata", "Provenance"))
    for folder in (upload, metadata, provenance):
        folder.mkdir()
    summaries = []
    try:
        for record, source, original_qa, stem in checked:
            original = provenance / (stem + "_original.wav")
            original_copy_method = copy_wav_exclusive(source, original, original_qa["sha256"], clone_on_macos=preserve_original_wav)
            out = upload / (stem + ".wav")
            # 원본 유지와 PCM24 변환 경로를 구분해 bytes 변경 여부를 기록과 실제 산출물에 맞춘다.
            if preserve_original_wav:
                upload_copy_method = copy_wav_exclusive(original, out, original_qa["sha256"], clone_on_macos=True)
                modifications = {"preservedOriginalWav": True, "bytesChanged": False,
                                 "gainDb": 0, "fadeInSeconds": 0, "fadeOutSeconds": 0,
                                 "outputFormat": original_qa["sampleFormat"], "dither": "none",
                                 "sampleRateChanged": False, "durationChanged": False,
                                 "copyMethod": upload_copy_method}
            else:
                modifications = export_wav(original, out, record["seedRequested"])
            export_qa = inspect(out)
            if export_qa["warnings"]:
                raise ValueError("export 검사 경고가 발생했습니다.")
            if preserve_original_wav:
                require_preservable_wav(export_qa)
                if export_qa["sha256"] != original_qa["sha256"]:
                    raise ValueError("업로드 복사본의 bytes가 원본과 다릅니다.")
            record.update({"original": original_qa, "export": export_qa, "modifications": modifications,
                           "originalCopyMethod": original_copy_method})
            validate_public(record)
            (provenance / (stem + ".json")).write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            description = record["description"] + "\n\nSoundry에서 Codex CLI의 AI 악보 작곡과 로컬 합성으로 제작한 instrumental 테스트 곡입니다."
            (metadata / (stem + ".txt")).write_text(
                f'제목: {record["title"]}\n장르: {record["genre"]}\n콘셉트: {record["concept"]}\n'
                f'설명:\n{description}\n\n태그: ' + ", ".join(record["tags"]) + "\n", encoding="utf-8")
            summaries.append({"number": record["number"], "title": record["title"], "genre": record["genre"],
                              "file": "Upload_WAV/" + out.name, **{key: export_qa[key] for key in
                              ("durationSeconds", "sampleRate", "channels", "bitDepth", "samplePeakDbfs", "sha256")}})
        (metadata / "manifest.json").write_text(json.dumps(summaries, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        with (metadata / "manifest.csv").open("x", encoding="utf-8-sig", newline="") as file:
            writer = csv.DictWriter(file, fieldnames=list(summaries[0]))
            writer.writeheader()
            writer.writerows(summaries)
        processing_note = ("검증한 원본 WAV를 변환 없이 독립 복사했습니다. 원본과 업로드 파일의 SHA256은 같으며 추가 감쇠·fade·dither를 적용하지 않았습니다.\n"
                           if preserve_original_wav else
                           "원본을 보존하고 export에만 최대 -1 dBFS sample peak 감쇠, 10 ms fade-in, 1초 fade-out, PCM24 dither를 적용했습니다.\n")
        catalog_entries = []
        unlistened = []
        for record, _, _, stem in sorted(checked, key=lambda item: item[0]["number"]):
            reference = reference_directions[record["number"]]
            reference_note = f"\n   참고 방향: {reference}" if reference else ""
            catalog_entries.append(
                f'{record["number"]:02d}. {record["title"]}\n'
                f'   장르: {record["genre"]}\n   콘셉트: {record["concept"]}'
                + reference_note +
                f"\n   업로드 파일: Upload_WAV/{stem}.wav\n   복사용 설명: Metadata/{stem}.txt")
            if not record["listeningQa"]["performed"]:
                unlistened.append(f'{record["number"]:02d}')
        listening_note = (f"실제 청취를 수행하지 않은 곡: {', '.join(unlistened)}번.\n" if unlistened else "")
        (destination / "읽어 주세요.txt").write_text(
            "Soundry 테스트 음원 20곡\n\n"
            "Codex CLI가 AI로 악보를 작곡하고 Soundry의 로컬 악기로 합성한 연주곡입니다.\n\n"
            "사용 방법\n"
            "1. 아래 목록에서 원하는 번호·제목·장르·콘셉트·참고 방향을 확인하세요.\n"
            "2. 같은 번호로 시작하는 Upload_WAV의 WAV 파일을 SoundCloud 업로드에 사용하세요.\n"
            "3. Metadata의 같은 번호·제목 TXT에서 제목·설명·태그를 복사하세요. manifest에는 전체 파일 목록과 SHA256이 있습니다.\n"
            "4. Provenance에는 생성 원본, 설정과 변환 내역, 신호 검사 및 청취 기록이 있습니다.\n\n"
            + processing_note + "\n청취와 검사 범위\n" + listening_note +
            "신호 검사는 실제 청취나 장르 적합성·편곡 완성도 평가를 대신하지 않습니다.\n"
            "청취 기록이 있는 곡도 곡별 provenance의 방법·구간까지만 확인한 것으로 보세요.\n"
            "\n"
            "곡 목록\n\n" + "\n\n".join(catalog_entries) + "\n",
            encoding="utf-8")
    except Exception:
        (destination / "패키지 미완료.txt").write_text("패키징 도중 오류가 발생했습니다. 업로드하지 말고 로그를 확인하세요.\n", encoding="utf-8")
        raise
    return {"trackCount": len(summaries), "totalSeconds": sum(row["durationSeconds"] for row in summaries),
            "destination": str(destination)}


def main():
    """inspect/export/package를 명시적으로 선택해 실행하고 검사 실패를 종료 코드 1로 전달한다."""
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    read = sub.add_parser("inspect")
    read.add_argument("file", type=Path)
    export = sub.add_parser("export")
    export.add_argument("source", type=Path)
    export.add_argument("destination", type=Path)
    export.add_argument("--seed", type=int, default=20261001)
    pack = sub.add_parser("package")
    pack.add_argument("--plan", type=Path, required=True)
    pack.add_argument("--manifest", type=Path, required=True)
    pack.add_argument("--destination", type=Path, required=True)
    pack.add_argument("--preserve-original-wav", action="store_true", help="검증된 PCM WAV를 변환 없이 독립 복사합니다. macOS는 같은 APFS 볼륨의 clonefile을 요구합니다.")
    args = parser.parse_args()
    try:
        if args.command == "inspect":
            result = inspect(args.file)
        elif args.command == "export":
            result = export_wav(args.source, args.destination, args.seed)
        else:
            result = package(args.plan, args.manifest, args.destination, preserve_original_wav=args.preserve_original_wav)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except (ValueError, OSError, KeyError, json.JSONDecodeError) as error:
        print("음원 검사/패키징 실패: " + str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
