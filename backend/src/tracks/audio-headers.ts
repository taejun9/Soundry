/**
 * 오디오 HTTP 전송에 필요한 단일 Range와 안전한 다운로드 filename을 생성한다.
 * 사용자 표시 제목은 파일 경로로 사용하지 않으며 헤더 제어 문자와 플랫폼 예약 이름을 제거한다.
 */
export type AudioRange = { kind: 'full' } | { kind: 'partial'; start: number; end: number } | { kind: 'unsatisfiable' };

/** RFC 9110 single byte range. Unsupported/malformed ranges use the full representation. */
// 구문 오류/지원하지 않는 다중 Range는 full 응답, 파일 밖의 유효한 Range는 416 대상으로 구분한다.
// 매우 큰 숫자도 반올림 없이 비교하기 위해 BigInt를 사용하고 실제 파일 범위로 잘라서 number로 변환한다.
export function parseAudioRange(value: string | undefined, size: number): AudioRange {
  if (value === undefined) return { kind: 'full' };
  const match = /^bytes=(\d*)-(\d*)$/i.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return { kind: 'full' };
  const length = BigInt(size);
  if (!match[1]) {
    const suffix = BigInt(match[2]!);
    if (suffix === 0n || length === 0n) return { kind: 'unsatisfiable' };
    return { kind: 'partial', start: Number(suffix >= length ? 0n : length - suffix), end: size - 1 };
  }
  const start = BigInt(match[1]);
  const requestedEnd = match[2] ? BigInt(match[2]) : undefined;
  if (requestedEnd !== undefined && requestedEnd < start) return { kind: 'full' };
  if (start >= length) return { kind: 'unsatisfiable' };
  return { kind: 'partial', start: Number(start), end: requestedEnd === undefined || requestedEnd >= length ? size - 1 : Number(requestedEnd) };
}

// Unicode는 NFC로 정규화하고 고립 surrogate·제어 문자·경로 구분자를 제거한다. 160 UTF-8 byte 한도는 문자 중간을 자르지 않는다.
function safeBase(title: string): string {
  // With /u, valid surrogate pairs remain intact and lone UTF-16 surrogates are removed.
  const cleaned = title.replace(/[\uD800-\uDFFF]/gu, '').normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/[/\\:*?"<>|]/g, '-')
    .replace(/\.(wav|mp3)$/i, '').trim().replace(/^[.\s]+|[.\s]+$/g, '');
  let base = '';
  for (const character of cleaned) {
    if (Buffer.byteLength(base + character, 'utf8') > 160) break;
    base += character;
  }
  base = base.replace(/[.\s]+$/g, '') || 'soundry-track';
  if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(base)) base = `soundry-${base}`;
  return base;
}

/** RFC 6266/8187: quoted ASCII fallback plus a UTF-8 extended filename. */
// 구형 client용 ASCII fallback과 UTF-8 filename*을 함께 제공한다. 확장자는 검증된 실제 포맷에서 받는다.
export function audioDisposition(title: string, attachment: boolean, extension: 'wav' | 'mp3'): string {
  const base = safeBase(title);
  const filename = `${base}.${extension}`;
  const fallback = `${/^[\x20-\x7e]+$/.test(base) ? base.replace(/%/g, '_') : 'soundry-track'}.${extension}`;
  const encoded = encodeURIComponent(filename).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${attachment ? 'attachment' : 'inline'}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
