# plan-020-llamacpp-gemma

## Status
completed

## Owner
project_lead / plan_keeper

## User Request
2026-10-09: 사용자가 llama.cpp로 http://127.0.0.1:8089에 Gemma를 구동했다. 이전 작곡만/RAG/로컬 모델 교체 요청을 이어 실제 연결한다.

## Goal
llama.cpp adapter와 현재 모델 표시를 추가하고 기존 RAG/악보 검증/합성/JSON/MIDI 경로로 실제 Gemma 작곡을 검증한다. Soundry 실행 설정을 사용자 endpoint에 맞춰 전환한다.

## Non-Goals
모델 다운로드·서버 설정 변경·보컬/음색 모델·자동 원격 fallback·판매 품질 보장.

## Context Map
providers/cli-provider.ts, ollama-runner.ts, provider.service.ts; knowledge; generation UI; llama.cpp 공식 server README.

## Constraints
관리형 worktree/codex branch, No Exec Plan No Work. 8089는 loopback 숫자 포트만, 임의 URL/redirect/키 제외. 사용자 Gemma 프로세스는 수정/종료하지 않는다. QA→리뷰→완료→main push/정리.

## Implementation Plan
- [x] llama.cpp health/모델/구조화 JSON adapter
- [x] RAG·공급자·UI·실행 설정·설계 문서 연결
- [x] 실제 로컬 Gemma 작곡/합성/악보·참고 출처 확인
- [x] QA/별도 리뷰/완료 기록/Git lifecycle

## QA Plan
fake HTTP readiness/모델/정제 오류/redirect/출력 크기/취소/timeout/JSON schema/중단된 출력 검증. 기존 CLI/Ollama/RAG 회귀와 npm run qa, smoke. 실제 Gemma는 별도 임시 data root/자체 작성 지식/90초1곡으로 검증한다. 한 번의 성공을 상업 품질이나 RAG 개선으로 표시하지 않는다.

## Review Plan
QA 후 별도 source/입력·소유권·전송·출력/사용자 endpoint 적합성 검토.

## Decision Log
| date | decision | reason |
|---|---|---|
| 2026-10-09 | llama.cpp를 Ollama와 별도 adapter로 추가 | 사용자가 이미 구동한 로컬 서버 사용 |
| 2026-10-09 | /health·/v1/models로 하나의 로드 모델 자동 탐색, schema-constrained chat 사용 | 모델 경로/별도 설치 없이 실제 현재 모델로 작곡 |
| 2026-10-09 | thinking none, tools 미전달, 앱의 엄격한 악보 검증 유지 | Gemma 템플릿의 enable_thinking 제어 확인, JSON 외 출력 실행 방지 |

| 2026-10-09 | local 전용 schema에서 요청 metadata·5개 섹션 배치·드럼 pattern/part 역할을 제약, BPM 생략 시120 | 두 실제 응답에서 outro 누락/멜로디 패턴의 드럼 사용을 확인. 음악 음표는 모델이 새로 작곡하고 기존 검증은 유지 |

| 2026-10-09 | 2단계 로컬 작곡: 후보패턴 생성 후 실제ID를 참조해 섹션별 편곡, 앱이 반복/시점을 계산 | 단일출력에서 없는d1참조를 확인. 사용하지 않은 후보는 canonical악보에서 제외하고 기존 다양성/무음/예산 검증을 유지 |

| 2026-10-09 | llama.cpp는 variation 최대2개 | 2회추론/variation의최악240초예산과20분job상한을함께지킨다 |

| 2026-10-09 | 로컬 후보6개/1–2마디/멜로디6음표·최대4096출력토큰 | 실제추론이240초상한에닿아출력복잡도를제약. renderer의악보품질최소조건은유지 |

## Progress Log
| date | role | note |
|---|---|---|
| 2026-10-09 | 지도 | health200, Gemma4 E4B Q4계열, context32768/4slots·thinking template 확인 |

| 2026-10-09 | 검증 | 실제GemmaE2E완료, 전체QA/소스변경회귀/화면/파일/smoke PASS |
| 2026-10-09 | 심사 | QA후별도검토 PASS, completed 및리뷰mirror |

## Completion Notes
실제Gemma5번째시도에서90초/120BPM새작곡을142초에완료하고악보/RAG/WAV/JSON/MIDI를검증했다. 50files/481tests·Node18/Python23·lint/type/build/base/audio/smoke PASS. 마지막코드변경관련17tests와출처재조회5tests PASS. IAB실곡재생/정지·모델표시·2곡상한·RAG/악보·390px넘침0을확인했다. 초기4실패와청취/상업품질미검증을docs/quality/plan-020-verification.md와docs/reviews/plan-020-llamacpp-gemma.md에기록했다.

taskcommit→clean main병합/push→worktree detach·branch -d→QA프로세스종료→기존data/UI5174와llamacpp8089로primary복원→관리형archive순으로진행한다. `.env`의공급자/포트설정만갱신하고다른값은보존한다. 실제QA자료는primary data/plan020-gemma-validation에보존한다. 최종Git/실행결과는history와최종보고로확인한다.
