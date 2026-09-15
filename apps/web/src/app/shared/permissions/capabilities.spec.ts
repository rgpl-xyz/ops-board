import { describe, expect, it } from 'vitest';

import type { UserRole } from '../../data-access';
import { canManage, canRead, canRespond } from './capabilities';

const ALL_ROLES: UserRole[] = [
  'Viewer',
  'Responder',
  'IncidentManager',
  'Administrator',
];

describe('capabilities', () => {
  it('allows every role to read', () => {
    for (const role of ALL_ROLES) {
      expect(canRead(role)).toBe(true);
    }
  });

  it('allows respond only for Responder, IncidentManager, Administrator', () => {
    expect(canRespond('Viewer')).toBe(false);
    expect(canRespond('Responder')).toBe(true);
    expect(canRespond('IncidentManager')).toBe(true);
    expect(canRespond('Administrator')).toBe(true);
  });

  it('allows manage only for IncidentManager and Administrator', () => {
    expect(canManage('Viewer')).toBe(false);
    expect(canManage('Responder')).toBe(false);
    expect(canManage('IncidentManager')).toBe(true);
    expect(canManage('Administrator')).toBe(true);
  });
});
