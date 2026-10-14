import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  runInInjectionContext,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { injectMutation } from '@tanstack/angular-query-experimental';

import {
  incidentBriefMutation,
  type BriefSourceDto,
  type BriefStatementDto,
  type IncidentBriefDto,
  type IncidentDetailDto,
  type OpsBoardProblem,
} from '../../../data-access';
import { focusWhenRendered } from '../../../shared/a11y/focus';
import { TimestampPipe } from '../../../shared/pipes/timestamp.pipe';
import { CalloutComponent } from '../../../shared/ui/callout.component';
import { HoverCardComponent } from '../../../shared/ui/hover-card.component';
import { describeBriefFailure } from '../utils/brief-failure';

interface BriefSection {
  readonly title: string;
  readonly statements: readonly BriefStatementDto[];
  /** Advice rather than facts, and labelled so. */
  readonly suggestions: boolean;
}

/**
 * A brief of one incident, on request, written by an AI model or, with none
 * connected, assembled by fixed rules. Everything shown comes from the
 * server's checked reply and renders as plain text; each statement links to
 * the records it cites. The label says which of the two wrote it.
 */
@Component({
  selector: 'ob-incident-assistant',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(focusout)': 'onFocusOut($event)' },
  imports: [CalloutComponent, HoverCardComponent, TimestampPipe],
  templateUrl: './incident-assistant.component.html',
  styleUrl: './incident-assistant.component.scss',
})
export class IncidentAssistantComponent {
  readonly incident = input.required<IncidentDetailDto>();
  /** All timeline entries the incident has now; a brief built from fewer is stale. */
  readonly timelineCount = input<number | null>(null);
  /** No model is connected, so the panel says so before a brief is asked for. */
  readonly simulated = input(false);

  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly timestamp = new TimestampPipe();
  private readonly startButton = viewChild<ElementRef<HTMLButtonElement>>('startButton');
  private readonly cancelButton = viewChild<ElementRef<HTMLButtonElement>>('cancelButton');
  private readonly retryButton = viewChild<ElementRef<HTMLButtonElement>>('retryButton');
  private readonly briefElement = viewChild<ElementRef<HTMLElement>>('briefElement');
  private readonly failureElement = viewChild<ElementRef<HTMLElement>>('failureElement');

  private readonly briefOptions = runInInjectionContext(this.injector, () => incidentBriefMutation());
  protected readonly briefMut = injectMutation(() => this.briefOptions);

  /** The brief on screen. It stays while a newer one is written or fails. */
  protected readonly brief = signal<IncidentBriefDto | null>(null);
  protected readonly failure = signal<OpsBoardProblem | null>(null);
  protected readonly announcement = signal('');
  private abort: AbortController | null = null;
  /**
   * Focus was in the panel when a request started, so it follows the controls
   * the request replaces, unless the person moves it out of the panel first.
   */
  private followFocus = false;

  private readonly incidentId = computed(() => this.incident().id);

  protected readonly failureView = computed(() => {
    const failure = this.failure();
    return failure ? describeBriefFailure(failure) : null;
  });

  protected readonly label = computed(() => {
    const brief = this.brief();
    if (!brief) {
      return '';
    }
    return brief.simulated
      ? `Simulated brief, no AI model (${brief.provider})`
      : `AI-generated · ${brief.model} via ${brief.provider}`;
  });

  protected readonly stale = computed(() => {
    const brief = this.brief();
    const count = this.timelineCount();
    return (
      brief !== null &&
      (brief.basedOnVersion !== this.incident().version ||
        (count !== null && count !== brief.basedOnTimelineCount))
    );
  });

  protected readonly sections = computed<readonly BriefSection[]>(() => {
    const brief = this.brief();
    return brief
      ? [
          { title: 'What happened', statements: brief.whatHappened, suggestions: false },
          { title: 'Current state', statements: brief.currentState, suggestions: false },
          { title: 'Open questions', statements: brief.openQuestions, suggestions: false },
          { title: 'Suggested next checks', statements: brief.suggestedChecks, suggestions: true },
        ]
      : [];
  });

  protected readonly sources = computed(
    () => new Map((this.brief()?.sources ?? []).map((source) => [source.ref, source])),
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

  protected summarize(): void {
    const focusWasHere = this.hasFocus();
    this.followFocus = focusWasHere;
    this.abort?.abort();
    const controller = new AbortController();
    this.abort = controller;
    this.failure.set(null);
    this.announcement.set('');

    this.briefMut.mutate(
      { incidentId: this.incidentId(), signal: controller.signal },
      {
        onSuccess: (brief) => {
          if (controller.signal.aborted || brief.incidentId !== this.incidentId()) {
            return;
          }
          const keepFocus = this.shouldFollowFocus();
          this.brief.set(brief);
          this.announcement.set('Incident brief ready.');
          if (keepFocus) {
            focusWhenRendered(() => this.briefElement()?.nativeElement);
          }
        },
        onError: (error) => {
          if (controller.signal.aborted) {
            return;
          }
          const keepFocus = this.shouldFollowFocus();
          this.failure.set(error);
          if (keepFocus) {
            focusWhenRendered(
              () => this.retryButton()?.nativeElement ?? this.failureElement()?.nativeElement,
            );
          }
        },
      },
    );
    // The control that had focus is replaced once the request shows as pending.
    if (focusWasHere) {
      focusWhenRendered(() => this.cancelButton()?.nativeElement);
    }
  }

  protected cancel(): void {
    const focusWasHere = this.hasFocus();
    this.abort?.abort();
    this.abort = null;
    this.briefMut.reset();
    if (focusWasHere) {
      focusWhenRendered(() => this.startButton()?.nativeElement ?? this.briefElement()?.nativeElement);
    }
  }

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.plainText());
      this.announcement.set('Brief copied.');
    } catch {
      this.announcement.set('Copying failed. Select the brief text to copy it instead.');
    }
  }

  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget;
    if (next instanceof Node && !this.host.nativeElement.contains(next)) {
      this.followFocus = false;
    }
  }

  protected sourceName(source: BriefSourceDto): string {
    return source.actor
      ? `Source ${source.ref}: ${source.label} by ${source.actor}`
      : `Source ${source.ref}: ${source.label}`;
  }

  /** The brief as text people can paste anywhere, sources included. */
  private plainText(): string {
    const brief = this.brief();
    if (!brief) {
      return '';
    }
    const lines = [
      `${brief.simulated ? 'Brief' : 'AI brief'}: ${this.incident().title}`,
      `${this.label()} · ${this.timestamp.transform(brief.generatedAt, true)}`,
    ];
    for (const section of this.sections()) {
      lines.push('', section.title);
      lines.push(
        ...(section.statements.length === 0
          ? ['- None noted.']
          : section.statements.map(
              (s) => `- ${s.text}${s.refs.length ? ` [${s.refs.join(', ')}]` : ''}`,
            )),
      );
    }
    lines.push('', 'Sources');
    for (const source of brief.sources) {
      const who = source.actor ? `, ${source.actor}` : '';
      const when = this.timestamp.transform(source.occurredAt, true);
      lines.push(`${source.ref} ${source.label}${who}, ${when}${source.detail ? `: ${source.detail}` : ''}`);
    }
    return lines.join('\n');
  }

  private startOver(): void {
    this.abort?.abort();
    this.abort = null;
    this.briefMut.reset();
    this.brief.set(null);
    this.failure.set(null);
    this.announcement.set('');
  }

  private hasFocus(): boolean {
    return this.host.nativeElement.contains(document.activeElement);
  }

  /** A removed control leaves focus on the body; that still counts as the panel's. */
  private shouldFollowFocus(): boolean {
    const active = document.activeElement;
    return this.followFocus && (this.hasFocus() || active === null || active === document.body);
  }
}
