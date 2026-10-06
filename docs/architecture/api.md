# Local REST API 설계

base URL: `http://localhost:3000/api`. 개발 중 UI는 Vite `/api` proxy를 사용한다. `/health`, `/projects` CRUD, `/providers/current`, 생성 작업 접수·목록·상세·취소를 구현했다. 트랙 원본 재생/다운로드, 상세 조회·이름/즐겨찾기 수정·삭제와 프롬프트 이력을 구현했다. 전역 보관함 목록도 구현했다.

## 공통 계약

- JSON 요청·응답, UTC ISO 날짜, UUID 식별자. UI에 OS 절대 경로나 키를 반환하지 않는다.
- 오류: `{ "error": { "code": "INVALID_INPUT", "message": "확인 가능한 설명" } }`.
- 목록: `{ items, nextCursor }`. 기본 limit 30, 최대 100. 일반 목록은 createdAt/id 내림차순 정렬과 같은 쌍의 cursor를 사용한다. project 목록은 updatedAt/id 내림차순 정렬과 같은 updatedAt/id cursor를 사용한다. 프로젝트 변경 후 목록을 새로 읽을 때는 기존 cursor를 버리고 첫 페이지부터 읽는다.
- 입력 길이·enum·범위·필수 필드와 알 수 없는 필드를 검증한다. JSON body 기본 상한 64 KiB.
- 400 입력 오류, 404 없음, 409 상태/동일 requestKey 입력 충돌, 429 queue full, 500 내부 오류.
- localhost/127.0.0.1의 지정 포트만 Host allowlist에 두고 UI origin만 허용한다. UI 포트는 기본 5173 또는 명시한 `UI_PORT` 하나다. mutation은 허용 Origin과 JSON/custom header를 검증해 다른 웹페이지의 단순 요청을 거부한다. wildcard CORS를 사용하지 않는다.
- loopback listen을 강제하고 0.0.0.0으로 바꾸지 않는다. 로컬 회원·opaque 서버 세션을 사용하며 JWT·외부 인증 서버는 사용하지 않는다.

## Endpoint

| Method | 경로 | 입력/결과 |
|---|---|---|
| GET | /health | 최소 상태, 경로·설정·키 제외 |
| GET | /providers/current | id, model, isMock, configured, generationEnabled, capabilities, notice; 키·내부 경로 제외 |
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
| GET | /tracks | 선택 favorite=true/false, projectId, pagination; TrackSummary + projectName |
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

## 음원 관리와 프롬프트 재사용

TrackDetail은 TrackSummary에 원본 `requestedSettings`와 `requestedVariationCount`를 추가한다. 이름 변경은 trim 후 1–120자이며 NUL을 거부한다. favorite은 boolean만 허용한다. 빈 PATCH와 알 수 없는 필드는 거부한다. 수정과 삭제는 소속 project.updatedAt도 같은 DB transaction에서 갱신한다.

음원 삭제는 Track만 제거하고 Generation의 입력과 상태를 보존한다. DB commit 후 해당 UUID 음원 파일을 정리하며 실패 시 cleanupPending을 반환한다. 모든 음원을 삭제한 completed Generation도 정상 이력이다. 제목 변경은 원본 경로와 bytes를 변경하지 않는다.

프롬프트 목록은 별도 저장본 없이 Generation에서 prompt/settings/variationCount/status/trackCount/createdAt/generationId를 조회한다. 완료·실패·취소와 결과 없는 이력도 포함하며 createdAt/id cursor를 사용한다. 작성칸 재사용은 원본을 수정하거나 자동 생성하지 않는다. 초안 덮어쓰기를 확인한 후 현재 공급자의 설정 범위로 가져오고, 사용자가 생성 버튼을 눌러야 새로운 requestKey/sourceGenerationId로 접수한다.

## 보관함 목록

GET /tracks는 favorite 생략 시 전체, true/false 지정 시 해당 상태를 필터링한다. projectId는 UUID 필터이며 올바른 형식의 없는 프로젝트는 200 빈 목록을 반환한다. 두 필터는 cursor/limit 전에 적용한다. cursor는 track.createdAt/id 기준이며 기준 음원이 삭제되어도 다음 페이지를 조회할 수 있다. 수정일이나 제목 변경으로 정렬하지 않는다.

LibraryTrackSummary는 기존 공개 TrackSummary에 projectName만 추가한다. 요청한 BPM/seed 등을 실제 음원 metadata로 채우지 않는다. 알 수 없는/중복 query와 잘못된 cursor는 400이다. UI는 즐겨찾기만 표시하고 route 진입 또는 수동 새로고침 때 서버를 기준으로 읽는다.

## 재생/다운로드

원본 bytes와 일치하는 Content-Type, Content-Length, Accept-Ranges를 제공한다. 단일 유효 Range는 206 + Content-Range, unsatisfiable은 416, Range가 없으면 200이다. 다중 Range는 MVP에서 무시하고 full 200을 보내는 정책으로 고정한다. HEAD는 Range를 무시하고 full GET의 metadata와 빈 body를 반환한다. malformed Range는 full 200으로 처리하며 validator를 제공하지 않는 현재 구현은 If-Range가 있으면 full 200을 반환한다. 대용량 파일은 stream으로 처리한다.

track title은 표시용이며 CR/LF·경로 구분자 등을 제거한 안전한 attachment filename으로만 변환한다. UUID audioPath를 사용자 filename으로 덮어쓰지 않는다. 지원하지 않는 WAV/MP3 변환 요청은 추가하지 않고 원본 포맷을 내려준다.

## 설계 검증 시나리오

동일 requestKey 재전송은 한 번만 생성, 취소/완료 경쟁은 하나의 terminal 결과, 다른 project 원본 참조는 거부, 새로고침 후 상태 유지, foreign Origin mutation 거부, encoded path traversal 거부, 파일 누락·Range·삭제 중 재생 오류를 구체적으로 확인한다. 실제 테스트 코드는 관련 Phase에서 만든다.

## 회원·상품·편집 API — plan-017

- GET `/members/plans`: Free/Plus/Pro/관리자 정책. 결제·가격 없음.
- GET `/members/session`: `{member, setupRequired, usage}`. 로그인 전 member/usage=null.
- POST `/members/register`: `{name,email,password}`. 최초만 관리자·기존 프로젝트 인계, 이후 Free. role/tier 입력 거부.
- POST `/members/login`: `{email,password}`. HttpOnly 세션 쿠키 발급.
- POST `/members/logout`: 세션 폐기·쿠키 삭제.
- GET `/members`, PATCH `/members/:id` `{tier}`: 관리자 회원 목록·수동 등급 지정. 마지막 관리자 해제는 409.
- GET/PUT `/projects/:id/arrangement`: `{duration,lanes:[{id,name,muted,clips:[{id,trackId,label,start,offset,duration,volume,loop}]}]}`.

회원 설정 후 프로젝트·생성·프롬프트·Track/audio/download·편집은 서버 세션과 소유권을 확인한다. 목록은 pagination 전에 소유자 필터를 적용한다. 401 LOGIN_REQUIRED/INVALID_CREDENTIALS, 403 ADMIN_REQUIRED, 429 USAGE_LIMIT/AUTH_RATE_LIMIT을 공개 오류로 제공한다. PUT도 기존 Origin/JSON 제한을 따른다. 회원 설정 전은 기존 로컬 API 호환 모드다.
