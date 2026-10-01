# plan-014-score-endings

## 목표와 범위

실제150초Pop악보는70마디정상section과마지막68마디에서시작하는4마디반주를가졌다. 마지막2마디오버행때문에schema.ts:99가전체작업을실패시켰다. 원본렌더러는이미요청시간에서정확히마감·fade한다. 사용자의전체기능/실제음원제작범위에서이실사용실패를보완한다.

## 소유

provider_research는composition/schema.ts와composition.test.ts 및CLI prompt의계산된제약명시를소유한다. 지휘는계획/문서/실제API/통합을, backend_bootstrap은QA후독립리뷰를소유한다. 다른worktree의plan004음원도구/데이터를변경하지않는다.

## Decision Log

- 마지막반복의시작이요청범위안일때에만그반복의끝이총마디를넘도록허용한다. 시작이끝이후인part/완전히끝이후인추가반복은거부한다. 한반복길이최대8마디,16k event/48 voice/6000 voice-seconds/90–180초제한은그대로유지한다.
- PCM은기존렌더러가요청끝에서마감하고fade하므로시간/bytes/peak동작을바꾸지않는다. 전체구조/다양성/미사용패턴/외부코드등의검증을느슨하게하지않는다.
- 명시BPM이면앱계산totalBars를요청에전달하고기존누락된expanded최소48/합산발음6000초제약을명시한다. 자동새요청재시도나유료fallback은추가하지않는다.
- 실패이력과원본악보는로컬data에보존한다. 새실제검증은명시적요청으로수행하며실패를완료로고치지않는다.

## QA와 완료

실측오버행형태의회귀와악성과도반복거부,정확150초PCM과종료fade를검증한다. 전체QA/독립리뷰후실제요청곡검증을완료하고completed/review→commit→main병합/push→브랜치삭제/정리한다.20곡제작은plan004에서계속한다.

## 실행 근거

- 전체npm run qa:41files/443tests,lint/typecheck/frontend/backend build/base/audio PASS. renderer소스변경없음,gitdiffcheckPASS.
- 실제기존실패Pop악보를새validator로parse하고같은renderer로150초렌더PASS. 26,460,044bytes/stereo44100PCM16/peak-0.9155dBFS/full-scale0/최장저레벨0.2초/경고0. 이진단WAV는20곡산출물로중복집계하지않는다.
- 이전실패작업과checkpoint를보존하고4번곡의새CLI앱요청으로150초원본생성·저장·다운로드성공을확인했다.

- backend_bootstrap 독립리뷰PASS,추가P1/P2없음. 관련경계11tests독립실행PASS. 실제출력의앱저장과다운로드도완료했으므로계획완료.20곡후속제작은plan004에서계속한다.
