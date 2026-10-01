/**
 * 재생 시간의 표시 전용 변환. 확인되지 않은 길이는 0초처럼 보이지 않도록 별도 기호로 표현한다.
 */
/** 초 미만은 내리고 음수는 0으로 표시한다. null/무한 값은 길이 미확인 표시를 유지한다. */
export function audioTime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '—:—';
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`;
}
