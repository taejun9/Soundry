/**
 * 트랙 route ID와 PATCH의 좁은 수정 계약을 검증한다.
 * 제목/favorite만 허용하고 기존 객체를 바꾸지 않으며 요청한 false와 필드 생략을 구분해야 한다.
 */
import { describe, expect, it } from 'vitest';
import { AppError } from '../api-errors.js';
import { trackId, validateTrackUpdate } from './track-input.js';

const id = 'ABCDEF12-3456-4789-ABCD-ABCDEF123456';
// 모든 실패가 공개 입력 오류로 정제되는지 상태/코드를 함께 검사한다.
function rejects(action: () => unknown) {
  try { action(); throw new Error('Expected invalid input'); }
  catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).getStatus()).toBe(400);
    expect((error as AppError).publicCode).toBe('INVALID_INPUT');
  }
}

// UUID case 정규화는 허용하지만 공백/경로/encoded traversal을 ID처럼 받지 않는다.
describe('track route identifier', () => {
  it('normalizes UUID case without changing the identifier', () => {
    expect(trackId(id)).toBe(id.toLowerCase());
    expect(trackId(id.toLowerCase())).toBe(id.toLowerCase());
  });

  it('rejects malformed, whitespace-padded, and path-like identifiers', () => {
    for (const value of ['', 'not-a-uuid', ` ${id}`, `${id}\n`, id.replaceAll('-', ''), `${id}/audio`, '../track', '%2e%2e%2ftrack']) {
      rejects(() => trackId(value));
    }
  });
});

// trim 후 글자 수, boolean 타입, 알 수 없는 필드와 snapshot 독립성을 함께 확인한다.
describe('track update validation', () => {
  it('accepts a title-only update and validates length after trimming', () => {
    expect(validateTrackUpdate({ title: '  서울의 밤  ' })).toEqual({ title: '서울의 밤' });
    expect(validateTrackUpdate({ title: ' 가 ' })).toEqual({ title: '가' });
    expect(validateTrackUpdate({ title: ` ${'가'.repeat(120)} ` })).toEqual({ title: '가'.repeat(120) });
  });

  it('preserves both favorite values without inventing a title', () => {
    expect(validateTrackUpdate({ favorite: true })).toEqual({ favorite: true });
    expect(validateTrackUpdate({ favorite: false })).toEqual({ favorite: false });
  });

  // mutable/frozen 입력을 모두 써서 validator가 원본을 수정하거나 결과와 참조를 공유하지 않음을 입증한다.
  it('returns a fresh snapshot and leaves mutable or frozen inputs unchanged', () => {
    const input = { title: '  원본 제목  ', favorite: false };
    const result = validateTrackUpdate(input);
    expect(result).toEqual({ title: '원본 제목', favorite: false });
    expect(result).not.toBe(input);
    expect(input.title).toBe('  원본 제목  ');
    input.title = '다른 제목';
    input.favorite = true;
    expect(result).toEqual({ title: '원본 제목', favorite: false });
    const frozen = Object.freeze({ title: '  고정 입력  ', favorite: true });
    expect(validateTrackUpdate(frozen)).toEqual({ title: '고정 입력', favorite: true });
    expect(frozen.title).toBe('  고정 입력  ');
  });

  it('requires at least one allowed field and rejects non-object or expanded updates', () => {
    for (const value of [undefined, null, [], ['title'], '', 0, false, {}, { title: '제목', audioPath: '/private/synthetic-path' }, { favorite: true, prompt: '바꾸기' }, { id, title: '제목' }, { Title: '제목' }, JSON.parse('{"__proto__":{},"title":"제목"}')]) {
      rejects(() => validateTrackUpdate(value));
    }
  });

  it('rejects non-string, empty, oversized, and NUL-containing titles', () => {
    for (const title of [undefined, null, 1, false, {}, [], '', ' \n\t ', '가'.repeat(121), '\0제목', '제\0목', '제목\0']) {
      rejects(() => validateTrackUpdate({ title }));
      rejects(() => validateTrackUpdate({ title, favorite: true }));
    }
  });

  it('requires a boolean favorite rather than coercing strings or numbers', () => {
    for (const favorite of [undefined, null, 0, 1, 'true', 'false', '', [], {}]) {
      rejects(() => validateTrackUpdate({ favorite }));
      rejects(() => validateTrackUpdate({ title: '제목', favorite }));
    }
  });
});
