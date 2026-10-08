# plan-019-composition-memory

## Status
completed

## Owner
project_lead / plan_keeper

## User Request
2026-10-09: Suno처럼 작동하는 스튜디오, 추후 Gemma 로컬 LLM 교체, 작곡 방식 RAG 축적과 판매 가능한 품질의 가능성 검토 및 가능한 구현 진행.

## Goal
현재 CLI 악보 작곡을 유지하면서 교체 가능한 로컬 Ollama/Gemma runner와 회원별 작곡 지식·청취 피드백 RAG를 실제 생성에 연결한다. 저장·검색·출처 표시·삭제와 전송 동의를 제공하고 상업 품질 미검증을 명확히 한다. 사용자 후속 요청에 따라 보컬·음색 생성 단계는 제외하고 작곡 품질 청취 gate를 공식 근거로 기록한다.

## Non-Goals
Suno 동급 품질 또는 수익·권리 보장, 자동 가중치 학습, 임의 웹/개인 파일 수집, 자동 모델 다운로드, 자동 원격 음악 API 요청. 현재 자체 합성기는 instrumental만 지원한다.

## Context Map
- providers/cli-provider.ts, cli-runner.ts, composition/: 작곡과 로컬 합성
- database/, members/, generations/: 소유권과 요청 snapshot
- frontend generation/tracks: 지식과 평가 입력
- Google Gemma, Ollama structured output, ACE-Step 공식 저장소, RAG 원논문

## Constraints
No Exec Plan, No Work. 관리형 worktree 및 codex/plan-019-composition-memory. 데이터 Git 제외, 회원별 격리, 제한된 loopback 모델 endpoint, QA 후 리뷰 및 승인된 Git lifecycle.

## Implementation Plan
- [x] 가능성·작곡 품질 격차·평가 gate 문서
- [x] 검증된 악보 저장/JSON·표준 MIDI 내보내기·피드백 구조 요약 활용
- [x] 로컬 runner, 엄격한 출력 검증·취소·준비 상태
- [x] SQLite 작곡 지식·피드백, bounded retrieval 및 원격 전송 opt-in
- [x] 생성 시 회원 범위 검색·컨텍스트 snapshot 및 provenance
- [x] UI 지식 관리·청취 평가·RAG 상태
- [x] QA → 리뷰 → 완료 기록 → main 병합/push → branch/worktree 정리

## QA Plan
회원 간 접근/검색 격리, 잘못된 입력·취소·endpoint/redirect·응답 크기 경계, 검색 관련성·저품질 제외·동의·삭제, 기존 생성/idempotency 회귀. npm run qa 및 qa:smoke. 모델 미설치 시 실제 Gemma 추론은 미수행으로 기록한다.

## Review Plan
QA 완료 후 구현 diff와 소유권·외부 전송·품질 주장·계약 정합성을 별도 검토한다.

## Decision Log
| date | decision | reason |
|---|---|---|
| 2026-10-09 | DAW에서 편곡할 수 있는 MIDI와 악보 JSON을 함께 제공 | 작곡만 하는 범위의 실용적인 결과물 |
| 2026-10-09 | 후속 요청으로 작곡까지만 구현, 보컬·음색 모델 단계 제외 | 기존 합성은 청취 검증 수단으로 유지 |
| 2026-10-09 | LLM/지식/오디오 엔진 분리, 현재 합성기 위에 RAG·로컬 runner 구현 | RAG는 추론 컨텍스트 축적이며 고품질 오디오 모델을 대체하지 않는다 |
| 2026-10-09 | SQLite 기반 lexical RAG를 초기 구현하고 embedding backend는 확장점으로 기록 | 별도 모델 설치·벡터 서비스 없이 한국어/영문 지식의 검증 가능한 로컬 검색 제공 |
| 2026-10-09 | 지식의 원격 전달은 항목별 명시 동의가 있는 경우만 | 기존 CLI 생성 승인으로 개인 지식 전체 전송을 확대하지 않는다 |

## Progress Log
| date | role | note |
|---|---|---|
| 2026-10-09 | 설계 | clean main 확인, 관리형 worktree와 계획 생성 |

| 2026-10-09 | 검증 | 전체QA·화면·MIDI실파일·smoke PASS, 실제모델/품질미검증구분 |
| 2026-10-09 | 심사 | QA 이후 별도 검토 PASS, completed 이동 및 리뷰 mirror |

## Completion Notes
작곡만 하는 사용자 범위 확정, local runner·회원별 lexical RAG/평가·참고digest·검증 악보JSON/MIDI 구현 완료. QA48files/474tests, Node18/Python23, lint/type/build/base/audio/smoke PASS. 리뷰의입력타입보완 후 관련16tests·lint/type/build PASS. IAB지식저장/접수/90초실제합성저장/평가/참고/새로고침복원/390px넘침0/MIDI디스크파일검사완료. 실제Gemma추론·RAG전후음악품질·판매품질·DAW import와JSON Blob디스크저장은미검증이다. docs/quality/plan-019-verification.md와docs/reviews/plan-019-composition-memory.md를따른다.

기록포함taskcommit → clean main병합/push → worktree detach·git branch -d → QA프로세스종료·primary backend기존data복원 → 관리형archive순으로진행한다. 최종Git결과와복원상태는commit/history·최종보고로확인한다.
