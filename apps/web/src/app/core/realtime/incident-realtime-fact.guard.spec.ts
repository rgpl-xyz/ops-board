import { describe, expect, it } from 'vitest';

import {
  INCIDENT_REALTIME_FACT_KINDS,
  type IncidentRealtimeFact,
} from './incident-realtime-fact';
import { validateIncidentFact } from './incident-realtime-fact.guard';

const goldenFact = {
  organizationId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  incidentId: '11111111-2222-3333-4444-555555555555',
  kind: 'IncidentCreated',
  version: '1',
  lifecycleVersion: '1',
  occurredAtUtc: '2026-09-16T12:00:00Z',
} as const;

const {
  version: _goldenVersion,
  lifecycleVersion: _goldenLifecycleVersion,
  ...factWithoutRevisions
} = goldenFact;
const { occurredAtUtc: _goldenOccurredAtUtc, ...factWithoutOccurredAtUtc } =
  goldenFact;

describe('validateIncidentFact', () => {
  it('accepts the golden fact payload', () => {
    expect(validateIncidentFact(goldenFact)).toEqual(goldenFact);
  });

  it.each(INCIDENT_REALTIME_FACT_KINDS)('accepts %s', (kind) => {
    expect(validateIncidentFact({ ...goldenFact, kind })).toEqual({
      ...goldenFact,
      kind,
    });
  });

  it.each([
    ['null', null],
    ['array', []],
    ['string', 'fact'],
    ['number', 1],
    ['boolean', true],
  ])('rejects non-object input: %s', (_description, value) => {
    expect(validateIncidentFact(value)).toBeNull();
  });

  it.each([
    ['missing organizationId', { ...goldenFact, organizationId: undefined }],
    ['invalid organizationId', { ...goldenFact, organizationId: 'not-a-uuid' }],
    ['missing incidentId', { ...goldenFact, incidentId: undefined }],
    ['invalid incidentId', { ...goldenFact, incidentId: 'not-a-uuid' }],
    ['missing kind', { ...goldenFact, kind: undefined }],
    ['unknown kind', { ...goldenFact, kind: 'ServiceHealthChanged' }],
  ])('rejects required-field issue: %s', (_description, value) => {
    expect(validateIncidentFact(value)).toBeNull();
  });

  it.each([
    ['omitted', factWithoutRevisions],
    ['null', { ...goldenFact, version: null, lifecycleVersion: null }],
    ['strings', { ...goldenFact, version: '42', lifecycleVersion: '7' }],
  ])('accepts optional revision values: %s', (_description, value) => {
    expect(validateIncidentFact(value)).toEqual(value);
  });

  it.each([
    ['version number', { version: 1 }],
    ['version object', { version: {} }],
    ['lifecycleVersion boolean', { lifecycleVersion: false }],
    ['lifecycleVersion array', { lifecycleVersion: [] }],
  ])('rejects invalid revision value: %s', (_description, changes) => {
    expect(validateIncidentFact({ ...goldenFact, ...changes })).toBeNull();
  });

  it.each([
    ['omitted', undefined, true],
    ['valid UTC date', '2026-09-16T12:00:00Z', true],
    ['invalid date', 'not-a-date', false],
    ['null', null, false],
    ['number', 1, false],
  ])('validates occurredAtUtc: %s', (_description, occurredAtUtc, isValid) => {
    const fact = validateIncidentFact({ ...goldenFact, occurredAtUtc });

    if (isValid) {
      expect(fact).toEqual(
        occurredAtUtc === undefined
          ? (factWithoutOccurredAtUtc as IncidentRealtimeFact)
          : { ...goldenFact, occurredAtUtc },
      );
    } else {
      expect(fact).toBeNull();
    }
  });
});
