# 고정 MockProvider 오디오

이 디렉터리의 WAV 두 개는 Soundry의 파일 저장·스트리밍·재생 경로를 확인하기 위한 **고정 데모**다. `generate.mjs`가 사인파와 정수 MIDI 음높이로 자체 합성한다. 외부 음원, 녹음, 샘플, 모델 출력, 네트워크, 별도 라이브러리를 사용하지 않았다. 제3자 녹음물을 가져오거나 기존 곡의 멜로디를 옮기지 않았으며, 합성 과정 전체를 이 소스로 재현할 수 있다.

- `demo-01.wav`: A minor 9 → F major 9 → C major 9 → G 6의 부드러운 코드 위에 느린 벨 아르페지오를 배치했다.
- `demo-02.wav`: D major → B minor → G major → A major의 저음 위에 빠른 하프 아르페지오를 배치했다.

각 음은 기본 사인파에 작은 2·3배음과 attack/release envelope를 더했다. 음별 좌우 위치로 스테레오를 만들고, 전체에 30 ms fade-in과 250 ms fade-out을 적용했다. 최대 절댓값을 0.56으로 조정한 뒤 signed 16-bit PCM으로 양자화하므로 약 −5.04 dBFS의 sample peak와 여유를 갖는다. 첫 프레임과 마지막 프레임은 0이다. 난수·현재 시각·플랫폼 오디오 코덱에 의존하지 않는다.

## 재생성 및 확인

저장소 루트에서 Node.js 24로 실행한다. 표의 bytes와 해시는 Node.js 24.15.0에서 확인했다. 같은 Node.js 런타임에서 재생성 결과가 일치한다. 서로 다른 JavaScript 수학 함수 구현 사이의 byte 일치는 보장하지 않는다.

```sh
node backend/fixtures/audio/generate.mjs
node backend/fixtures/audio/generate.mjs --check
```

첫 명령은 이 디렉터리의 WAV 두 개와 `manifest.json`을 다시 쓴다. 두 번째 명령은 파일을 변경하지 않고 현재 소스로 만든 bytes 및 manifest가 저장된 파일과 정확히 같은지 검사하며, 차이가 있으면 실패한다. WAV는 44-byte PCM 헤더와 interleaved little-endian sample로 구성된다.

| 파일 | 실제 길이 | 프레임 | 형식 | 용량 | SHA-256 |
|---|---:|---:|---|---:|---|
| `demo-01.wav` | 8초 | 352,800 | 44,100 Hz / 16-bit PCM / stereo | 1,411,244 bytes | `ce16e61800a5fff21d710258abc3a68f026dc99ff4d794333f01e57e1e251717` |
| `demo-02.wav` | 8초 | 352,800 | 44,100 Hz / 16-bit PCM / stereo | 1,411,244 bytes | `952c8ae96a5d0286f9f22f636c304e243f71e7702759665afbd0bf9749a7066c` |

각 파일은 2 MiB보다 작고 합계는 2,822,488 bytes로 4 MiB보다 작다. `manifest.json`은 위 파일의 실제 WAV bytes에서 계산한 SHA-256과 실제 신호 형식을 기록한다. Git에 허용한 오디오 fixture는 이 두 경로로만 제한한다.

## 제품 표시와 검증 범위

MockProvider는 두 파일을 variation 순서에 따라 반복해서 반환한다. 사용자가 입력한 prompt, seed, BPM 또는 장르에 맞춰 새로 작곡한 결과가 아니며, metadata에는 실제 길이인 8초를 표시해야 한다. 원격 AI 호출이나 비용은 발생하지 않는다.

이 데모는 사용자가 요청한 **90–180초의 장르별 테스트 음원, 특정 음악적 방향의 테스트곡, SoundCloud 업로드용 완성곡을 대체하지 않는다.** 기술적 파일 검증이나 재현성 통과만으로 음악적 완성도 또는 실제 사용자의 청취 평가가 완료됐다고 주장하지 않는다.
