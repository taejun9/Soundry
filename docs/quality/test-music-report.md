# 테스트 음원 제작 결과와 QA

## 결과와 전달 위치

**2026-10-01 15:24:43 KST 기준, 요청한 20곡의 생성·원본 다운로드와 Downloads 패키징을 완료했다. 전곡 150초(2분 30초), 총 3,000초(50분)다.** 이후 독립 최종 산출물·문서 리뷰와 문서 QA도 PASS했다.

전달 위치는 `Downloads/Soundry_SoundCloud_2026-10-01`이다. primary checkout의 `data/music/checkpoint.json`, `completed-manifest.json`, `signal-qa.json`과 패키지의 실제 파일·manifest·provenance·안내문을 확인했다. 패키징은 exit 0으로 끝났으며 미완료 표시는 없다.

| 항목 | 확인 결과 |
| --- | --- |
| 목표와 완료 | 16개 장르 각 1곡 + 그루비룸 참고 2곡 + 천재노창 참고 2곡 = 20곡 |
| 생성·다운로드 | 01–20번 모두 `completed` |
| 신호 QA | 20곡 PASS, manifest SHA 일치·경고 0 |
| 중복 오디오 | 서로 다른 SHA256 20개 |
| 악보 구조 검토 | 01–20번 독립 검토 PASS |
| 실제 청취 | 20곡 모두 `listeningQa.performed=false` |
| Downloads 패키지 | 생성 완료, 아래 파일 구성 확인 |
| 독립 최종 산출물 리뷰 | PASS — 83개 파일 전수 검토 |

## 완성곡 목록

모든 곡은 보컬이 없는 instrumental이며 길이는 150초다. **17–18번은 그루비룸 참고 방향, 19–20번은 천재노창 참고 방향**으로 만든 독립 콘셉트 곡이다. `Upload_WAV`에서 같은 번호의 WAV를 선택하고, `Metadata`의 같은 번호·제목 TXT에서 설명과 태그를 사용한다.

| 번호 | 제목 | 장르 | 콘셉트 |
| --- | --- | --- | --- |
| 01 | Raincheck Avenue | Hip-hop | 비 갠 골목 |
| 02 | Chrome Skyline | Trap | 밤의 고층도로 |
| 03 | Velvet Balcony | R&B / Soul | 늦은 밤 발코니 |
| 04 | Weekend Postcard | Pop | 바다 여행 출발 |
| 05 | Last Train Sparks | Rock | 막차를 향한 질주 |
| 06 | Orange Roller | Funk | 롤러스케이트장 |
| 07 | Blue Hour Table | Jazz | 문 닫기 전 재즈바 |
| 08 | Rooftop First Light | House | 옥상에서 맞는 일출 |
| 09 | Concrete Pulse | Techno | 지하 공간의 맥박 |
| 10 | Night Bus Aurora | Drum & Bass | 야간버스 창밖의 빛 |
| 11 | Tide Memory | Ambient | 조수와 기억 |
| 12 | Beyond the Ridge | Cinematic | 능선 너머의 발견 |
| 13 | Window Garden | Acoustic / Folk | 아침 창가의 정원 |
| 14 | Paper Constellations | Classical | 종이별을 잇는 밤 |
| 15 | Mercado Sunset | Latin | 저녁 시장 |
| 16 | Saltwater Echo | Reggae / Dub | 해안의 산책 |
| 17 | Midnight Switch | Trap / R&B | 자정의 분위기 전환 |
| 18 | Glass Lobby | Hip-hop / R&B | 유리 로비의 잔향 |
| 19 | Broken Neon Diary | Experimental Hip-hop | 깨진 네온의 일기 |
| 20 | Paper Moon Static | Psychedelic Electronic Hip-hop | 종이달과 정전기 |

곡별 프롬프트·요청 설정은 [track-plan.json](../../harness/music/track-plan.json)에 있다. 목표 BPM은 요청값이며 실측 BPM으로 표시하지 않는다.

## 패키지 구성과 원본 보존

| 위치 | 파일 수와 용도 |
| --- | --- |
| `Upload_WAV/` | 업로드할 WAV 20개 |
| `Provenance/` | 보존 원본 WAV 20개, 생성·검사·변환 기록 JSON 20개 |
| `Metadata/` | 복사용 제목·설명·태그 TXT 20개, 전체 manifest JSON 1개·CSV 1개 |
| `읽어 주세요.txt` | 20곡 목록, 참고 방향, 파일 사용법과 청취 범위 |

기존 파일을 덮어쓰지 않고 새 패키지를 만들었다. 디스크 여유가 약 1.4 GiB였을 때 중복 복사와 PCM24 확장을 함께 감당할 수 없음을 확인해, 이번에는 `--preserve-original-wav`를 선택했다. 기본 PCM24 export 기능은 별도로 유지한다.

전곡은 공통 WAV 사양·경고 없음·sample peak −0.5 dBFS 이하를 통과했다. macOS APFS `clonefile` copy-on-write로 원본과 SHA가 같고 inode가 다른 `nlink=1` 파일을 만들며, 복제 실패 시 일반 전체 복사로 전환하지 않는다. 패키지 provenance 20개 모두 원본·업로드 SHA 일치, `preservedOriginalWav=true`, `bytesChanged=false`, APFS 복사 방식을 기록한다. 추가 gain·fade·dither는 적용하지 않았다.

## 제작 방식

사용자의 2026-10-01 요청에 따라 유료 Fal 방식은 폐기했다. 공급자는 `cli`, 모델 식별자는 `codex-composer-local-synth-v1`이다. 기존 ChatGPT 로그인 Codex CLI가 JSON 악보를 만들고 Soundry의 자체 로컬 악기가 WAV를 합성했다. 기존 계정 사용 한도가 적용되며 추가 음악 API 키·유료 fallback은 없다. 오디오는 외부 음악 모델에 업로드하지 않았다.

각 곡의 독립적인 콘셉트에 따라 기존 음원 샘플·가사·보컬 복제 없이 instrumental을 지시했다. 제출 전 requestKey를 저장하고 같은 키·Generation ID로 접수 확인·조회·다운로드를 재개했다. 실패나 응답 유실을 자동 새 작업으로 바꾸지 않았다. 실행과 복구 방법은 [음악 도구 README](../../harness/music/README.md)에 있다.

## 실제 파일·악보·화면 QA

`signal-qa.json`과 완료 manifest에 기록된 20곡의 실측은 다음과 같다.

| 검사 | 결과 |
| --- | --- |
| 길이 | 모두 150.0초, 합계 3,000초 |
| 형식 | stereo, 44,100 Hz, PCM16 |
| 원본 크기 | 곡당 26,460,044 bytes |
| sample peak | −1.075127 ~ −0.915209 dBFS |
| full-scale sample frame | 0 |
| 가장 긴 −60 dBFS 미만 저레벨 구간 | 최대 0.5초 |
| 신호 경고 | 전곡 0 |
| 원본 식별 | manifest와 신호 QA의 SHA256 일치, 서로 다른 SHA 20개 |

provider_research가 실제 01–20번 악보 구조를 독립 검토해 모두 PASS로 보고했다. 이는 악보의 구조·구성 검토이며 오디오 청취 평가와 구분한다.

실제 IAB 화면에서는 다음을 확인했다.

- 첫 대표곡 `Raincheck Avenue`: 앱 저장·다운로드 SHA·Range 206, 재생 시간 증가·seek·pause·즐겨찾기 PASS.
- 10번 `Night Bus Aurora`: 150초(2:30) 표시, slider End 키로 종료 위치 이동, `재생 완료` 상태와 `현재 음원 재생` 버튼 복귀 PASS.
- 최종 프로젝트: 20곡·22작업 및 첫·마지막 곡 제목 확인. 두 실패 작업은 이력으로 남고 완성곡 수에 포함되지 않는다.
- 320px 화면: scrollWidth 320px로 가로 넘침 없음. 마지막 곡 `Paper Moon Static` 재생 후 24.9초 일시정지 PASS.

**실제 음색 청취는 수행하지 않았다.** 전곡 `performed=false`를 유지하며 안내문에도 01–20번 미청취를 명시했다. 신호 검사·악보 검토·플레이어 동작만으로 장르 적합성이나 편곡 완성도를 보장하지 않으며 true peak·LUFS 검사도 포함하지 않는다. 진단 WAV나 도구 검사용 sine fixture는 요청된 20곡에 세지 않는다.

## 실패 이력과 수정

| 이력 | 처리와 보존 |
| --- | --- |
| 최초 Fal 제출 | HTTP 403 `balance_exhausted`, request ID·생성 오디오 없음. 이후 유료 방식을 폐기했으며 재호출하지 않았다. |
| CLI 01번 첫 요청 | `CLI_INVALID_OUTPUT`로 실패. `data/music/attempt-01-failed.json`에 기존 checkpoint를 보존하고 명시적 새 요청으로 완성했다. |
| CLI 04번 Pop 첫 요청 | 마지막 반주가 요청 끝을 2마디 넘어가 악보 검증 실패. `attempt-04-before-endings-fix.json`과 원본 악보를 보존하고 plan014에서 끝마디 처리를 수정했다. |

plan014는 요청 종료 전에 시작한 마지막 패턴을 정확한 요청 길이에서 마감하도록 허용한다. 완전히 끝 이후에 시작하는 추가 반복은 계속 거부하며 구조·연산량·길이 제한을 유지했다. renderer를 바꾸지 않고 실패 악보의 parse와 150초 진단 렌더를 확인한 뒤, 새 04번 CLI 앱 요청으로 저장·다운로드까지 완료했다. 실패를 성공으로 고치거나 진단 결과를 완료곡에 중복 집계하지 않았다.

수정은 main `735e273`에 반영됐다. 검증 근거는 해당 main의 `docs/exec_plans/completed/plan-014-score-endings.md`와 같은 이름의 리뷰 기록이다.

## 도구·앱 QA와 리뷰

| 범위 | 결과 |
| --- | --- |
| 앱 plan014 | 41개 파일·443개 테스트, lint·typecheck·build·base·audio PASS |
| 앱 독립 리뷰 | PASS, 관련 경계 11개 테스트 독립 실행, 추가 P1/P2 없음 |
| 배치 도구 | Node 16개 회귀 PASS: 제출 전 checkpoint, 기존 작업 복구, 공급자 변경, 크기·SHA·경로·중복 제출 경계 |
| WAV·패키징 도구 | Python 21항목 PASS: RIFF 경계, 기본 PCM24 export, 개인정보, 원본 유지·실패 처리 |
| 음악 도구 독립 리뷰 | PASS: PCM16/24/32 실제 APFS 복사·동일 SHA·독립 inode·원본 불변 및 품질·오류 경계 |
| 안내문 후속 P3 | `referenceDirection` 검증을 preflight로 이동. URL·Bearer 거부 2개 경계 독립 PASS |
| 실제 패키징 | exit 0, WAV·설명·provenance·manifest·안내문 생성 완료 |
| 독립 최종 산출물 리뷰 | PASS — 83개 파일 전수 검토 |

이전 리뷰에서 공개 metadata 누출(P2), RIFF padding 누락(P3), 공급자 준비 상태가 기존 작업 복구를 막는 P2, Mock 전환 시 미접수 키가 새 작업을 만들 수 있는 P2를 수정했다. 안내문 후속 P3 수정으로 참고 방향의 URL·인증 문자열도 출력 폴더 생성이나 음원 복사 전에 거부한다.

도구 QA는 대역 API와 임시 합성 WAV를 사용하며 실제 20곡의 파일 QA와 구분한다. 이전 QA 수치를 별도 완료 결과로 합산하지 않는다.

## 독립 최종 산출물 리뷰

backend_bootstrap이 83개 파일을 전수 검토해 PASS로 판정했다. 20곡 모두 150초이며 앱 저장 원본·배치 다운로드본·Provenance 원본·Upload_WAV의 네 경로에서 SHA가 같고 inode는 독립적이며 `nlink=1`임을 확인했다.

전곡 신호를 독립 NumPy 계산으로 다시 확인해 기록과 일치함을 검증했다. 공개 정보 누출이 없고, 17–20번 참고 방향·전곡 미청취·무변환 안내도 실제 파일과 일치했다.

## 완료 기록

README·release checklist·roadmap·제작 보고서·계획의 완료 수치와 검증 범위를 독립 검토했고 추가 지적 없이 PASS했다. 문서 base·diff 및 곡목 정합성 검사도 통과했다. QA 이후 계획을 completed로 이동하고 [같은 이름의 리뷰](../reviews/plan-004-test-music.md)에 근거와 한계를 기록했다.

음원은 다운로드 폴더에 준비됐으며 SoundCloud에 직접 업로드하지 않았다. 이 기록을 포함한 변경은 프로젝트의 commit → main 병합·push → 병합 브랜치 삭제 → 사용이 끝난 관리형 worktree archive 순서를 따른다. 추가 모바일 BPM 간격 보완은 별도 plan015에서 확인한다.
