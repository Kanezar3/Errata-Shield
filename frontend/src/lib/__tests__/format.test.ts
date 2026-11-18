import { describe, expect, it } from 'vitest';
import { formatWeiDisplay, isHttpUrl } from '../format';

describe('formatWeiDisplay', () => {
  it('formats zero and empty values cleanly', () => {
    expect(formatWeiDisplay('0')).toEqual({ primary: '0 wei', secondary: '0 GEN' });
    expect(formatWeiDisplay('')).toEqual({ primary: '0 wei', secondary: '0 GEN' });
    expect(formatWeiDisplay(null)).toEqual({ primary: '0 wei', secondary: '0 GEN' });
  });

  it('formats micro-wei amounts as wei primary with GEN secondary', () => {
    const res = formatWeiDisplay('100');
    expect(res.primary).toBe('100 wei');
    expect(res.secondary).toContain('GEN');
  });

  it('formats >= 1e12 wei amounts as GEN primary with wei secondary', () => {
    const res = formatWeiDisplay('1000000000000000000');
    expect(res.primary).toBe('1 GEN');
    expect(res.secondary).toBe('1000000000000000000 wei');
  });
});

describe('isHttpUrl', () => {
  it('accepts http and https URLs', () => {
    expect(isHttpUrl('https://en.wikipedia.org/w/api.php')).toBe(true);
    expect(isHttpUrl('http://example.com')).toBe(true);
  });

  it('rejects non-URL citations and empty strings', () => {
    expect(isHttpUrl('Prime Number Theorem (1896)')).toBe(false);
    expect(isHttpUrl('')).toBe(false);
    expect(isHttpUrl(null)).toBe(false);
  });
});
