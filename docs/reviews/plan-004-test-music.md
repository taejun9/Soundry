# plan-004-test-music 리뷰

## 판정과 범위

2026-10-01, QA 이후 독립 리뷰 PASS. 장르 16곡과 그루비룸 참고 방향 2곡·천재노창 참고 방향 2곡을 모두 150초로 완성하고 `Downloads/Soundry_SoundCloud_2026-10-01`에 정리했다. 총 20곡·3,000초(50분)이며 기존 음원·보컬을 사용하지 않은 AI 악보와 로컬 합성 연주곡이다. 실제 SoundCloud 업로드는 수행하지 않았다.

## 실행한 QA

- 앱: plan013 실제 CLI 생성·화면 재생·원본 다운로드 검증 후 plan014 끝마디 보완. plan014 전체 41개 파일·443개 테스트 및 lint/type/build/base/audio PASS. 앱 코드 검증은 해당 계획의 근거를 따른다.
- 제작 도구: `node --test harness/music/cli_batch_runner.test.mjs` 16개, `python3 harness/music/qa_audio_tools.py` 21항목 PASS. 번들 Python/NumPy를 사용했다. batch의 멱등성·기존 작업 복구와 WAV 형식·경로·공개 정보·PCM24/원본 유지 경계를 확인했다.
- 실제 패키징: `audio_tools.py package --preserve-original-wav` exit 0. 20곡 원본과 업로드 WAV 전체 bytes를 디코딩·검사했다. 모두 stereo 44,100 Hz PCM16·150초·26,460,044 bytes, 고유 SHA256 20개, 신호 경고 0이다.
- 실제 화면: 첫 곡 저장·재생 시간·seek·pause·즐겨찾기·원본 SHA/Range206, 10번 곡 종료 탐색·재생 완료 상태, 최종 20곡/22작업 및 첫·마지막 제목, 320px 가로 넘침 없음, 마지막 곡 24.9초 재생 후 pause 확인.
- 문서: `python3 harness/scripts/verify_base.py`, whitespace 검사와 20개 곡목 정합성 PASS.

## 독립 검토

backend_bootstrap이 도구의 복구 경계와 APFS 복사를 검토했다. 공개 metadata 누출·RIFF padding·배치 재개 준비 상태의 기존 지적은 수정됐다. 안내문 참고 방향 검증은 폴더 생성 전 preflight로 옮겼으며 URL·Bearer 두 입력을 파일 검사/복사 없이 거부함을 별도로 확인했다.

최종 산출물은 backend_bootstrap이 83파일 전수 검토했다. Upload WAV 20, Provenance WAV 20·JSON 20, Metadata TXT 20·manifest JSON/CSV, 안내 1개가 정확하다. 각 곡의 앱 원본·배치 원본·보존본·업로드본 네 경로를 직접 읽어 SHA 일치, 독립 inode, nlink=1을 확인했다. 독립 NumPy 재계산도 일치했다: sample peak −1.075127~−0.915209 dBFS, full-scale frame 0, 최장 −60 dBFS 미만 구간 0.5초. 인증 문자열·원격 URL·로컬 source 경로 노출, 누락 파일, symlink가 없었다.

provider_research는 실제 악보와 manifest seed를 연결해 01–20번 모두 구조 검토 PASS로 판정했다. 장르별 리듬·편성과 각 참고 방향 두 곡의 대비를 확인했다. backend_bootstrap의 최종 README·로드맵·출시 체크리스트·제작 보고서·계획 정합성 리뷰도 PASS, 추가 P1/P2/P3 지적은 없다.

## 한계와 보존

실제 음색 청취는 수행하지 않았으며 전곡 `listeningQa.performed=false`다. 신호·악보·화면 검증은 청취 품질, 원작자 스타일 동일성, true peak·LUFS 측정을 뜻하지 않는다. CLI 첫 출력과 04번 끝마디 실패 이력은 성공으로 바꾸지 않고 로컬 checkpoint·악보로 보존했다. 진단/합성 fixture는 요청 20곡에 세지 않았다.

오디오·실제 악보·DB·checkpoint·.env는 Git에 넣지 않는다. 모델은 `codex-composer-local-synth-v1`, 추가 유료 음악 API는 사용하지 않았고 기존 CLI 계정 사용 한도가 적용된다. 모바일 BPM 간격의 추가 보완은 plan015의 별도 검증 범위다.
