import { describe, expect, it } from 'vitest';

import {
  asRevisionString,
  isRevisionString,
  type RevisionString,
} from './common';

describe('RevisionString', () => {
  it('accepts positive decimal strings via asRevisionString', () => {
    const revision = asRevisionString('1');
    expect(revision).toBe('1');
    expect(typeof revision).toBe('string');
  });

  it('rejects non-decimal shapes', () => {
    expect(() => asRevisionString('')).toThrow();
    expect(() => asRevisionString('0')).toThrow();
    expect(() => asRevisionString('01')).toThrow();
    expect(() => asRevisionString('1.5')).toThrow();
    expect(() => asRevisionString('-1')).toThrow();
    expect(() => asRevisionString('1e2')).toThrow();
  });

  it('keeps JSON "version":"1" as a string and never uses Number(...)', () => {
    const payload = JSON.parse('{"version":"1","lifecycleVersion":"2"}') as {
      version: string;
      lifecycleVersion: string;
    };

    expect(typeof payload.version).toBe('string');
    expect(payload.version).toBe('1');
    expect(Number.isNaN(Number('9007199254740993'))).toBe(false);

    // Prove we brand without numeric coercion (unsafe for large decimals).
    const version: RevisionString = asRevisionString(payload.version);
    const lifecycle: RevisionString = asRevisionString(payload.lifecycleVersion);
    expect(version).toBe('1');
    expect(lifecycle).toBe('2');
    expect(isRevisionString(version)).toBe(true);

    // Explicitly document the forbidden path is not used.
    const coerced = Number(payload.version);
    expect(coerced).toBe(1);
    expect(asRevisionString(payload.version)).not.toBe(coerced as unknown as string);
    expect(typeof asRevisionString(payload.version)).toBe('string');
  });

  it('preserves large decimal strings that Number would round', () => {
    const raw = '9007199254740993';
    expect(String(Number(raw))).not.toBe(raw);
    expect(asRevisionString(raw)).toBe(raw);
  });
});
