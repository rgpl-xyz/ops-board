import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  Injector,
  input,
  runInInjectionContext,
  signal,
  untracked,
  viewChild,
  type ElementRef,
} from '@angular/core';
import { injectMutation } from '@tanstack/angular-query-experimental';

import {
  incidentQuestionMutation,
  type IncidentAnswerDto,
  type IncidentDetailDto,
  type OpsBoardProblem,
} from '../../../data-access';
import { TimestampPipe } from '../../../shared/pipes/timestamp.pipe';
import { CalloutComponent } from '../../../shared/ui/callout.component';
import { describeQuestionFailure } from '../utils/brief-failure';
import { SourceRefsComponent } from './source-refs.component';

/** The server's own limit; the field never lets more through. */
const MAX_QUESTION_LENGTH = 300;

interface AskedQuestion {
  readonly question: string;
  readonly answer: IncidentAnswerDto;
}

/**
 * One typed question about the incident at a time, answered by the server
 * from the incident's records and its related incidents. Nothing is
 * remembered between questions. Answers render as plain text, and each
 * sentence opens the records it cites.
 */
@Component({
  selector: 'ob-incident-question',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CalloutComponent, SourceRefsComponent, TimestampPipe],
  templateUrl: './incident-question.component.html',
  styleUrl: './incident-question.component.scss',
})
export class IncidentQuestionComponent {
  readonly incident = input.required<IncidentDetailDto>();
  /** No model is connected, so the panel says answers come from fixed rules. */
  readonly simulated = input(false);

  protected readonly maxLength = MAX_QUESTION_LENGTH;

  private readonly injector = inject(Injector);
  private readonly answerElement = viewChild<ElementRef<HTMLElement>>('answerElement');
  private readonly askOptions = runInInjectionContext(this.injector, () => incidentQuestionMutation());
  protected readonly askMut = injectMutation(() => this.askOptions);

  protected readonly question = signal('');
  protected readonly asked = signal<AskedQuestion | null>(null);
  protected readonly failure = signal<OpsBoardProblem | null>(null);
  protected readonly announcement = signal('');
  private abort: AbortController | null = null;

  private readonly incidentId = computed(() => this.incident().id);

  protected readonly blank = computed(() => this.question().trim().length === 0);
  protected readonly remaining = computed(() => MAX_QUESTION_LENGTH - this.question().length);

  protected readonly failureView = computed(() => {
    const failure = this.failure();
    return failure ? describeQuestionFailure(failure) : null;
  });

  protected readonly label = computed(() => {
    const answer = this.asked()?.answer;
    if (!answer) {
      return '';
    }
    return answer.simulated
      ? `Simulated answer, no AI model (${answer.provider})`
      : `AI-generated · ${answer.model} via ${answer.provider}`;
  });

  protected readonly sources = computed(
    () => new Map((this.asked()?.answer.sources ?? []).map((source) => [source.ref, source])),
  );

  constructor() {
    let shownId: string | null = null;
    effect(() => {
      const id = this.incidentId();
      untracked(() => {
        if (shownId !== null && shownId !== id) {
          this.startOver();
        }
        shownId = id;
      });
    });
    inject(DestroyRef).onDestroy(() => this.abort?.abort());
  }

  protected onInput(event: Event): void {
    this.question.set((event.target as HTMLInputElement).value);
  }

  protected ask(event: Event): void {
    event.preventDefault();
    const question = this.question().trim();
    if (!question || this.askMut.isPending()) {
      return;
    }
    this.abort?.abort();
    const controller = new AbortController();
    this.abort = controller;
    const incidentId = this.incidentId();
    this.failure.set(null);
    this.announcement.set('');

    this.askMut.mutate(
      { incidentId, question, signal: controller.signal },
      {
        onSuccess: (answer) => {
          if (controller.signal.aborted || answer.incidentId !== this.incidentId()) {
            return;
          }
          this.asked.set({ question, answer });
          this.question.set('');
          this.announcement.set('Answer ready.');
          // A panel that scrolls in place may hold the answer out of sight;
          // focus stays in the question box for the next question.
          afterNextRender(
            () => this.answerElement()?.nativeElement.scrollIntoView({ block: 'nearest' }),
            { injector: this.injector },
          );
        },
        onError: (error) => {
          if (!controller.signal.aborted) {
            this.failure.set(error);
          }
        },
      },
    );
  }

  protected cancel(): void {
    this.abort?.abort();
    this.abort = null;
    this.askMut.reset();
  }

  private startOver(): void {
    this.cancel();
    this.question.set('');
    this.asked.set(null);
    this.failure.set(null);
    this.announcement.set('');
  }
}
