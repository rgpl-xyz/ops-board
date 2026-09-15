import { describe, expect, it } from 'vitest';

import type { UserRole } from '../../../data-access';
import {
  ACTIVE_STATUS_OPTIONS,
  canChangeActiveStatus,
  canChangeSeverity,
  canCreateIncident,
  canEditIncidentDetails,
  canJoin,
  canLeave,
  canPostWrittenUpdate,
  canReopen,
  canResolve,
  isActiveStatus,
} from './incident-actions';

describe('incident-actions eligibility', () => {
  it('treats Investigating/Identified/Monitoring as active and Resolved as not', () => {
    expect(isActiveStatus('Investigating')).toBe(true);
    expect(isActiveStatus('Identified')).toBe(true);
    expect(isActiveStatus('Monitoring')).toBe(true);
    expect(isActiveStatus('Resolved')).toBe(false);
  });

  it('exposes active status options without Resolved', () => {
    expect(ACTIVE_STATUS_OPTIONS).toEqual([
      'Investigating',
      'Identified',
      'Monitoring',
    ]);
  });

  describe('severity (scalar manage edit)', () => {
    it('allows manage roles at any status including Resolved (role-only gate)', () => {
      expect(canChangeSeverity('IncidentManager')).toBe(true);
      expect(canChangeSeverity('Administrator')).toBe(true);
      expect(canChangeSeverity('Responder')).toBe(false);
      expect(canChangeSeverity('Viewer')).toBe(false);
      // Status is intentionally not a parameter — Resolved does not block severity.
      expect(canChangeSeverity('IncidentManager')).toBe(true);
    });
  });

  describe('active status / resolve / reopen', () => {
    it('allows change active status only when manage + active', () => {
      expect(canChangeActiveStatus('IncidentManager', 'Investigating')).toBe(
        true,
      );
      expect(canChangeActiveStatus('IncidentManager', 'Resolved')).toBe(false);
      expect(canChangeActiveStatus('Responder', 'Investigating')).toBe(false);
    });

    it('allows resolve only when manage + active', () => {
      expect(canResolve('Administrator', 'Monitoring')).toBe(true);
      expect(canResolve('Administrator', 'Resolved')).toBe(false);
      expect(canResolve('Viewer', 'Investigating')).toBe(false);
    });

    it('allows reopen only when manage + Resolved', () => {
      expect(canReopen('IncidentManager', 'Resolved')).toBe(true);
      expect(canReopen('IncidentManager', 'Investigating')).toBe(false);
      expect(canReopen('Responder', 'Resolved')).toBe(false);
    });
  });

  describe('join / leave / written update', () => {
    const respondRoles: UserRole[] = [
      'Responder',
      'IncidentManager',
      'Administrator',
    ];

    it('allows join when respond + active + not member', () => {
      for (const role of respondRoles) {
        expect(canJoin(role, 'Investigating', false)).toBe(true);
        expect(canJoin(role, 'Investigating', true)).toBe(false);
        expect(canJoin(role, 'Resolved', false)).toBe(false);
      }
      expect(canJoin('Viewer', 'Investigating', false)).toBe(false);
    });

    it('allows leave when respond + active + member (not when Resolved)', () => {
      for (const role of respondRoles) {
        expect(canLeave(role, 'Identified', true)).toBe(true);
        expect(canLeave(role, 'Identified', false)).toBe(false);
        expect(canLeave(role, 'Resolved', true)).toBe(false);
      }
      expect(canLeave('Viewer', 'Investigating', true)).toBe(false);
    });

    it('allows written update when respond + active', () => {
      expect(canPostWrittenUpdate('Responder', 'Monitoring')).toBe(true);
      expect(canPostWrittenUpdate('Responder', 'Resolved')).toBe(false);
      expect(canPostWrittenUpdate('Viewer', 'Investigating')).toBe(false);
    });
  });

  describe('create / edit details', () => {
    it('gates create and edit on manage', () => {
      expect(canCreateIncident('IncidentManager')).toBe(true);
      expect(canEditIncidentDetails('Administrator')).toBe(true);
      expect(canCreateIncident('Responder')).toBe(false);
      expect(canEditIncidentDetails('Viewer')).toBe(false);
    });
  });
});
