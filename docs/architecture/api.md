# Local REST API 설계

base URL: `http://localhost:3000/api`. 개발 중 UI는 Vite `/api` proxy를 사용한다. `/health`와 `/projects` CRUD를 구현했다. 생성·트랙·Provider endpoint는 후속 Phase의 계약이다.

## 공통 계약

- JSON 요청·응답, UTC ISO 날짜, UUID 식별자. UI에 OS 절대 경로나 키를 반환하지 않는다.
- 오류: `{ "error": { "code": "INVALID_INPUT", "message": "확인 가능한 설명" } }`.
- 목록: `{ items, nextCursor }`. 기본 limit 30, 최대 100. 일반 목록은 createdAt/id 내림차순 정렬과 같은 쌍의 cursor를 사용한다. project 목록은 updatedAt/id 내림차순 정렬과 같은 updatedAt/id cursor를 사용한다. 프로젝트 변경 후 목록을 새로 읽을 때는 기존 cursor를 버리고 첫 페이지부터 읽는다.
- 입력 길이·enum·범위·필수 필드와 알 수 없는 필드를 검증한다. JSON body 기본 상한 64 KiB.
- 400 입력 오류, 404 없음, 409 상태/동일 requestKey 입력 충돌, 429 queue full, 500 내부 오류.
- localhost/127.0.0.1의 지정 포트만 Host allowlist에 두고 UI origin만 허용한다. UI 포트는 기본 5173 또는 명시한 `UI_PORT` 하나다. mutation은 허용 Origin과 JSON/custom header를 검증해 다른 웹페이지의 단순 요청을 거부한다. wildcard CORS를 사용하지 않는다.
- loopback listen을 강제하고 0.0.0.0으로 바꾸지 않는다. 계정·로그인·JWT는 만들지 않는다.

## Endpoint

| Method | 경로 | 입력/결과 |
|---|---|---|
| GET | /health | 최소 상태, 경로·설정·키 제외 |
| GET | /providers/current | id, mock 여부, capabilities, 키 설정 여부만 |
| GET | /projects | Project summary + trackCount |
| POST | /projects | `{ name }` → 201 Project |
| GET | /projects/:id | Project summary |
| PATCH | /projects/:id | `{ name }` → 갱신 Project |
| DELETE | /projects/:id | 진행 중이면 409; 그 외 DB 삭제 후 `{ deleted: true, cleanupPending }` |
| GET | /projects/:id/generations | 최근 generation + 해당 track summary, pagination |
| POST | /projects/:id/generations | prompt, settings, variationCount, requestKey, 선택 sourceGenerationId → 202 Generation |
| GET | /generations/:id | 상태, 단계, 오류, tracks; 없는 progress는 null |
| POST | /generations/:id/cancel | 200 현재 Generation; 반복 취소는 같은 terminal 상태 반환 |
| GET | /tracks/:id | Track detail + 원본 prompt/requested settings |
| PATCH | /tracks/:id | `{ title?, favorite? }`만 허용 |
| DELETE | /tracks/:id | `{ deleted: true, cleanupPending }`, generation 이력 보존 |
| GET | /tracks | `favorite=true`, 선택 projectId, pagination; Library 데이터 |
| GET / HEAD | /tracks/:id/audio | inline 원본 stream, Range 지원 |
| GET / HEAD | /tracks/:id/download | attachment 원본 stream, 안전한 제목·확장자 |
| GET | /projects/:id/prompts | 최근 Generation의 prompt/settings/id/trackCount; 재사용은 새 생성 요청 |

Retry/Regenerate 전용 provider API를 만들지 않는다. 기존 Generation의 입력을 form에 채우고 사용자가 새 requestKey로 POST한다. sourceGenerationId가 있으면 동일 project의 기존 Generation이어야 한다. retry는 실패/cancelled 원본, regenerate는 모든 원본에서 새 작업을 만들 수 있다.

## 생성 예시

```json
{
  "prompt": "Dark atmospheric trap beat with deep bass",
  "settings": {},
  "variationCount": 2,
  "requestKey": "4d21b7a0-8f4c-4901-a1db-f67298a101bc"
}
```

prompt 외 값은 UI가 기본값을 제공한다. settings는 빈 객체, variationCount 기본 2(공급자 상한이 1이면 1)다. requestKey는 클라이언트가 제출마다 생성하고 동일 제출의 network retry 동안 유지한다. 최초 접수는 202, 중복 key/동일 내용은 기존 Generation과 현재 상태를 200으로 반환한다.

Track DTO는 id, projectId, generationId, variationIndex, title, prompt, audioUrl, downloadUrl, durationSeconds, bpm, genre, mood, seed, provider, model, favorite, createdAt이다. 내부 audioPath는 DTO에 포함하지 않는다.

## 재생/다운로드

원본 bytes와 일치하는 Content-Type, Content-Length, Accept-Ranges를 제공한다. 단일 유효 Range는 206 + Content-Range, unsatisfiable은 416, Range가 없으면 200이다. 다중 Range는 MVP에서 무시하고 full 200을 보내는 정책으로 고정한다. HEAD는 GET과 같은 metadata만 반환한다. 대용량 파일은 stream으로 처리한다.

track title은 표시용이며 CR/LF·경로 구분자 등을 제거한 안전한 attachment filename으로만 변환한다. UUID audioPath를 사용자 filename으로 덮어쓰지 않는다. 지원하지 않는 WAV/MP3 변환 요청은 추가하지 않고 원본 포맷을 내려준다.

## 설계 검증 시나리오

동일 requestKey 재전송은 한 번만 생성, 취소/완료 경쟁은 하나의 terminal 결과, 다른 project 원본 참조는 거부, 새로고침 후 상태 유지, foreign Origin mutation 거부, encoded path traversal 거부, 파일 누락·Range·삭제 중 재생 오류를 구체적으로 확인한다. 실제 테스트 코드는 관련 Phase에서 만든다.
