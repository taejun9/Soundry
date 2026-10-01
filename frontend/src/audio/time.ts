export function audioTime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '—:—';
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`;
}
