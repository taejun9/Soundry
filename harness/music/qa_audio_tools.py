#!/usr/bin/env python3
"""독립 임시 파일에서 WAV 변환·저장 경계와 공개 패키지 구성을 검증한다.

90초 PCM24 변환은 실제 구현으로 검사한다. 20곡 metadata 통합의 변환/복사만
검증된 파일을 재사용하는 대역으로 제한해 macOS APFS의 임시 디스크 사용량을 줄인다.
원본 유지 패키지의 실제 COW·SHA·독립 inode 검사는 대역 없이 실행한다.
사용자 파일·외부 작곡은 접근하지 않으며 테스트 sine을 완성 음원으로 집계하지 않는다.
"""
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

# 동적 import의 __pycache__도 저장소에 남기지 않도록 설정한다.
sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("audio_tools", Path(__file__).with_name("audio_tools.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
checks = []
# 모든 쓰기는 이 suite만 소유한 임시 폴더 안에서 수행하고 실패 때도 context manager가 정리한다.
with tempfile.TemporaryDirectory(prefix="soundry-music-qa-") as temporary:
    root = Path(temporary)
    rate = 44100
    # 최소 허용 길이 90초·stereo 44.1 kHz를 실제 bytes로 만들어 포맷과 길이 검사를 우회하지 않는다.
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
    export_modifications = module.export_wav(source, exported, 1)
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
    # 직접 만든 IEEE float header는 PCM과 다른 decode 분기를 지나야 한다.
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
    broken.unlink()
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
        """전체 RIFF 길이만 맞춰 chunk padding/header 검사가 독립적으로 실패하는지 확인한다."""
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

    # 손상 boundary를 검사한 대용량 사본은 이후 재사용하지 않으므로 즉시 해제한다.
    for checked_file in (odd, padded, trailing):
        checked_file.unlink()

    plan = json.loads((ROOT / "harness/music/track-plan.json").read_text())
    # 검사용 가상 주소와 가상 인증값이다. 외부 통신은 하지 않는다.
    private_url = "https" + "://" + "review.invalid/private?token=fixture-only"
    private_value = "fixture-only-secret"
    # 원본 유지 모드용 PCM16은 -0.5 dBFS 아래다. APFS clone으로 각 번호의 첫 sample만 바꿔 고유 SHA를 만든다.
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
    # 허용된 공개 필드 안에 민감한 형태를 넣어도 출력 폴더 생성 전에 거부해야 한다.
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
    llama_plan = {**plan, "provider": "llamacpp", "model": "llamacpp:gemma-test:score-v1"}
    llama_entry = {**results[0], "provider": "llamacpp", "model": llama_plan["model"]}
    assert module.public_provenance(llama_plan, plan["tracks"][0], llama_entry)["provider"] == "llamacpp"
    for bad_model in ("mock", "llamacpp:/private/model:score-v1", "llamacpp:https://remote:score-v1", "llamacpp:" + "a" * 91 + ":score-v1"):
        try:
            module.public_provenance({**llama_plan, "model": bad_model}, plan["tracks"][0], {**llama_entry, "model": bad_model})
            raise AssertionError("unsafe llama model accepted")
        except ValueError:
            pass
    checks.append("로컬 llama.cpp 악보 출처 허용·실제 모델 일치·경로/원격주소/과대 모델 거부")
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

    # 변환 알고리즘은 위 90초 실제 export에서 독립 wave reader로 검증했다.
    # 여기서는 20곡의 공개 metadata·파일 배치·변환 기록 연결을 검사한다.
    # 변환 결과와 원본을 clone하는 대역으로 PCM24 20개를 다시 생성하지 않는다.
    # 따라서 이 단계는 서로 다른 20개 실제 변환의 end-to-end 검증으로 보고하지 않는다.
    actual_copy = module.copy_wav_exclusive
    export_calls = []

    def copy_for_metadata(source_file, destination_file, expected_sha256=None, *, clone_on_macos=False):
        """패키지 경로/해시 검증은 실제 copier에 맡기고 macOS에서만 COW를 강제한다."""
        return actual_copy(source_file, destination_file, expected_sha256, clone_on_macos=True)

    def export_for_metadata(source_file, destination_file, seed):
        """실제 생성해 검사한 PCM24를 독립 복제하고 호출 연결을 따로 기록한다."""
        assert source_file.is_file() and source_file.parent.name == "Provenance"
        export_calls.append((source_file.name, destination_file.name, seed))
        actual_copy(exported, destination_file, export_check["sha256"], clone_on_macos=True)
        return dict(export_modifications)

    packaged = root / "synthetic-package"
    with patch.object(module, "copy_wav_exclusive", side_effect=copy_for_metadata), patch.object(module, "export_wav", side_effect=export_for_metadata):
        result = module.package(plan_file, manifest, packaged)
    assert export_calls == [
        (f'{track["number"]:02d}_{track["title"].replace(" ", "_")}_original.wav',
         f'{track["number"]:02d}_{track["title"].replace(" ", "_")}.wav', track["seed"])
        for track in plan["tracks"]
    ]
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
    checks.append("검증된 PCM24 대역을 쓴 20곡 패키지 구성·seed 연결·비공개 필드 제외·공개 기록 보존")
    shutil.rmtree(packaged)

    # patch context 밖에서 실제 원본 유지 패키지를 만들어 디스크 소유권과 bytes 보존을 통합 검증한다.
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

    # 새 10곡 계약은 변환/복사 대역 없이 실제 원본 유지 경로와 누락·번호 경계를 확인한다.
    ten_plan = {**plan, "tracks": plan["tracks"][:10]}
    ten_plan_file = root / "ten-plan.json"
    ten_plan_file.write_text(json.dumps(ten_plan), encoding="utf-8")
    ten_manifest = root / "ten-manifest.json"
    ten_manifest.write_text(json.dumps({"results": results[:10]}), encoding="utf-8")
    ten_destination = root / "ten-package"
    ten_result = module.package(ten_plan_file, ten_manifest, ten_destination, preserve_original_wav=True)
    assert ten_result["trackCount"] == 10 and ten_result["totalSeconds"] == 900
    assert len(list((ten_destination / "Upload_WAV").glob("*.wav"))) == 10
    assert "Soundry 테스트 음원 10곡" in (ten_destination / "읽어 주세요.txt").read_text()
    for record in json.loads((ten_destination / "Metadata" / "manifest.json").read_text()):
        assert record["sha256"] == hashlib.sha256(Path(results[record["number"] - 1]["localFile"]).read_bytes()).hexdigest()
    checks.append("원본 유지 10곡 실제 패키징·안내·전수 SHA 확인")
    for index, bad_tracks in enumerate(([], plan["tracks"] + [plan["tracks"][0]], [plan["tracks"][0]] * 10, plan["tracks"][:9])):
        ten_plan_file.write_text(json.dumps({**plan, "tracks": bad_tracks}), encoding="utf-8")
        refused = root / f"bad-count-{index}"
        try:
            module.package(ten_plan_file, ten_manifest, refused, preserve_original_wav=True)
            raise AssertionError("invalid count or duplicate numbering accepted")
        except ValueError:
            assert not refused.exists()
    checks.append("빈 계획·21곡·중복 번호·완료 수 불일치 preflight 거부")

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
