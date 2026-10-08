import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

import type { ResponderDto } from '../../../data-access';
import { TimestampPipe } from '../../../shared/pipes/timestamp.pipe';
import { HoverCardComponent } from '../../../shared/ui/hover-card.component';

/** Rows shown before the rest fold into a card. */
const SHOWN = 3;

/**
 * An incident's responders in the order they joined, never more than four
 * rows tall: a longer list shows three and folds the rest into a card. Four
 * show in full, since folding a single name would save no room.
 */
@Component({
  selector: 'ob-responder-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HoverCardComponent, TimestampPipe],
  template: `
    <ul class="responders">
      @for (r of shown(); track r.userId) {
        <li>
          <span>{{ r.displayName }}</span>
          <time class="muted" [attr.datetime]="r.joinedAt">{{ r.joinedAt | obTimestamp }}</time>
        </li>
      }
      @if (folded() > 0) {
        <li>
          <ob-hover-card [label]="moreLabel()" heading="Responders">
            <ul class="responders responders--all">
              @for (r of ordered(); track r.userId) {
                <li>
                  <span>{{ r.displayName }}</span>
                  <time class="muted" [attr.datetime]="r.joinedAt">{{ r.joinedAt | obTimestamp }}</time>
                </li>
              }
            </ul>
          </ob-hover-card>
        </li>
      }
    </ul>
  `,
  styles: `
    .responders {
      list-style: none;
      margin: 0.25rem 0 0;
      padding: 0;
    }
    .responders li {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 0.75rem;
      padding: 0.5rem 0;
      border-bottom: 1px solid var(--ob-rule);
      font-size: 0.92rem;
    }
    .responders li:last-child {
      border-bottom: 0;
    }
    .responders--all {
      min-width: 18rem;
      margin: 0;
    }
  `,
})
export class ResponderListComponent {
  readonly responders = input.required<readonly ResponderDto[]>();

  protected readonly ordered = computed(() =>
    [...this.responders()].sort(
      (a, b) => Date.parse(a.joinedAt) - Date.parse(b.joinedAt),
    ),
  );
  protected readonly shown = computed(() => {
    const all = this.ordered();
    return all.length > SHOWN + 1 ? all.slice(0, SHOWN) : all;
  });
  protected readonly folded = computed(
    () => this.ordered().length - this.shown().length,
  );
  protected readonly moreLabel = computed(
    () => `+${this.folded()} more responders`,
  );
}
