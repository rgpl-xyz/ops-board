import {
  afterNextRender,
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';

import { HoverCardComponent } from './hover-card.component';

/**
 * Text cut to a few lines, about a paragraph. When it runs longer, the last
 * line ends in "… more", which shows the whole text in a card. The cut is
 * visual only, so assistive technology still reads the whole text in place.
 */
@Component({
  selector: 'ob-clamped-text',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HoverCardComponent],
  host: { '[style.--clamp-lines]': 'lines()' },
  template: `
    <p #paragraph class="clamped">{{ text() }}</p>
    @if (overflows()) {
      <ob-hover-card
        class="more"
        label="more"
        [heading]="heading()"
        [ariaLabel]="moreName()"
      >
        <p class="full">{{ text() }}</p>
      </ob-hover-card>
    }
  `,
  styles: `
    :host {
      display: block;
      position: relative;
    }
    .clamped {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: var(--clamp-lines);
      line-clamp: var(--clamp-lines);
      overflow: hidden;
      margin: 0;
    }
    /* Covers the end of the last line, where the clamp's own ellipsis falls. */
    .more {
      position: absolute;
      right: 0;
      bottom: 0;
      padding-left: 2rem;
      background: linear-gradient(to right, transparent, var(--ob-bg) 1.25rem);
    }
    .more::before {
      content: '… ';
    }
    .full {
      margin: 0;
      max-width: 34rem;
      line-height: 1.6;
    }
  `,
})
export class ClampedTextComponent {
  readonly text = input.required<string>();
  /** What the text is, such as "Description"; it titles the card. */
  readonly heading = input.required<string>();
  readonly lines = input(4);

  protected readonly overflows = signal(false);
  protected readonly moreName = computed(
    () => `More of the ${this.heading().toLowerCase()}`,
  );

  private readonly paragraph =
    viewChild.required<ElementRef<HTMLElement>>('paragraph');

  constructor() {
    // New text can keep the same clamped height, so measure on every change.
    afterRenderEffect({
      read: () => {
        this.text();
        this.lines();
        this.measure();
      },
    });

    // A narrower or wider column moves the line breaks without changing the text.
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => this.measure());
      afterNextRender({
        read: () => observer.observe(this.paragraph().nativeElement),
      });
      inject(DestroyRef).onDestroy(() => observer.disconnect());
    }
  }

  private measure(): void {
    const el = this.paragraph().nativeElement;
    this.overflows.set(el.scrollHeight > el.clientHeight + 1);
  }
}
