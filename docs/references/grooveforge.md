# GrooveForge 참고 조사

확인일: 2026-09-30. 참고 저장소: [taejun9/GrooveForge](https://github.com/taejun9/GrooveForge).

웹 접근은 cache miss였으나 로컬의 동일 origin checkout을 읽어 확인했다. 기준 commit은 `5b75457f87a7100ae126ba49bc9b8d12318e5a45`이며 working tree는 clean이었다. 원격 최신 HEAD와 일치 여부는 확인하지 않았다. 소스 조사이며 실행 성공·오디오 품질 검증은 아니다.

| 근거 경로 | 확인 내용 | Soundry에 적용할 판단 |
|---|---|---|
| README.md, package.json | React/Vite/Electron 기반 편집 가능한 mini DAW | Vue/NestJS 독립 앱으로 만들고 기존 shell 이식 제외 |
| src/domain/workstation.ts | 부작용 없는 음악 도메인, 규칙 기반 생성/편집, 프로젝트 serialization | UI·도메인·I/O의 책임 분리만 참고 |
| src/audio/scheduler.ts, src/audio/render.ts | 실시간 Web Audio 합성, 결정적 PCM 렌더 | HTMLAudio 결과 재생을 우선; 합성 엔진 이식 제외 |
| electron/projectWorkspace.ts | 배타적 임시 파일 작성·fsync·rename | temp 저장 후 원자적 rename 원칙 참고 |
| electron/projectLibrary.ts | parameterized SQL, schema version | migration과 SQL binding 원칙 참고 |
| electron/preload.cts, electron/main.ts | 권한 있는 기능 경계와 호출자 확인 | backend가 파일·키를 소유하도록 구성; IPC 이식 제외 |
| harness/scripts/run_sample_audio_qa.mjs | WAV 독립 디코딩·길이·무음·해시 검증 | fixture/원본 파일 실체를 검증; 모든 AI 출력의 결정성 강제 제외 |

검사한 manifest/src/electron 범위에서 원격 음악 AI provider SDK 구현은 확인하지 못했다. 기존 규칙 기반 생성을 원격 AI 작곡으로 설명하지 않는다. Soundry의 provider/job/storage 계약은 새로 작성한다.

GrooveForge의 코드, DB, 프로젝트 파일 형식, 홈 저장 경로, migration, Electron updater/signing을 공유하지 않는다. 이번 작업은 GrooveForge 파일을 수정하지 않았다.
