import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { BUILD_COMMIT, buildLabel } from './build-commit';

const SHA = '188b12b3f0c94a1e8d2b7c6a5f4e3d2c1b0a9f8e';

describe('buildLabel', () => {
  it('shows the short commit and links the full one', () => {
    expect(buildLabel(SHA)).toEqual({
      text: '188b12b',
      href: `https://github.com/rgpl-xyz/ops-board/commit/${SHA}`,
    });
  });

  it('reads anything but a full commit as an unlinked dev build', () => {
    for (const value of ['dev', '', '188b12b', SHA.toUpperCase(), `${SHA}0`, 'javascript:alert(1)']) {
      expect(buildLabel(value)).toEqual({ text: 'dev', href: null });
    }
  });
});

describe('BUILD_COMMIT', () => {
  it('defaults to dev when the build defines no commit', () => {
    expect(TestBed.inject(BUILD_COMMIT)).toBe('dev');
  });
});
