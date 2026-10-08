# plan-019-composition-memory 리뷰

## 판단
PASS. QA 이후 source diff·입력/소유권·전송·취소·migration·결과물·문서 주장을 별도 검토했다. 동일 작업 agent가 QA 후 별도 검토 단계로 수행했으며 다른 독립 agent를 실행한 것으로 기록하지 않는다. 권한 선언 object와 tags null의 입력 실패를 수정하고 관련QA를 통과한 뒤 재검토했다. 추가 P1/P2를 발견하지 않았다.

## 변경과 근거
작곡까지만 진행한다는 사용자 범위에 따라 로컬 Ollama/Gemma runner를 기존 CLI와 같은 JSON 검증/합성에 연결했다. 회원별 작곡 지식·직접 청취 평가의 lexical RAG와 참고digest를 실제 생성에 사용한다. 검증된 악보를 보존하며 JSON/DAW용 MIDI를 내보낸다. 임의파일/웹수집·보컬/음색모델·자동 훈련·원격fallback을 추가하지 않았다.

- 새 지식 API는 가입 전에도401, 소유자 필터를 사용하고 관리자도 다른 회원 지식을 보지 못한다. Track/Generation 부속 API는 기존 소유권 guard를 사용한다.
- CLI는 allowRemote=true만 참고하고 평가와 구조 요약에도 같은 동의를 적용한다. 전체 선율/음원/회원정보를 RAG에 넣지 않는다. 지식은 도구 지시가 아닌 JSON 데이터이며 모델 출력은 strict 악보 검증 뒤 저장한다.
- local endpoint는숫자 loopback이고 cloud-disabled 상태·모델metadata를 확인한다. 준비 실패/취소/출력 실패를 성공이나다른모델로 바꾸지 않는다.
- migration은v1/v2 데이터 보존과v3 관계·제약을 유지한다. 실제 기존data는 종료 뒤 전체clone백업했고 미완료generation0이었다.
- 악보는 검증된variation만 저장한다. 실패batch의 중간악보는 공개Track가없어 내보낼수없다. MIDI의 같은음 겹침gate와 ending을 독립 binary test로 확인했다.
- QA48files/474tests·Node18/Python23·lint/type/build/base/audio/smoke PASS. 이후 입력타입보완은4files/16tests와lint/type/build PASS. [화면·실제 다운로드·미검증 근거](../quality/plan-019-verification.md)를 따른다.

## 잔여 한계
Gemma가설치되지않아실제추론은미검증이다. RAG는 단어/한국어2글자 검색이며 embedding/fine-tuning을 구현하지 않았다. 관련 지식이없으면기존작곡지침만사용한다. 사람청취별점은주관평가이며상업품질을보장하지않는다. MIDI는기존합성음색/pan/release를그대로재현하지않고DAW편곡용이다. JSON Blob 디스크저장과실제DAW import는미확인이다. 사용자는보컬·음색모델을제외했다.

## 완료 연결
동일 basename의completed계획으로mirror한다. 기록포함taskcommit → clean main병합/push → detach/branch -d → 관리형archive 순서를 따른다. 실패하면그단계와blocker를보고하고강제push/branch삭제를하지않는다.
