/**
 * 보관함 query를 엄격하게 해석하는 계약을 검증한다.
 * favorite=false의 보존, 반복 query 거부, canonical cursor 및 실제 UTC 날짜 검증이 핵심이다.
 */
import { describe, expect, it } from 'vitest';
import { encodeTrackCursor, trackListQuery } from './track-list.js';

const id = '12345678-abcd-4321-aaaa-1234567890ab';
const createdAt = '2026-10-01T00:00:00.000Z';
describe('strict Library list queries', () => {
  it('defaults to all tracks and normalizes explicit filters and cursor', () => {
    expect(trackListQuery({})).toEqual({ limit: 30 });
    expect(trackListQuery({ favorite: 'false', projectId: id.toUpperCase(), limit: '100', cursor: encodeTrackCursor({ id: id.toUpperCase(), createdAt }) })).toEqual({
      favorite: false, projectId: id, limit: 100, cursor: { id, createdAt },
    });
    expect(trackListQuery({ favorite: 'true', limit: '1' })).toEqual({ favorite: true, limit: 1 });
  });
  // 한계값·암묵 변환 가능한 값·배열·알 수 없는 key를 섞어 허용 필터가 넓어지는 회귀를 방지한다.
  it.each([{ limit: '0' }, { limit: '101' }, { limit: '-1' }, { limit: '1.5' }, { limit: '1e2' }, { limit: '' }, { limit: 1 },
    { favorite: true }, { favorite: 1 }, { favorite: 'TRUE' }, { favorite: '' }, { favorite: ['true', 'false'] },
    { projectId: '../private' }, { projectId: null }, { projectId: [id, id] }, { unexpected: 'private-value' }, { limit: ['1', '2'] },
    { cursor: '' }, { cursor: 'abc' }, { cursor: ['a', 'b'] }, { cursor: 'x'.repeat(513) }])('rejects invalid input %j', (query) => {
    expect(() => trackListQuery(query)).toThrow();
  });
  // cursor JSON 모양이 맞더라도 존재하지 않는 날짜나 다른 시각 표기라면 거부해야 한다.
  it.each([null, [], { id }, { id, createdAt, privatePath: '/private/synthetic-path' }, { id: 'bad', createdAt },
    { id, createdAt: '2026-02-30T00:00:00.000Z' }, { id, createdAt: '2026-10-01T00:00:00Z' }, { id, createdAt: '2026-10-01T00:00:00.000+00:00' }])('rejects malformed cursor shape and dates %j', (cursor) => {
    expect(() => trackListQuery({ cursor: Buffer.from(JSON.stringify(cursor)).toString('base64url') })).toThrow();
  });
  it('rejects padded base64 instead of accepting a second encoding of the same cursor', () => {
    expect(() => trackListQuery({ cursor: encodeTrackCursor({ id, createdAt }) + '=' })).toThrow();
  });
});
