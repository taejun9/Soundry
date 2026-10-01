#!/usr/bin/env python3
"""독립 임시 파일에서 WAV 변환과 실패 경계를 검증한다. 완성 음원을 만들지 않는다."""
import importlib.util
import copy
import hashlib
import json
import shutil
from pathlib import Path
import struct
import sys
import tempfile
import wave
from unittest.mock import Mock, patch

import numpy as np

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("audio_tools", Path(__file__).with_name("audio_tools.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
checks = []
with tempfile.TemporaryDirectory(prefix="soundry-music-qa-") as temporary:
    root = Path(temporary)
    rate = 44100
    time = np.arange(rate * 90) / rate
    pcm = (np.column_stack((np.sin(time * 2 * np.pi * 220), np.sin(time * 2 * np.pi * 330))) * 0.95 * 32767).astype("<i2")
    source = root / "source.wav"
    with wave.open(str(source), "wb") as output:
        output.setnchannels(2)
        output.setsampwidth(2)
        output.setframerate(rate)
        output.writeframes(pcm.tobytes())
    original = source.read_bytes()
    inspected = module.inspect(source)
    assert inspected["durationSeconds"] == 90 and inspected["channels"] == 2 and not inspected["warnings"]
    checks.append("PCM16 stereo 90초 디코딩")
    exported = root / "export.wav"
    module.export_wav(source, exported, 1)
    with wave.open(str(exported), "rb") as independent_reader:
        assert independent_reader.getsampwidth() == 3
        assert independent_reader.getnframes() == rate * 90
        assert independent_reader.getnchannels() == 2
        assert independent_reader.getframerate() == rate
    export_check = module.inspect(exported)
    assert source.read_bytes() == original
    assert export_check["samplePeakDbfs"] <= -0.9999 and not export_check["warnings"]
    checks.append("표준 wave reader로 PCM24 export·원본 보존·길이 유지·headroom 확인")
    try:
        module.export_wav(source, exported, 1)
        raise AssertionError("overwrite accepted")
    except ValueError:
        checks.append("기존 출력 덮어쓰기 거부")
    floating = pcm.astype("<f4") / 32768 * 0.8
    fmt = struct.pack("<HHIIHH", 3, 2, rate, rate * 8, 8, 32)
    data = floating.tobytes()
    float_file = root / "float.wav"
    float_file.write_bytes(b"RIFF" + struct.pack("<I", 4 + 8 + len(fmt) + 8 + len(data)) + b"WAVEfmt " + struct.pack("<I", len(fmt)) + fmt + b"data" + struct.pack("<I", len(data)) + data)
    assert module.inspect(float_file)["sampleFormat"] == "FLOAT_32"
    checks.append("IEEE float32 WAV 디코딩")
    broken = root / "broken.wav"
    broken.write_bytes(original[:-13])
    try:
        module.inspect(broken)
        raise AssertionError("truncated accepted")
    except ValueError:
        checks.append("잘린 WAV 거부")
    linked = root / "linked.wav"
    linked.symlink_to(source)
    try:
        module.inspect(linked)
        raise AssertionError("symlink accepted")
    except ValueError:
        checks.append("symlink 원본 거부")
    manifest = root / "incomplete.json"
    manifest.write_text('{"results":[]}', encoding="utf-8")
    destination = root / "not-created"
    try:
        module.package(ROOT / "harness/music/track-plan.json", manifest, destination)
        raise AssertionError("incomplete accepted")
    except ValueError:
        assert not destination.exists()
        checks.append("20곡 미완료 시 패키지 생성 거부")

    # RIFF 길이는 맞지만 마지막 홀수 chunk의 padding이 없는 별도 손상 사례다.
    def with_tail(tail):
        raw = bytearray(original + tail)
        struct.pack_into("<I", raw, 4, len(raw) - 8)
        return raw

    odd = root / "odd-missing-pad.wav"
    odd.write_bytes(with_tail(b"JUNK" + struct.pack("<I", 1) + b"x"))
    try:
        module.inspect(odd)
        raise AssertionError("missing odd padding accepted")
    except ValueError:
        checks.append("RIFF 길이가 맞아도 마지막 홀수 chunk padding 누락 거부")
    padded = root / "odd-padded.wav"
    padded.write_bytes(with_tail(b"JUNK" + struct.pack("<I", 1) + b"x" + bytes([0])))
    assert module.inspect(padded)["durationSeconds"] == 90
    checks.append("정상 padding이 있는 홀수 chunk 허용")
    trailing = root / "trailing-header-fragment.wav"
    trailing.write_bytes(with_tail(b"JU"))
    try:
        module.inspect(trailing)
        raise AssertionError("trailing fragment accepted")
    except ValueError:
        checks.append("마지막 chunk 뒤 잘린 header 거부")

    plan = json.loads((ROOT / "harness/music/track-plan.json").read_text())
    # 검사용 가상 주소와 가상 인증값이다. 외부 통신은 하지 않는다.
    private_url = "https" + "://" + "review.invalid/private?token=fixture-only"
    private_value = "fixture-only-secret"
    # 원본 유지 모드의 통합 검증에 쓸 PCM16. clone fixture는 큰 20개 파일의 실제 복제를 피한다.
    safe_source = root / "safe-source.wav"
    with wave.open(str(safe_source), "wb") as output:
        output.setnchannels(2)
        output.setsampwidth(2)
        output.setframerate(rate)
        output.writeframes((pcm.astype(np.float64) * 0.8).astype("<i2").tobytes())
    safe_check = module.inspect(safe_source)
    module.require_preservable_wav(safe_check)
    module.require_preservable_wav(export_check)
    results = []
    for track in plan["tracks"]:
        number = track["number"]
        local = root / f"fixture-{number}.wav"
        module.copy_wav_exclusive(safe_source, local, safe_check["sha256"], clone_on_macos=True)
        with local.open("r+b") as fixture:
            fixture.seek(44)
            fixture.write(struct.pack("<h", number))
        results.append({
            "trackNumber": number, "requestId": f"fixture-request-{number}",
            "state": "completed", "localFile": str(local),
            "provider": "cli", "model": plan["model"], "seedReturned": str(number) if number % 3 == 0 else number if number % 3 == 1 else None,
            "sourceUrl": private_url, "authorization": private_value,
            "listeningQa": {
                "performed": False, "method": "합성 fixture, 실제 청취 아님", "notes": "테스트용 기록",
                "sourceUrl": private_url, "FAL_KEY": private_value,
                "segments": [{"startSeconds": 0, "endSeconds": 1, "sourceUrl": private_url}],
            },
        })
    plan_file = root / "plan.json"
    plan_file.write_text(json.dumps(plan), encoding="utf-8")
    manifest.write_text(json.dumps({"results": results}), encoding="utf-8")
    for field in ("notes", "prompt", "requestId"):
        bad_plan, bad_results = copy.deepcopy(plan), copy.deepcopy(results)
        if field == "notes":
            bad_results[0]["listeningQa"]["notes"] = private_url
        elif field == "prompt":
            bad_plan["tracks"][0]["input"]["prompt"] = "FAL_KEY=" + private_value
        else:
            bad_results[0]["requestId"] = "Bearer " + private_value
        bad_plan_file = root / "bad-plan.json"
        bad_manifest = root / "bad-manifest.json"
        bad_plan_file.write_text(json.dumps(bad_plan), encoding="utf-8")
        bad_manifest.write_text(json.dumps({"results": bad_results}), encoding="utf-8")
        bad_destination = root / ("rejected-" + field)
        try:
            module.package(bad_plan_file, bad_manifest, bad_destination)
            raise AssertionError("private public-field value accepted: " + field)
        except ValueError:
            assert not bad_destination.exists()
    checks.append("허용 필드 안의 URL·key 할당·Bearer 값을 출력 폴더 생성 전에 거부")
    try:
        module.validate_public({"sourceUrl": "fixture"})
        raise AssertionError("private key accepted")
    except ValueError:
        checks.append("공개 구조의 민감 키 거부")
    for changed_input in (
        {**plan["tracks"][0]["input"], "sourceUrl": private_url},
        {**plan["tracks"][0]["input"], "settings": {"mode": "instrumental", "sourceUrl": private_url}},
        {**plan["tracks"][0]["input"], "settings": {"seed": "x" * 65}},
        {**plan["tracks"][0]["input"], "settings": {"durationSeconds": 89}},
        {**plan["tracks"][0]["input"], "settings": {"bpm": True}},
        {**plan["tracks"][0]["input"], "settings": {"mode": "vocal"}},
        {**plan["tracks"][0]["input"], "variationCount": 2},
        {**plan["tracks"][0]["input"], "prompt": " "},
    ):
        try:
            module.public_generation_input(changed_input)
            raise AssertionError("invalid CLI generation input accepted")
        except ValueError:
            pass
    checks.append("CLI 입력 allowlist·seed64·길이/BPM·instrumental·1곡 요청 경계")
    for wrong_entry in ({**results[0], "model": "mock"}, {**results[0], "provider": "mock"}, {key: value for key, value in results[0].items() if key != "model"}):
        try:
            module.public_provenance(plan, plan["tracks"][0], wrong_entry)
            raise AssertionError("wrong or missing source model accepted")
        except ValueError:
            pass
    checks.append("실제 완료 결과의 CLI provider/model 일치 요구·모델 fallback 거부")
    for name, unsafe_source in (("high-peak", source), ("floating", float_file)):
        unsafe_results = copy.deepcopy(results)
        unsafe_results[0]["localFile"] = str(unsafe_source)
        unsafe_manifest = root / (name + ".json")
        unsafe_manifest.write_text(json.dumps({"results": unsafe_results}), encoding="utf-8")
        refused = root / (name + "-package")
        try:
            module.package(plan_file, unsafe_manifest, refused, preserve_original_wav=True)
            raise AssertionError("unsafe preserved WAV accepted: " + name)
        except ValueError:
            assert not refused.exists()
    checks.append("원본 유지 시 -0.5 dBFS 초과 peak와 float WAV를 출력 폴더 생성 전 거부")

    # 기존 기본 PCM24 전체 경로는 한 번만 검증한 다음 임시 산출물을 해제한다.
    packaged = root / "synthetic-package"
    result = module.package(plan_file, manifest, packaged)
    assert result["trackCount"] == 20 and result["totalSeconds"] == 1800
    records = list((packaged / "Provenance").glob("*.json"))
    assert len(records) == 20
    for record_file in records:
        text = record_file.read_text()
        record = json.loads(text)
        assert private_url not in text and private_value not in text
        assert "sourceUrl" not in text and "FAL_KEY" not in text and "localFile" not in text
        assert set(record["input"]) == {"prompt", "settings", "variationCount"}
        assert set(record["input"]["settings"]) <= set(module.SETTING_FIELDS)
        assert record["provider"] == "cli" and record["model"] == plan["model"]
        assert "endpoint" not in record
        assert record["seedReturned"] == results[record["number"] - 1]["seedReturned"]
        assert type(record["seedRequested"]) is int
        assert set(record["listeningQa"]) == {"performed", "method", "notes", "segments"}
        assert record["listeningQa"]["segments"] == [{"startSeconds": 0, "endSeconds": 1}]
        assert record["listeningQa"]["performed"] is False
        assert record["original"]["fileName"] == record_file.stem + "_original.wav"
        assert record["export"]["sampleFormat"] == "PCM_24" and record["modifications"]["fadeOutSeconds"] == 1.0
        assert record["original"]["sha256"] != record["export"]["sha256"]
    assert len(list((packaged / "Upload_WAV").glob("*.wav"))) == 20
    checks.append("합성 WAV 20개 전체 패키징에서 중첩 비공개 필드 제외·공개 기록 보존 확인")
    shutil.rmtree(packaged)

    preserved = root / "preserved-package"
    result = module.package(plan_file, manifest, preserved, preserve_original_wav=True)
    assert result["trackCount"] == 20 and result["totalSeconds"] == 1800
    for record_file in (preserved / "Provenance").glob("*.json"):
        record = json.loads(record_file.read_text())
        original_copy = preserved / "Provenance" / record["original"]["fileName"]
        upload_copy = preserved / "Upload_WAV" / record["export"]["fileName"]
        source_file = Path(results[record["number"] - 1]["localFile"])
        files = [source_file, original_copy, upload_copy]
        states = [file.stat() for file in files]
        assert len({(state.st_dev, state.st_ino) for state in states}) == 3
        assert all(state.st_nlink == 1 for state in states)
        assert record["original"]["sha256"] == record["export"]["sha256"]
        assert all(hashlib.sha256(file.read_bytes()).hexdigest() == record["original"]["sha256"] for file in files)
        assert record["original"]["sampleFormat"] == record["export"]["sampleFormat"] == "PCM_16"
        assert record["modifications"]["preservedOriginalWav"] is True and record["modifications"]["bytesChanged"] is False
        assert record["modifications"]["gainDb"] == record["modifications"]["fadeInSeconds"] == record["modifications"]["fadeOutSeconds"] == 0
        assert record["modifications"]["dither"] == "none"
        assert record["originalCopyMethod"] == record["modifications"]["copyMethod"]
        if sys.platform == "darwin":
            assert record["originalCopyMethod"] == "APFS clonefile copy-on-write"
    assert "변환 없이" in (preserved / "읽어 주세요.txt").read_text()
    checks.append("원본 유지 20곡 PCM16 bytes·SHA 동일, 세 독립 inode/nlink1, 무변환 metadata 확인")

    # 업로드 파일을 수정해도 원본과 Provenance 복사본은 변하지 않는 실제 COW 경계다.
    unchanged_hash = hashlib.sha256(original_copy.read_bytes()).hexdigest()
    with upload_copy.open("r+b") as output:
        output.seek(44)
        output.write(struct.pack("<h", 1234))
    assert hashlib.sha256(upload_copy.read_bytes()).hexdigest() != unchanged_hash
    assert hashlib.sha256(original_copy.read_bytes()).hexdigest() == unchanged_hash
    assert hashlib.sha256(source_file.read_bytes()).hexdigest() == unchanged_hash
    assert source.read_bytes() == original
    assert module.inspect(safe_source)["sha256"] == safe_check["sha256"]
    checks.append("업로드 복사본 수정 후 앱 원본·Provenance·fixture 원본 불변")

    for existing in (original_copy, linked):
        before = existing.read_bytes()
        try:
            module.copy_wav_exclusive(safe_source, existing, clone_on_macos=True)
            raise AssertionError("existing destination overwritten")
        except ValueError:
            assert existing.read_bytes() == before
    checks.append("원본 유지 복사에서 기존 파일과 symlink 대상 덮어쓰기 거부")

    # 실패 시 공간을 소모하는 일반 복사로 조용히 전환하지 않는다.
    refused_clone = root / "failed-clone.wav"
    failed_library = Mock()
    failed_library.clonefile.return_value = -1
    with patch.object(module.sys, "platform", "darwin"), patch.object(module.ctypes, "CDLL", return_value=failed_library), patch.object(module.shutil, "copyfileobj", side_effect=AssertionError("unexpected fallback")):
        try:
            module.copy_wav_exclusive(safe_source, refused_clone, clone_on_macos=True)
            raise AssertionError("failed clone accepted")
        except ValueError as error:
            assert str(safe_source) not in str(error) and str(refused_clone) not in str(error)
            assert not refused_clone.exists()
    checks.append("clonefile 실패 정제 오류·대용량 일반복사 fallback 금지")

    ordinary = root / "ordinary-copy.wav"
    with patch.object(module.sys, "platform", "linux"), patch.object(module.ctypes, "CDLL", side_effect=AssertionError("clone must not run")):
        assert module.copy_wav_exclusive(safe_source, ordinary, safe_check["sha256"], clone_on_macos=True) == "exclusive independent byte copy"
    assert ordinary.stat().st_nlink == 1 and ordinary.stat().st_ino != safe_source.stat().st_ino
    assert hashlib.sha256(ordinary.read_bytes()).hexdigest() == safe_check["sha256"]
    checks.append("다른 플랫폼 exclusive 일반복사·동일 hash·독립 inode")

print(json.dumps({"passed": checks, "actualMusicGenerated": 0}, ensure_ascii=False, indent=2))
