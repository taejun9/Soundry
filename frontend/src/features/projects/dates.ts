/**
 * 프로젝트의 검증된 ISO 날짜를 한국어 표시 형식으로 바꾼다. 시간대는 사용 중인 브라우저 설정을 따른다.
 */
const formatter = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
export function projectDate(value: string): string {
  return formatter.format(new Date(value));
}
