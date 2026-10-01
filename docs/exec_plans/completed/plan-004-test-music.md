# plan-004-test-music

## 목표와 승인

2026-09-30 사용자는 앱의 모든 장르에 대한 콘셉트 음원과 그루비룸 참고 2곡, 천재노창 참고 2곡을 각 90–180초로 만들어 Downloads에 SoundCloud 업로드용으로 정리하도록 요청했다. 2026-10-01 추가 요청에 따라 유료 공급자 방식은 폐기하고 Codex CLI 작곡·로컬 WAV 합성으로 진행한다.

목표는 장르 16곡과 참고 방향 4곡, 총 20곡이다. 곡마다 독립적인 제목·콘셉트를 갖고 목표 길이는 모두 150초다. 실제 파일 QA와 최종 산출물 리뷰·전달까지 완료해야 이 계획을 닫는다.

## 범위와 소유

이 계획은 관리형 music worktree의 `harness/music/`, 제작 보고서, Downloads 전용 패키지를 다룬다. 앱 구현은 plan013·plan014에서 분리해 검증했다. 지휘가 실제 생성·최종 현황·통합을 담당하고, 제작 및 문서 담당자는 위임받은 파일만 수정한다.

최종 전달 후 루트 README, `docs/quality/release-checklist.md`, `docs/product/implementation-roadmap.md`의 제작 현황 갱신도 이 계획의 범위에 포함한다. 실제 음악·악보·checkpoint는 Git에서 제외된 `data/`에 보관하며, 임시 검증 파일은 OS temp에 둔다. 음원 담당자는 commit·merge하지 않는다.

## 제작 사양과 경계

- 장르 16종은 Hip-hop, Trap, R&B / Soul, Pop, Rock, Funk, Jazz, House, Techno, Drum & Bass, Ambient, Cinematic, Acoustic / Folk, Classical, Latin, Reggae / Dub이다. 이는 앱의 장르 프리셋 전체를 뜻한다.
- 그루비룸 참고 2곡과 천재노창 참고 2곡은 음악적 속성으로 풀어 독립적인 멜로디와 편곡을 지시한다. 전곡 instrumental이며 기존 음원 샘플링·보컬 복제는 하지 않는다.
- 공급자는 `cli`, 기록할 모델 식별자는 `codex-composer-local-synth-v1`이다. Codex CLI가 JSON 악보를 쓰고 로컬 악기가 WAV를 합성한다. 기존 ChatGPT 로그인과 사용 한도가 적용된다. 추가 음악 API 키·유료 fallback은 사용하지 않는다.
- 제출 전에 requestKey를 저장하고 동일 키·Generation ID로 접수 확인과 다운로드를 재개한다. 실패·한도·불확실한 응답을 자동으로 새 작업으로 바꾸지 않는다. 품질 개선도 실제 문제가 확인된 곡에 대한 명시적 작업으로만 수행한다.
- 실제 길이 90–180초, stereo WAV, 최소 44.1 kHz·16 bit를 요구한다. 원본과 SHA256을 보존하고 목표 BPM과 측정값을 구분한다.
- 실제로 확인한 청취만 기록한다. 신호 검사나 플레이어 시간 증가를 음악적 품질 청취로 표현하지 않는다. 현재 `listeningQa.performed=false`다.

## Decision Log

모든 결정은 2026-10-01에 기록했다.

1. 앱 worktree가 사용 중이어서 main `10f2789` 기반의 별도 관리형 worktree를 만들었다. CLI 전환 때 main `969446b`를 반영하며 기존 계획·도구를 보존했다.
2. 최초 Fal 제출은 HTTP 403 `balance_exhausted`로 거절됐고 request ID나 음원이 생기지 않았다. 이후 사용자의 유료 제외 요청에 따라 이 방식을 폐기했다. 당시 가격·schema 조사는 과거 검토 근거이며 재제출 조건으로 사용하지 않는다.
3. 기존 20곡의 콘셉트와 제목을 유지하고 입력을 앱의 `prompt/settings/variationCount`로 바꿨다. 공개 출처는 실제 CLI 공급자·렌더러 모델·요청 ID로 기록하며 Fal endpoint를 사용하지 않는다.
4. 공개 metadata 누출(P2)과 RIFF padding 누락(P3)을 수정했다. 공개 필드는 허용 목록으로 선택하고 URL·인증 정보 패턴, 홀수 chunk padding과 마지막 경계를 검사한다.
5. 배치 재개의 두 P2를 수정했다. 기존 Generation ID는 현재 로그인·공급자 준비 상태와 무관하게 조회할 수 있다. ID 없는 기존 키는 현재 CLI 공급자·모델 일치를 확인하고, 새 요청만 준비 상태 전체를 요구한다. Mock 전환 중 미접수 키가 새 Mock 작업을 만드는 경우를 차단한다.
6. 당시 디스크 여유 약 1.4 GiB로 20곡 원본 복제와 PCM24 확장을 모두 감당할 수 없었다. 이번 전달은 `--preserve-original-wav`를 선택한다. 경고 없는 PCM16/24/32, 최소 사양, sample peak −0.5 dBFS 이하를 확인한 뒤 추가 gain·fade·dither 없이 복사한다. 기본 PCM24 export 기능은 유지한다.
7. macOS 원본 유지 복사는 APFS `clonefile` copy-on-write를 사용한다. SHA가 같고 inode가 다른 `nlink=1` 파일을 만들며, 복제 실패 시 전체 복사로 전환하지 않는다. hardlink·사용자 파일 삭제·손실 압축은 사용하지 않는다. 앱 원본과 다운로드본의 바이트·SHA 일치를 확인한 상태 사본에도 이 방식을 적용해 공간을 절약한다.
8. 실제 04번 Pop 악보는 마지막 반주가 요청 끝을 2마디 넘어가 검증에 실패했다. plan014에서 요청 종료 전에 시작한 마지막 반복만 허용하고 정확한 요청 길이에서 마감하도록 보완했다. 범위를 벗어난 추가 반복과 기존 연산·구조 제한은 유지한다. main `735e273`에 반영했으며 실패 작업·checkpoint·원본 악보는 보존한다. 진단 WAV는 요청된 20곡에 중복 집계하지 않는다.
9. 최종 수치 갱신 범위에 루트 README, release checklist와 함께 `docs/product/implementation-roadmap.md`를 포함한다. 최종 제작·전달이 완료되면 지휘가 세 문서의 남은 제작 상태를 완료 기록과 연결한다. 기존 앱 기능 검증 기록은 유지한다.
10. 패키지 안내문에 20곡의 번호·제목·장르·콘셉트와 선택적인 참고 방향, 같은 번호의 WAV·Metadata 사용법을 추가한다. AI 악보 작곡·로컬 합성 연주곡임과 실제 미청취 곡을 명시하며, 기존 공개 필드 정책·음원 검사·복사·export 동작은 유지한다. 최종 실제 패키징과 독립 산출물 리뷰에서 목록을 확인한다.

11. 안내문 참고 방향의 `referenceDirection` 검사가 패키지 생성 뒤에 실행되는 P3를 수정해 preflight로 옮겼다. URL·Bearer 문자열의 두 거부 경계를 독립 검증했으며 출력 폴더나 음원 복사 전에 중단함을 확인했다.

## 실제 제작 및 패키지 결과

**2026-10-01 15:24:43 KST 기준** primary checkout의 `data/music/checkpoint.json`, `completed-manifest.json`, `signal-qa.json`과 Downloads 패키지의 실제 파일·manifest·provenance·안내문을 확인했다.

| 항목 | 확인 결과 |
| --- | --- |
| 완료 및 원본 다운로드 | 01–20번, 20곡 |
| 신호 QA | 20곡 PASS, manifest SHA 일치·경고 0 |
| 길이 | 전곡 150초, 총 3,000초(50분) |
| 중복 확인 | 서로 다른 SHA256 20개 |
| 악보 구조 검토 | 01–20번 독립 검토 PASS |
| 실제 청취 | 전곡 `performed=false` |
| 패키징 | exit 0, Downloads 폴더 생성 완료 |
| 독립 최종 산출물 리뷰 | PASS — 83개 파일 전수 검토 |

패키지는 `Downloads/Soundry_SoundCloud_2026-10-01`에 있다. `Upload_WAV` 20개, `Provenance` 원본 WAV 20개와 JSON 20개, `Metadata` 설명 TXT 20개와 manifest JSON·CSV, `읽어 주세요.txt`를 확인했다. 미완료 표시는 없다. 안내문에는 20곡 목록, 17–18번 그루비룸 참고 방향, 19–20번 천재노창 참고 방향과 미청취 범위를 명시했다.

원본과 업로드본은 PCM16·stereo·44.1 kHz이며 추가 변환 없이 보존했다. sample peak는 −1.075127 ~ −0.915209 dBFS, full-scale frame 0, 최장 저레벨 구간 0.5초다. 실제 청취와 최종 산출물 리뷰 승인은 이 신호 검사 결과와 구분한다.

## 완료된 QA와 실패 이력

- plan013 CLI 앱은 main `8f60dbd`에 반영됐다. 첫 대표곡 `Raincheck Avenue`의 실제 150초 WAV 저장·원본 SHA·Range 206·화면 재생 시간 증가·seek·pause·즐겨찾기를 확인했다.
- 추가 IAB 화면 QA에서 10번 `Night Bus Aurora`의 150초(2:30) 표시, 재생 위치 slider의 End 키 탐색, 종료 후 `재생 완료` 상태와 `현재 음원 재생` 버튼 복귀를 확인했다. 실제 청취 검증은 아니다.
- 최종 IAB 화면에서 20곡·22작업과 첫·마지막 제목을 확인했다. 320px 화면의 scrollWidth가 320px로 가로 넘침이 없었으며, 마지막 곡 `Paper Moon Static` 재생 후 24.9초 일시정지를 확인했다. 실제 청취 검증은 아니다.
- CLI 첫 요청은 `CLI_INVALID_OUTPUT`로 실패했다. `attempt-01-failed.json`에 실패 checkpoint를 보존했고, 명시적 새 요청으로 완성했다. 실패를 성공으로 고치지 않았다.
- 04번 끝마디 실패는 `attempt-04-before-endings-fix.json`과 원본 악보로 보존했다. plan014 수정 후 명시적 새 04번 요청의 생성·저장·다운로드를 확인했다.
- plan014 전체 앱 QA는 41개 파일·443개 테스트, lint·typecheck·build·base·audio PASS다. 독립 리뷰와 관련 경계 11개 테스트도 PASS이며 추가 P1/P2는 없었다.
- 음악 도구의 현재 QA는 Node 16개 회귀와 Python 21항목 PASS다. 배치 멱등성·복구, WAV 형식·개인정보·기본 PCM24와 원본 유지 패키징을 검증했다. 이전 도구 검증은 이 결과에 포함되므로 별도 완료 수로 합산하지 않는다.
- 도구 독립 리뷰 PASS다. PCM16/24/32의 실제 APFS 복사, 동일 SHA·독립 inode, 복사본 수정 후 원본 불변, 품질 거부와 복제 실패 경계를 별도로 확인했다. 이 도구 검증의 합성 fixture는 실제 요청곡이 아니다.

- provider_research가 실제 01–20번 악보의 구조를 독립 검토해 모두 PASS로 보고했다. 코드상 구조·구성 검토이며 청취 평가를 대신하지 않는다.
- 안내문 참고 방향 검증의 preflight 이동(P3) 후 URL·Bearer 거부 2개 경계가 독립 PASS다. 실제 패키징도 exit 0으로 완료했다.
- backend_bootstrap의 독립 최종 산출물 리뷰 PASS다. 83개 파일 전수, 20×150초, 앱 저장본·배치 다운로드본·패키지 원본·업로드본 네 경로의 SHA 일치와 독립 inode·nlink=1을 확인했다. 전곡 신호를 독립 NumPy 계산으로 재검증했고 공개 정보 누출 없음, 17–20번 참고 방향, 미청취 표시와 무변환 기록을 확인했다.

## 완료 판정

- [x] 20곡의 실제 생성·원본 다운로드를 완료하고 실패 이력을 보존한다.
- [x] 전곡 WAV·SHA·길이·형식·peak·무음 신호 QA 및 악보 구조 검토를 완료한다. 청취 미수행은 구분해 기록한다.
- [x] 새 `Downloads/Soundry_SoundCloud_2026-10-01` 폴더에 업로드 WAV·보존 원본·Metadata·Provenance·안내문을 생성한다. 기존 파일은 덮어쓰지 않는다.
- [x] 안내문에 곡별 번호·제목·장르·콘셉트·참고 방향과 같은 번호의 파일 사용법을 표시한다.
- [x] 최종 패키지의 독립 산출물 리뷰를 마치고 공개 metadata·SHA·독립 파일·곡 목록·청취 한계의 최종 승인을 기록한다.
- [x] 문서 base·diff·곡목 정합성 QA와 독립 최종 문서 리뷰를 통과했다. README·release checklist·roadmap의 20곡·50분·83파일·검증 범위가 일치한다.
- [x] QA 이후 독립 산출물·문서 리뷰 PASS에 따라 계획을 completed로 이동하고 동일 basename의 리뷰를 기록한다.

음원 제작·Downloads 패키징·독립 최종 산출물 및 문서 리뷰를 완료했다. SoundCloud에 직접 업로드하지 않았다. 이 완료 기록을 포함해 commit → clean main 병합·push → 병합 브랜치 삭제 → 사용이 끝난 관리형 worktree archive 순서로 통합한다. 모바일 BPM 간격의 추가 표시 보완은 별도 plan015에서 검증한다.
