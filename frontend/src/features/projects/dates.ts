const formatter = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
export function projectDate(value: string): string {
  return formatter.format(new Date(value));
}
