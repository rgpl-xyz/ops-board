import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import type { BriefSourceDto } from '../../../data-access';
import { TimestampPipe } from '../../../shared/pipes/timestamp.pipe';
import { HoverCardComponent } from '../../../shared/ui/hover-card.component';

/**
 * The sources a generated statement cites, each a small button that opens a
 * card describing the record. Cards come from the server's description of
 * stored data, never from generated text, and a ref with no source shows nothing.
 */
@Component({
  selector: 'ob-source-refs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HoverCardComponent, TimestampPipe],
  template: `
    @for (ref of refs(); track ref) {
      @if (sources().get(ref); as source) {
        <ob-hover-card class="ref" [label]="ref" [heading]="'Source ' + ref" [ariaLabel]="sourceName(source)">
          <p class="source__what">
            {{ source.label }}@if (source.actor) {<span> · {{ source.actor }}</span>}
          </p>
          <p class="source__when">
            <time [attr.datetime]="source.occurredAt">{{ source.occurredAt | obTimestamp: true }}</time>
          </p>
          @if (source.detail) {
            <p class="source__detail">{{ source.detail }}</p>
          }
        </ob-hover-card>
      }
    }
  `,
  styles: `
    /* A statement's sources wrap as one group, never one letter to a line. */
    :host {
      white-space: nowrap;
    }
    .ref {
      margin-left: 0.3rem;
      font-family: var(--ob-font-mono);
      font-size: 0.78rem;
    }
    .source__what,
    .source__when,
    .source__detail {
      margin: 0;
      font-size: 0.86rem;
    }
    .source__when {
      margin-top: 0.15rem;
      color: var(--ob-muted);
      font-family: var(--ob-font-mono);
      font-size: 0.72rem;
    }
    /* A timeline update keeps its own line breaks. */
    .source__detail {
      max-width: 30rem;
      margin-top: 0.4rem;
      color: var(--ob-ink-2);
      white-space: pre-wrap;
    }
  `,
})
export class SourceRefsComponent {
  readonly refs = input.required<readonly string[]>();
  readonly sources = input.required<ReadonlyMap<string, BriefSourceDto>>();

  protected sourceName(source: BriefSourceDto): string {
    return source.actor
      ? `Source ${source.ref}: ${source.label} by ${source.actor}`
      : `Source ${source.ref}: ${source.label}`;
  }
}
