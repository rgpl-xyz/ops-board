import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  provideTanStackQuery,
  QueryClient,
} from '@tanstack/angular-query-experimental';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  IncidentsApi,
  type RelatedIncidentDto,
  type RelatedIncidentsDto,
} from '../../../data-access';
import { RelatedIncidentsComponent } from './related-incidents.component';

const related = (overrides: Partial<RelatedIncidentDto> = {}): RelatedIncidentDto => ({
  id: 'i2',
  title: 'Card authorizations timing out at the payment provider',
  serviceName: 'Payment Processor',
  teamName: 'Payments',
  severity: 'Critical',
  status: 'Resolved',
  createdAt: '2026-09-05T08:30:00Z',
  resolvedAt: '2026-09-05T09:20:00Z',
  sameService: true,
  sameTeam: true,
  sharedWords: ['Card', 'payments'],
  ...overrides,
});

describe('RelatedIncidentsComponent', () => {
  const listRelated = vi.fn<(id: string) => Promise<RelatedIncidentsDto>>();
  let fixture: ComponentFixture<RelatedIncidentsComponent>;

  beforeEach(async () => {
    listRelated.mockReset();
    await TestBed.configureTestingModule({
      imports: [RelatedIncidentsComponent],
      providers: [
        provideRouter([]),
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false } } })),
        { provide: IncidentsApi, useValue: { listRelated } },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    fixture?.destroy();
  });

  async function render(settled: (root: HTMLElement) => void): Promise<HTMLElement> {
    fixture = TestBed.createComponent(RelatedIncidentsComponent);
    fixture.componentRef.setInput('incidentId', 'i1');
    const root = fixture.nativeElement as HTMLElement;
    await vi.waitFor(() => {
      fixture.detectChanges();
      settled(root);
    });
    return root;
  }

  const items = (root: HTMLElement) => [...root.querySelectorAll('li')];
  const text = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, ' ').trim();

  it('lists the related incidents in the order given, each linking to it with why it was picked', async () => {
    listRelated.mockResolvedValue({
      items: [
        related(),
        related({
          id: 'i3',
          title: 'Refunds stuck in pending overnight',
          severity: 'Medium',
          sharedWords: [],
        }),
      ],
    });

    const root = await render((r) => expect(items(r)).toHaveLength(2));

    expect(listRelated).toHaveBeenCalledWith('i1');
    const [first, second] = items(root);
    const link = first.querySelector('a')!;
    expect(text(link)).toBe('Card authorizations timing out at the payment provider');
    expect(link.getAttribute('href')).toBe('/incidents/i2');
    expect(text(first)).toContain('Critical');
    expect(text(first)).toContain('Resolved');
    expect(text(first)).toContain('Payment Processor');
    expect(text(first)).toContain('Same service, and both titles mention “Card” and “payments”.');
    expect(text(second)).toContain('Same service.');
  });

  it('names the team, or only the shared words, when the service differs', async () => {
    listRelated.mockResolvedValue({
      items: [
        related({ id: 'i4', sameService: false, sharedWords: ['failing'] }),
        related({ id: 'i5', sameService: false, sameTeam: false, sharedWords: ['failing', 'EU'] }),
      ],
    });

    const root = await render((r) => expect(items(r)).toHaveLength(2));

    expect(text(items(root)[0])).toContain('Same team (Payments), and both titles mention “failing”.');
    expect(text(items(root)[1])).toContain('Both titles mention “failing” and “EU”.');
  });

  it('says the list is picked by fixed rules rather than AI', async () => {
    listRelated.mockResolvedValue({ items: [related()] });

    const root = await render((r) => expect(items(r)).toHaveLength(1));

    expect(text(root)).toContain('Picked by fixed rules, not AI');
  });

  it('says so when no other incident is related', async () => {
    listRelated.mockResolvedValue({ items: [] });

    const root = await render((r) => expect(text(r)).toContain('No related incidents'));

    expect(items(root)).toHaveLength(0);
  });

  it('says so when the list cannot load', async () => {
    listRelated.mockRejectedValue({ code: 'unavailable', status: 404, title: 'Unavailable' });

    const root = await render((r) => expect(text(r)).toContain('Could not load related incidents.'));

    expect(root.querySelector('[role="alert"]')).not.toBeNull();
  });
});
