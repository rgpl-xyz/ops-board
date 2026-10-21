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
  type IncidentAnswerDto,
  type IncidentDetailDto,
  type OpsBoardProblem,
} from '../../../data-access';
import { IncidentQuestionComponent } from './incident-question.component';

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

const answer = (overrides: Partial<IncidentAnswerDto> = {}): IncidentAnswerDto => ({
  incidentId: 'i1',
  answeredAt: '2026-10-01T12:00:00Z',
  provider: 'Groq',
  model: 'openai/gpt-oss-120b',
  simulated: false,
  answered: true,
  sentences: [{ text: 'Checkout errors rose to 12% after the 09:40 deploy.', refs: ['T2'] }],
  sources: [
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

describe('IncidentQuestionComponent', () => {
  const askQuestion = vi.fn<(id: string, question: string, signal?: AbortSignal) => Promise<IncidentAnswerDto>>();
  let fixture: ComponentFixture<IncidentQuestionComponent>;

  beforeEach(async () => {
    askQuestion.mockReset();
    await TestBed.configureTestingModule({
      imports: [IncidentQuestionComponent],
      providers: [
        provideTanStackQuery(new QueryClient()),
        { provide: AssistantApi, useValue: { askQuestion } },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    fixture?.destroy();
    fixture?.nativeElement.remove();
  });

  async function render(simulated = false): Promise<HTMLElement> {
    fixture = TestBed.createComponent(IncidentQuestionComponent);
    document.body.append(fixture.nativeElement);
    fixture.componentRef.setInput('incident', incident());
    fixture.componentRef.setInput('simulated', simulated);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const input = (root: HTMLElement) => root.querySelector<HTMLInputElement>('input#assistant-question')!;
  const askButton = (root: HTMLElement) =>
    [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Ask')!;
  const text = (element: Element | null) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  function type(root: HTMLElement, value: string): void {
    input(root).value = value;
    input(root).dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  async function ask(root: HTMLElement, value: string): Promise<void> {
    type(root, value);
    askButton(root).click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(askQuestion).toHaveBeenCalled();
      expect(root.querySelector('.answer, [role="alert"]')).not.toBeNull();
    });
  }

  it('asks the typed question and shows the answer with its sources', async () => {
    askQuestion.mockResolvedValue(answer());
    const root = await render();

    await ask(root, '  When did the errors start?  ');

    expect(askQuestion).toHaveBeenCalledWith('i1', 'When did the errors start?', expect.any(AbortSignal));
    const article = root.querySelector('.answer')!;
    expect(text(article)).toContain('AI-generated · openai/gpt-oss-120b via Groq');
    expect(text(article)).toContain('“When did the errors start?”');
    expect(text(article.querySelector('li'))).toContain('Checkout errors rose to 12% after the 09:40 deploy.');
    expect(article.querySelector('button[aria-label="Source T2: Written update by Avery Chen"]')).not.toBeNull();
    expect(input(root).value).toBe('');
    expect(text(root.querySelector('[role="status"]'))).toBe('Answer ready.');
  });

  it('brings a new answer into view without taking focus from the question', async () => {
    askQuestion.mockResolvedValue(answer());
    const scrolled = vi.fn();
    const original = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = function (this: HTMLElement) {
      scrolled(this);
    };
    try {
      const root = await render();
      input(root).focus();

      await ask(root, 'What happened?');
      await vi.waitFor(() => expect(scrolled).toHaveBeenCalled());

      expect(scrolled.mock.calls.at(-1)?.[0]).toBe(root.querySelector('.answer'));
      expect(document.activeElement).toBe(input(root));
    } finally {
      HTMLElement.prototype.scrollIntoView = original;
    }
  });

  it('says the records do not say when they do not answer the question', async () => {
    askQuestion.mockResolvedValue(answer({ answered: false, sentences: [], sources: [] }));
    const root = await render();

    await ask(root, 'What will the weather be?');

    expect(text(root.querySelector('.answer'))).toContain("The records don't say.");
    expect(root.querySelector('.answer li')).toBeNull();
  });

  it('says when no AI model is connected and answers come from fixed rules', async () => {
    askQuestion.mockResolvedValue(answer({ simulated: true, provider: 'Fake provider', model: 'rule-based' }));
    const root = await render(true);

    expect(text(root)).toContain('No AI model is connected here');
    await ask(root, 'What is the status?');

    expect(text(root.querySelector('.answer'))).toContain('Simulated answer, no AI model (Fake provider)');
  });

  it('sends no blank question and counts the characters left', async () => {
    const root = await render();

    expect(input(root).maxLength).toBe(300);
    expect(askButton(root).disabled).toBe(true);
    expect(text(root.querySelector('#assistant-question-hint'))).toBe('300 characters left');
    type(root, '   ');
    expect(askButton(root).disabled).toBe(true);
    type(root, 'Why?');

    expect(askButton(root).disabled).toBe(false);
    expect(text(root.querySelector('#assistant-question-hint'))).toBe('296 characters left');
    expect(askQuestion).not.toHaveBeenCalled();
  });

  it('explains a question turned away by its limit, keeping the question to send again', async () => {
    askQuestion.mockRejectedValue(problem('assistant_question_limit', 429, 300));
    const root = await render();

    await ask(root, 'What happened?');

    expect(text(root.querySelector('[role="alert"]'))).toBe(
      "You've asked several questions in a short time. Try again in about 5 minutes.",
    );
    expect(input(root).value).toBe('What happened?');
  });

  it('explains an answer refused by the checks', async () => {
    askQuestion.mockRejectedValue(problem('assistant_unverified_response', 502));
    const root = await render();

    await ask(root, 'What happened?');

    expect(text(root.querySelector('[role="alert"]'))).toContain("didn't pass the checks against the records");
  });

  it('shows markup in an answer as text, never as markup', async () => {
    askQuestion.mockResolvedValue(
      answer({ sentences: [{ text: '<img src=x onerror="window.__injected=1"> **bold** [docs](javascript:alert(1))', refs: ['T2'] }] }),
    );
    const root = await render();

    await ask(root, 'What happened?');

    const item = root.querySelector('.answer li')!;
    expect(item.textContent).toContain('<img src=x onerror="window.__injected=1">');
    expect(item.querySelector('img, a, strong')).toBeNull();
  });

  it('starts over when another incident is shown', async () => {
    askQuestion.mockResolvedValue(answer());
    const root = await render();
    await ask(root, 'What happened?');

    fixture.componentRef.setInput('incident', incident({ id: 'i2' }));
    fixture.detectChanges();

    expect(root.querySelector('.answer')).toBeNull();
  });
});
