import { describe, expect, it } from 'vitest';

import { HumanizePipe } from './humanize.pipe';
import { TimestampPipe } from './timestamp.pipe';

describe('TimestampPipe', () => {
  const pipe = new TimestampPipe();

  it('formats a server timestamp in UTC', () => {
    expect(pipe.transform('2026-09-10T08:00:00+00:00')).toBe('10 Sep 2026, 08:00');
  });

  it('converts an offset timestamp to UTC and can name the zone', () => {
    expect(pipe.transform('2026-09-10T10:30:00+02:00', true)).toBe('10 Sep 2026, 08:30 UTC');
  });

  it('pads single-digit days so dates align in columns', () => {
    expect(pipe.transform('2026-08-09T08:40:00+00:00')).toBe('09 Aug 2026, 08:40');
  });

  it('renders nothing for a missing value', () => {
    expect(pipe.transform(null)).toBe('');
  });
});

describe('HumanizePipe', () => {
  const pipe = new HumanizePipe();

  it('turns a type name into a sentence-case phrase', () => {
    expect(pipe.transform('IncidentCreated')).toBe('Incident created');
    expect(pipe.transform('ResponderJoined')).toBe('Responder joined');
    expect(pipe.transform('StatusChanged')).toBe('Status changed');
  });

  it('renders nothing for a missing value', () => {
    expect(pipe.transform(undefined)).toBe('');
  });
});
