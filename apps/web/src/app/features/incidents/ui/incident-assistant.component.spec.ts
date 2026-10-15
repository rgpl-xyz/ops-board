import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import {
  provideTanStackQuery,
  QueryClient,
} from '@tanstack/angular-query-experimental';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  asRevisionString,
  AssistantApi,
  type IncidentBriefDto,
  type IncidentDetailDto,
  type OpsBoardProblem,
} from '../../../data-access';
import { IncidentAssistantComponent } from './incident-assistant.component';

const incident = (overrides: Partial<IncidentDetailDto> = {}): IncidentDetailDto => ({
  id: 'i1',
  title: 'Checkout failures in EU',
  description: 'Checkout requests are failing for some customers.',
  serviceId: 's1',
  serviceName: 'Checkout API',
  teamId: 't1',
  teamName: 'Payments',
  createdByUserId: 'u1',
  severity: 'High',
  status: 'Investigating',
  createdAt: '2026-10-01T08:00:00Z',
  updatedAt: '2026-10-01T08:30:00Z',
  resolvedAt: null,
  version: asRevisionString('2'),
  lifecycleVersion: asRevisionString('2'),
  ...overrides,
});

const brief = (overrides: Partial<IncidentBriefDto> = {}): IncidentBriefDto => ({
  incidentId: 'i1',
  basedOnVersion: asRevisionString('2'),
  basedOnTimelineCount: 2,
  omittedTimelineEntries: 0,
  generatedAt: '2026-10-01T12:00:00Z',
  provider: 'Groq',
  model: 'openai/gpt-oss-120b',
  simulated: false,
  fromCache: false,
  whatHappened: [{ text: 'Checkout errors rose to 12% after the 09:40 deploy.', refs: ['T2'] }],
  currentState: [{ text: 'The incident is High severity and under investigation.', refs: ['I'] }],
  openQuestions: [{ text: 'The data does not say which change caused the errors.', refs: [] }],
  suggestedChecks: [{ text: 'Compare error rates before and after the deploy.', refs: ['T2'] }],
  sources: [
    {
      ref: 'I',
      label: 'Incident record',
      actor: null,
      occurredAt: '2026-10-01T08:00:00Z',
      detail: 'Checkout failures in EU',
    },
    {
      ref: 'T2',
      label: 'Written update',
      actor: 'Avery Chen',
      occurredAt: '2026-10-01T08:10:00Z',
      detail: 'Checkout errors rose to 12% after the 09:40 deploy.',
    },
  ],
  ...overrides,
});

const problem = (code: OpsBoardProblem['code'], status: number, retryAfterSeconds?: number): OpsBoardProblem => ({
  code,
  status,
  title: 'AI assistance unavailable',
  detail: 'server detail',
  retryAfterSeconds,
});

describe('IncidentAssistantComponent', () => {
  const generateBrief = vi.fn<(id: string, signal?: AbortSignal) => Promise<IncidentBriefDto>>();
  let fixture: ComponentFixture<IncidentAssistantComponent>;

  beforeEach(async () => {
    generateBrief.mockReset();
    await TestBed.configureTestingModule({
      imports: [IncidentAssistantComponent],
      providers: [
        provideTanStackQuery(new QueryClient()),
        { provide: AssistantApi, useValue: { generateBrief } },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    fixture?.destroy();
    fixture?.nativeElement.remove();
  });

  async function render(
    input = incident(),
    timelineCount: number | null = 2,
    simulated = false,
  ): Promise<HTMLElement> {
    fixture = TestBed.createComponent(IncidentAssistantComponent);
    document.body.append(fixture.nativeElement);
    fixture.componentRef.setInput('incident', input);
    fixture.componentRef.setInput('timelineCount', timelineCount);
    if (simulated) {
      fixture.componentRef.setInput('simulated', true);
    }
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  function button(root: HTMLElement, name: string): HTMLButtonElement | undefined {
    return [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === name);
  }

  async function until(check: () => void): Promise<void> {
    await vi.waitFor(() => {
      fixture.detectChanges();
      check();
    });
  }

  async function summarize(root: HTMLElement): Promise<void> {
    button(root, 'Summarize incident')!.click();
    await until(() => expect(root.querySelector('.brief')).not.toBeNull());
  }

  it('offers a summary, then shows the brief in its sections with its sources', async () => {
    generateBrief.mockResolvedValue(brief());
    const root = await render();

    expect(root.textContent).toContain('cites the records it uses');
    await summarize(root);

    expect(generateBrief).toHaveBeenCalledWith('i1', expect.any(AbortSignal));
    const headings = [...root.querySelectorAll('h3')].map((h) => h.textContent?.trim());
    expect(headings).toEqual(['What happened', 'Current state', 'Open questions', 'Suggested next checks']);
    expect(root.textContent).toContain('Checkout errors rose to 12% after the 09:40 deploy.');
    const source = root.querySelector('button[aria-label="Source T2: Written update by Avery Chen"]');
    expect(source?.textContent?.trim()).toBe('T2');
    const card = source?.closest('ob-hover-card')?.querySelector('[popover]');
    expect(card?.textContent).toContain('Avery Chen');
    expect(card?.textContent).toContain('01 Oct 2026, 08:10');
  });

  it('labels the text as AI-generated, naming the model and provider', async () => {
    generateBrief.mockResolvedValue(brief());
    const root = await render();
    await summarize(root);

    expect(root.querySelector('.brief__label')?.textContent).toContain(
      'AI-generated · openai/gpt-oss-120b via Groq',
    );
    expect(root.textContent).toContain('Suggestions, not facts');
  });

  it('says plainly, before and after, when no model writes the brief', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    generateBrief.mockResolvedValue(brief({ simulated: true, provider: 'Fake provider', model: 'rule-based' }));
    const root = await render(incident(), 2, true);

    expect(root.querySelector('.intro')?.textContent).toContain(
      'No AI model is connected here, so the brief is assembled from this incident',
    );
    await summarize(root);

    const label = root.querySelector('.brief__label')?.textContent ?? '';
    expect(label).toContain('Simulated brief, no AI model');
    expect(label).not.toContain('AI-generated');
    button(root, 'Copy brief')!.click();
    await until(() => expect(writeText).toHaveBeenCalled());
    const text = writeText.mock.calls[0][0] as string;
    expect(text.split('\n')[0]).toBe('Brief: Checkout failures in EU');
    expect(text).not.toContain('AI brief');
  });

  it('promises no wait when no model writes the brief', async () => {
    generateBrief.mockReturnValue(new Promise(() => undefined));
    const root = await render(incident(), 2, true);
    button(root, 'Summarize incident')!.click();

    await until(() => expect(root.textContent).toContain('Writing the brief'));
    expect(root.textContent).not.toContain('This can take a few seconds.');
  });

  it('shows markup in a reply as text and never as elements', async () => {
    const markup = '<img src=x onerror=alert(1)> [docs](javascript:alert(1)) <script>alert(1)</script>';
    generateBrief.mockResolvedValue(brief({ currentState: [{ text: markup, refs: ['I'] }] }));
    const root = await render();
    await summarize(root);

    const shown = root.querySelector('.brief') as HTMLElement;
    expect(shown.textContent).toContain(markup);
    expect(shown.querySelector('img, script, a, iframe')).toBeNull();
  });

  it('says when the incident has changed since the brief and offers to regenerate', async () => {
    generateBrief.mockResolvedValue(brief());
    const root = await render();
    await summarize(root);
    expect(root.textContent).not.toContain('changed since this brief');

    fixture.componentRef.setInput('timelineCount', 3);
    fixture.detectChanges();
    expect(root.textContent).toContain('The incident has changed since this brief was written.');

    button(root, 'Regenerate')!.click();
    await until(() => expect(generateBrief).toHaveBeenCalledTimes(2));
  });

  it('treats a new incident revision as a change too', async () => {
    generateBrief.mockResolvedValue(brief());
    const root = await render();
    await summarize(root);

    fixture.componentRef.setInput('incident', incident({ version: asRevisionString('3') }));
    fixture.detectChanges();

    expect(root.textContent).toContain('The incident has changed since this brief was written.');
  });

  it('notes when older timeline entries were left out', async () => {
    generateBrief.mockResolvedValue(brief({ omittedTimelineEntries: 30, basedOnTimelineCount: 80 }));
    const root = await render(incident(), 80);
    await summarize(root);

    expect(root.textContent).toContain('The 30 oldest timeline entries were left out to keep the brief short.');
  });

  const failures: [OpsBoardProblem, string, boolean][] = [
    [problem('assistant_disabled', 503), 'AI assistance is turned off', false],
    [problem('assistant_daily_limit', 429, 5400), "Today's AI allowance is used up. It resets at 00:00 UTC, in about 2 hours.", false],
    [problem('assistant_busy', 429, 5), 'AI assistance is busy. Try again in 5 seconds.', true],
    [problem('assistant_visitor_limit', 429, 360), "You've asked for several new briefs in a short time. Try again in about 6 minutes.", true],
    [problem('assistant_provider_unavailable', 503), "The AI provider isn't responding.", true],
    [problem('assistant_unverified_response', 502), "didn't pass the checks against this incident's records", true],
    [problem('unavailable', 404), 'This incident is no longer available.', false],
    [problem('unknown', 0), 'The brief could not be generated. Check your connection and try again.', true],
  ];

  it.each(failures.map(([error, message, retry]) => [error.code, error, message, retry] as const))(
    'explains %s and offers a retry only where one can help',
    async (_code, error, message, retry) => {
      generateBrief.mockRejectedValue(error);
      const root = await render();
      button(root, 'Summarize incident')!.click();

      await until(() => expect(root.querySelector('[role="alert"]')?.textContent).toContain(message));
      expect(button(root, 'Try again') !== undefined).toBe(retry);
      expect(button(root, 'Summarize incident')).toBeUndefined();
    },
  );

  it('cancels a brief in progress and drops the request', async () => {
    let signal: AbortSignal | undefined;
    generateBrief.mockImplementation((_, s) => {
      signal = s;
      return new Promise(() => undefined);
    });
    const root = await render();
    button(root, 'Summarize incident')!.click();
    await until(() => expect(root.textContent).toContain('Writing the brief… This can take a few seconds.'));

    button(root, 'Cancel')!.click();

    expect(signal?.aborted).toBe(true);
    await until(() => expect(button(root, 'Summarize incident')).toBeDefined());
    expect(root.querySelector('[role="alert"]')).toBeNull();
  });

  it('copies the brief as plain text with its sources', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    generateBrief.mockResolvedValue(brief());
    const root = await render();
    await summarize(root);

    button(root, 'Copy brief')!.click();
    await until(() => expect(root.querySelector('[role="status"]')?.textContent).toContain('Brief copied.'));

    const text = writeText.mock.calls[0][0] as string;
    expect(text).toContain('AI brief: Checkout failures in EU');
    expect(text).toContain('What happened\n- Checkout errors rose to 12% after the 09:40 deploy. [T2]');
    expect(text).toContain('T2 Written update, Avery Chen, 01 Oct 2026, 08:10 UTC: Checkout errors rose');
  });

  it('announces a finished brief and leaves focus where the person moved it', async () => {
    const elsewhere = document.createElement('input');
    document.body.append(elsewhere);
    generateBrief.mockResolvedValue(brief());
    const root = await render();
    button(root, 'Summarize incident')!.click();
    elsewhere.focus();

    await until(() => expect(root.querySelector('[role="status"]')?.textContent).toContain('Incident brief ready.'));
    expect(document.activeElement).toBe(elsewhere);
    elsewhere.remove();
  });

  it('keeps focus in the panel while its controls are replaced', async () => {
    let finish: (value: IncidentBriefDto) => void = () => undefined;
    generateBrief.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    const root = await render();
    const start = button(root, 'Summarize incident')!;
    start.focus();
    start.click();

    await until(() => expect(document.activeElement).toBe(button(root, 'Cancel')));
    finish(brief());
    await until(() => expect(document.activeElement).toBe(root.querySelector('.brief')));
  });

  it('lands focus on the brief even when it arrives before the cancel button renders', async () => {
    generateBrief.mockResolvedValue(brief());
    const root = await render();
    const start = button(root, 'Summarize incident')!;
    start.focus();
    start.click();

    await until(() => expect(document.activeElement).toBe(root.querySelector('.brief')));
  });

  it('starts over when another incident is shown', async () => {
    generateBrief.mockResolvedValue(brief());
    const root = await render();
    await summarize(root);

    fixture.componentRef.setInput('incident', incident({ id: 'i2', title: 'Another incident' }));
    fixture.detectChanges();

    expect(root.querySelector('.brief')).toBeNull();
    expect(button(root, 'Summarize incident')).toBeDefined();
  });
});
