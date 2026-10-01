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
  it.each([{ limit: '0' }, { limit: '101' }, { limit: '-1' }, { limit: '1.5' }, { limit: '1e2' }, { limit: '' }, { limit: 1 },
    { favorite: true }, { favorite: 1 }, { favorite: 'TRUE' }, { favorite: '' }, { favorite: ['true', 'false'] },
    { projectId: '../private' }, { projectId: null }, { projectId: [id, id] }, { unexpected: 'private-value' }, { limit: ['1', '2'] },
    { cursor: '' }, { cursor: 'abc' }, { cursor: ['a', 'b'] }, { cursor: 'x'.repeat(513) }])('rejects invalid input %j', (query) => {
    expect(() => trackListQuery(query)).toThrow();
  });
  it.each([null, [], { id }, { id, createdAt, privatePath: '/private/synthetic-path' }, { id: 'bad', createdAt },
    { id, createdAt: '2026-02-30T00:00:00.000Z' }, { id, createdAt: '2026-10-01T00:00:00Z' }, { id, createdAt: '2026-10-01T00:00:00.000+00:00' }])('rejects malformed cursor shape and dates %j', (cursor) => {
    expect(() => trackListQuery({ cursor: Buffer.from(JSON.stringify(cursor)).toString('base64url') })).toThrow();
  });
  it('rejects padded base64 instead of accepting a second encoding of the same cursor', () => {
    expect(() => trackListQuery({ cursor: encodeTrackCursor({ id, createdAt }) + '=' })).toThrow();
  });
});
