import { describe, expect, it } from 'vitest';
import { readUiPort } from './local-boundary.js';

describe('explicit UI port configuration', () => {
  it('defaults only an absent value to 5173', () => {
    expect(readUiPort(undefined)).toBe(5173);
    expect(() => readUiPort('')).toThrow('INVALID_UI_PORT');
  });

  it.each(['1024', '5173', '5174', '65535'])('accepts allowed UI port %s', (value) => {
    expect(readUiPort(value)).toBe(Number(value));
  });

  it.each(['0', '1023', '65536', '3000', '-5174', '5174.5', '5e3', ' 5174', '5174 ', 'NaN', '5174/attacker'])('rejects invalid or reserved UI port %s', (value) => {
    expect(() => readUiPort(value)).toThrow('INVALID_UI_PORT');
  });
});
