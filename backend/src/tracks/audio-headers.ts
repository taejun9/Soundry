export type AudioRange = { kind: 'full' } | { kind: 'partial'; start: number; end: number } | { kind: 'unsatisfiable' };

/** RFC 9110 single byte range. Unsupported/malformed ranges use the full representation. */
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
export function audioDisposition(title: string, attachment: boolean, extension: 'wav' | 'mp3'): string {
  const base = safeBase(title);
  const filename = `${base}.${extension}`;
  const fallback = `${/^[\x20-\x7e]+$/.test(base) ? base.replace(/%/g, '_') : 'soundry-track'}.${extension}`;
  const encoded = encodeURIComponent(filename).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${attachment ? 'attachment' : 'inline'}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
