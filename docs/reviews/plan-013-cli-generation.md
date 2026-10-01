# plan-013 CLI 작곡 전환 리뷰

## 결과

PASS. 사용자 요청에 따라 유료 음악 API 대신 기존 ChatGPT 로그인 Codex CLI가 제한 JSON 악보를 만들고 앱이 로컬 WAV로 합성한다. 기본 CLI, 명시적 Mock 구분, 준비상태·실패·입력·재생·저장 흐름을 연결했다.

## QA

- 전체 `npm run qa`:41 files/433 tests,lint/typecheck/build/base/audio PASS.
- 개발 smoke:기존 소유 서버 종료 후 API/UI/proxy/포트충돌/Ctrl-C정상종료PASS. 첫실패는기존서버점유였으며회피하지않고재실행했다.
- 실제CLI:첫 악보 검증실패를 failed이력에보존. 별도진단유효악보PASS, 이후명시적앱새작업으로150초stereo44100PCM16 WAV완료. 진단곡은20곡산출물에중복집계하지않는다.
- 원본전체bytes26,460,044,full-scale0,최장저레벨0.5초,신호경고0. 다운로드SHA256일치/Range206.
- IAB320px:89초입력차단·세부설정열림·초점,실패/입력재사용확인/새생성,재생시간증가·75초seek·pause,가로넘침없음. 1280×900:실제곡즐겨찾기→보관함/플레이어상태보존확인.

## 독립 심사

provider_research는 본인소유renderer를제외한CLI runner/provider/service 및generation/storage를읽기전용검토했다. shell:false,키환경제외,ChatGPT auth,빈cwd/도구비활성,출력·시간한도,processgroup취소,기존requestKey우선조회와원자저장을확인했고P1/P2없음.

frontend_bootstrap은본인미작성composition schema/renderer를검토하고42tests를독립실행했다. 길이/헤더/peak/DC/fade,자원경계,seed/취소/single-use에P1/P2없음. provider_research의마지막비용·기능·근거문서리뷰도PASS.

## 한계와 후속

악보의음색·편곡완성도를실제청취로검증하지않았다. 신호/화면검증과청취를구분한다. 현재합성기는자체악기/고정BPM이며가창·원본녹음악기·glide/wah효과를제공했다고표시하지않는다. 이CLI곡의native브라우저별검증은미수행이며과거Mock검증과구분한다. CLI계정한도와네트워크가필요하고출력실패시자동재시도/유료fallback이없다. 사용자요청20곡완료·Downloads전달은plan004에서계속한다.
