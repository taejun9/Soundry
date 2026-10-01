/**
 * UI 포트 설정이 로컬 접근 정책과 일치하는지 검증한다.
 * 설정 생략에만 기본값을 적용하고 빈 문자열·지수 표기·공백·API 포트 충돌을 거부해야 한다.
 */
import { describe, expect, it } from 'vitest';
import { readUiPort } from './local-boundary.js';

describe('explicit UI port configuration', () => {
  it('defaults only an absent value to 5173', () => {
    expect(readUiPort(undefined)).toBe(5173);
    expect(() => readUiPort('')).toThrow('INVALID_UI_PORT');
  });

  // 경계값 1024/65535와 기본/대체 포트를 포함해 허용 구간의 양 끝을 확인한다.
  it.each(['1024', '5173', '5174', '65535'])('accepts allowed UI port %s', (value) => {
    expect(readUiPort(value)).toBe(Number(value));
  });

  // Number로는 변환 가능한 값도 HTTP Origin의 명확한 정수 포트 계약에 맞지 않으면 실패해야 한다.
  it.each(['0', '1023', '65536', '3000', '-5174', '5174.5', '5e3', ' 5174', '5174 ', 'NaN', '5174/attacker'])('rejects invalid or reserved UI port %s', (value) => {
    expect(() => readUiPort(value)).toThrow('INVALID_UI_PORT');
  });
});
