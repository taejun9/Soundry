# 테스트 음원 제작 도구

Soundry의 Codex CLI 작곡과 로컬 합성으로 장르 16곡, 참고 방향 4곡을 제작하고 SoundCloud 업로드용 WAV를 정리한다. 추가 유료 음악 API나 Fal 키는 사용하지 않는다. 기존 Codex ChatGPT 로그인과 계정 사용 한도가 적용되며, 작곡 요청의 텍스트는 CLI를 통해 전송되고 오디오 합성과 저장은 로컬에서 처리된다.

현재 제작 현황은 실행에 사용한 `completed-manifest.json`과 [제작 보고서](../../docs/quality/test-music-report.md)를 기준으로 확인한다. 아래 도구 검증 결과는 실제 음원 제작 완료나 청취 완료를 뜻하지 않는다.

## 준비와 파일 구성

모든 명령은 저장소 루트에서 실행한다. 앱 설치는 [프로젝트 README](../../README.md)를 따른다. 배치 실행에는 프로젝트가 요구하는 Node.js 24와 실행 중인 Soundry API가 필요하다. WAV 검사와 패키징에는 Python 3.10 이상과 NumPy가 필요하며, 아래 `python3`는 NumPy를 사용할 수 있는 Python을 가리켜야 한다.

| 파일 | 역할 |
| --- | --- |
| `track-plan.json` | 20곡의 제목·장르·콘셉트·프롬프트·생성 설정. 목표 BPM은 측정값이 아니다. |
| `cli_batch_runner.mjs` | 로컬 앱 API를 통한 순차 제작, 중단 후 재개, 원본 다운로드 |
| `audio_tools.py` | WAV 검사, PCM24 export, 원본을 보존하는 업로드 패키징. 네트워크나 생성 모델은 호출하지 않는다. |
| `data/music/checkpoint.json` | 제출 전에 저장한 requestKey, Generation ID, 프로젝트 연결 정보 |
| `data/music/completed-manifest.json` | 다운로드와 SHA256 확인을 마친 완료 원본 목록 |
| `data/music/originals/` | 다운로드한 원본 WAV |

`data/music/`는 기본 상태 폴더이며 Git에서 제외된다. `--state-dir`로 바꾸면 이후 재개와 패키징에서도 같은 폴더를 사용한다.

## 앱 실행과 순차 제작

앱이 꺼져 있다면 다음 명령으로 실행한다. 이 예시는 API `http://127.0.0.1:3000`, UI `http://127.0.0.1:5174`를 사용한다. 앱의 UI 기본값은 5173이므로 여기서는 `UI_PORT=5174`를 명시한다.

```sh
MUSIC_PROVIDER=cli UI_PORT=5174 npm run dev
```

다른 터미널에서 먼저 1번 곡을 제작한다. `--project-id`를 생략하면 배치용 프로젝트를 만들고 checkpoint에 저장한다.

```sh
node harness/music/cli_batch_runner.mjs \
  --state-dir "$PWD/data/music" \
  --origin http://127.0.0.1:3000 \
  --ui-origin http://127.0.0.1:5174 \
  --numbers 1
```

앱에서 첫 곡의 생성·저장·재생·다운로드를 확인한 뒤, 같은 상태 폴더로 전체 계획을 이어간다. 이미 완료된 곡은 원본 SHA256을 확인하고 건너뛴다.

```sh
node harness/music/cli_batch_runner.mjs \
  --state-dir "$PWD/data/music" \
  --origin http://127.0.0.1:3000 \
  --ui-origin http://127.0.0.1:5174
```

두 origin은 배치 도구의 기본값과 같다. 앱의 UI 포트를 바꿨다면 `--ui-origin`도 맞춘다. `--numbers 2,3`처럼 일부 곡을 지정할 수 있고, 기존 앱 프로젝트를 사용하려면 `--project-id`에 `/projects/` 뒤의 프로젝트 ID를 넣는다. 같은 checkpoint를 다른 프로젝트에 연결할 수는 없다.

새 제작을 별도로 시작할 때는 새 `--state-dir`를 사용한다. 진행 중인 폴더의 checkpoint나 원본을 지우거나, 입력을 바꿔 같은 요청 키로 재사용하지 않는다.

## 중단 후 재개

중단되면 같은 계획과 상태 폴더로 같은 명령을 다시 실행한다. 배치 도구는 제출 전에 requestKey를 기록하며 응답이 불확실하다고 새 생성 요청으로 바꾸지 않는다.

| 저장된 상태 | 재개 동작 |
| --- | --- |
| 완료 manifest와 원본이 있음 | 로컬 경로와 SHA256을 확인하고 건너뛴다. |
| Generation ID가 있음 | 새 생성 POST 없이 기존 작업을 조회하고 원본 다운로드를 이어간다. 현재 CLI 로그인이나 공급자 준비 상태는 요구하지 않는다. 결과의 원래 CLI 공급자·모델은 검증한다. |
| requestKey만 있고 Generation ID는 없음 | 현재 공급자가 원래 CLI와 같은 모델인지 확인한 뒤 같은 키로 접수를 확인한다. 로그인 준비 상태는 이 확인을 막지 않는다. Mock으로 바꿨다면 CLI로 되돌려야 한다. |
| 아직 저장한 요청이 없음 | CLI 설치·로그인·공급자 준비 상태를 확인한 뒤 새 요청을 제출한다. |

완료 음원 제목이 계획과 다르면 배치 도구가 계획의 제목으로 맞춘다. 기존 작업의 조회·다운로드 재개는 새 작곡을 만들지 않는다.

작업이 실패·취소되거나 사용 한도에 도달하면 배치를 멈추고 원인을 표시한다. 자동으로 새 작업을 만들어 재시도하지 않는다. 곡별 대기 제한은 기본 1,200초이며 `--timeout-seconds`로 조정할 수 있다. 대기 시간 초과나 `Ctrl+C`는 배치의 대기를 멈추는 것이므로 앱에서 작업 상태를 확인하고 같은 checkpoint로 재개한다.

프로젝트 생성 응답만 유실됐다면 앱에서 만들어진 프로젝트를 확인하고 `--project-id`로 연결한다. `.batch.lock`이 남았다면 해당 배치 프로세스가 종료됐는지 확인한 뒤에만 정리한다. 검증되지 않은 기존 원본은 덮어쓰지 않는다.

## WAV 검사와 패키징

개별 원본은 다음과 같이 검사한다.

```sh
python3 harness/music/audio_tools.py inspect data/music/originals/01-original.wav
```

패키징은 완료된 20곡 모두가 있어야 시작한다. 실제 WAV의 길이 90–180초, stereo, 최소 44.1 kHz·16 bit와 신호 경고가 없는지 확인하고, 같은 SHA256의 중복 오디오는 거부한다.

두 방식 중 하나를 선택한다. 다음 예시의 목적 폴더는 새 폴더여야 한다. 기존 목적 폴더나 export 파일을 덮어쓰지 않으며, 실패한 패키지에는 `패키지 미완료.txt`를 남긴다. 불완전한 폴더를 업로드하지 말고 오류를 확인한 뒤 새 목적 폴더로 다시 실행한다.

### 기본: PCM24 export

원본을 `Provenance`에 보존하고, `Upload_WAV`에 변환본을 만든다. 변환본에는 sample peak가 최대 −1 dBFS가 되도록 필요한 경우에만 감쇠하고, 10 ms fade-in, 1초 fade-out, 결정적 TPDF dither와 PCM24 양자화를 적용한다. 작은 음원을 증폭하지 않으며 길이와 sample rate는 유지한다.

```sh
python3 harness/music/audio_tools.py package \
  --plan harness/music/track-plan.json \
  --manifest data/music/completed-manifest.json \
  --destination "$HOME/Downloads/Soundry_SoundCloud_PCM24"
```

개별 파일만 변환하려면 `export 원본경로 새출력경로`를 사용한다. 업샘플링이나 가상 stereo 변환은 하지 않으며, 감쇠만으로 원본 clipping이 해결됐다고 간주하지 않는다.

### 선택: 검증된 원본 WAV 유지

추가 변환이 필요 없는 원본은 `--preserve-original-wav`를 사용한다. 공통 검사에 더해 PCM16/24/32 형식이고 sample peak가 −0.5 dBFS 이하여야 한다.

```sh
python3 harness/music/audio_tools.py package \
  --plan harness/music/track-plan.json \
  --manifest data/music/completed-manifest.json \
  --destination "$HOME/Downloads/Soundry_SoundCloud_Original_WAV" \
  --preserve-original-wav
```

`Provenance`와 `Upload_WAV`에 원본 바이트 그대로 독립 파일을 만든다. 추가 gain·fade·dither를 적용하지 않으며 원본과 두 복사본의 SHA256은 같다. 변환하지 않았다는 사실과 복사 방식도 metadata에 기록한다.

macOS에서는 같은 APFS 볼륨의 `clonefile` copy-on-write 복사를 사용한다. 복사본은 원본과 다른 inode를 가지며 hardlink가 아닌 `nlink=1` 파일이다. 복제에 실패하면 정제된 오류로 멈추고, 공간을 더 쓰는 일반 전체 복사로 전환하지 않는다. 다른 플랫폼에서는 새 파일을 배타적으로 생성해 독립 복사하며 기존 파일은 덮어쓰지 않는다.

## 결과와 검사 범위

- `Upload_WAV/`: 일반 SoundCloud 업로드용 WAV 20개
- `Metadata/`: 복사용 제목·설명·태그와 CSV/JSON 목록
- `Provenance/`: 생성 원본, 실제 공급자·모델·설정·요청 ID, SHA256, 검사 결과와 변환 내역

WAV 검사는 전체 바이트를 디코딩하여 RIFF 경계, PCM16/24/32 또는 IEEE float32/64 형식, 길이, channels, sample rate, 비정상 sample, sample peak, RMS, 연속 full-scale, 8초 이상 저레벨 구간과 SHA256을 확인한다. 저레벨은 0.1초 블록 RMS가 −60 dBFS 미만인 상태다.

**도구는 실제 청취를 수행하지 않는다.** 신호 검사는 장르 적합성·편곡 완성도·true peak·LUFS 검증을 대신하지 않는다. 실제로 들은 경우에만 `listeningQa`에 방법과 구간을 기록하고, 듣지 않았다면 `performed: false`를 유지한다. 이 음원은 AI가 쓴 악보를 로컬 악기로 합성한 연주곡이며 가창이나 원본 악기 녹음으로 표시하지 않는다.

완료 manifest는 `{"results": [...]}` 구조다. 각 곡에는 `trackNumber`, `state: "completed"`, `requestId`, `localFile`, 실제 `provider`와 `model`을 기록하며, runner는 `sha256`과 checkpoint 연결 정보도 보관한다. 공개 provenance에는 허용된 설정·추적 필드만 복사한다. `listeningQa`는 `performed`, `method`, `notes`, `segments`만 공개하고, 구간은 `startSeconds`와 `endSeconds`로 기록한다.

원격 URL과 인증 정보를 manifest나 자유 텍스트에 넣지 않는다. 공개 필드에서 URL·인증 정보 형태를 발견하면 출력 폴더를 만들기 전에 거부한다. 추가 응답 필드는 버리고 로컬 원본 경로와 이름 대신 패키지 내부 파일명만 공개한다. 이 도구는 SoundCloud에 업로드하지 않으며 수익화·외부 유통·Content ID 승인을 보장하지 않는다.

## 도구 자체 검증

```sh
python3 harness/music/qa_audio_tools.py
node --test harness/music/cli_batch_runner.test.mjs
```

Python 검증은 **21항목**이다. OS 임시 폴더의 합성 sine WAV를 사용해 기본 PCM24 출력, RIFF 손상·실패 경계, 공개 metadata, 원본 유지 패키징, 동일 SHA, 독립 inode, 복사본 수정 후 원본 불변, 복제 실패를 검사하고 임시 파일을 정리한다. 기존 경로의 20곡 패키징은 한 번만 검증하며 이후 원본 유지 검증에는 copy-on-write를 활용한다.

Node 검증은 **16개 회귀**다. 실제 네트워크 대신 대역 응답을 사용해 제출 전 checkpoint, 응답 유실 후 같은 키 확인, 기존 작업 복구, 공급자 변경 경계, 원본 크기·SHA·로컬 경로 및 중복 제출 방지를 확인한다. 어느 검증도 실제 작곡을 호출하지 않으며 합성 fixture는 사용자 요청의 20곡에 포함되지 않는다.
